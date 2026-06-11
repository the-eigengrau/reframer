import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { colors } from './theme.js';
import { showHelp } from './help.js';
import { getContentWidth, wrapPlain } from './text.js';
import { t } from '../i18n/index.js';

interface VimInputOptions {
  message?: string;
  validate?: (value: string) => boolean | string;
  helpKey?: string;
}

const PREFIX = '  › ';
const INDENT = '    ';
const PREFIX_WIDTH = 4;

function formatSubmittedAnswer(answer: string): string {
  const width = getContentWidth(PREFIX_WIDTH);
  const isMultiline = answer.includes('\n');
  const content = isMultiline ? answer.split('\n')[0] : answer;
  const segments = wrapPlain(content, width);
  const lines = segments.map(
    (seg, i) => (i === 0 ? PREFIX : INDENT) + colors.white(seg),
  );
  if (isMultiline) {
    const last = segments[segments.length - 1];
    if (last.length + 4 <= width) {
      lines[lines.length - 1] += colors.dim(' ...');
    } else {
      lines.push(INDENT + colors.dim('...'));
    }
  }
  return lines.join('\n');
}

function rawInput(opts: VimInputOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let cursor = 0;
    let lastCursorRow = 0;
    let hasKeypress = false;
    let errorMsg = '';
    const wasRaw = process.stdin.isRaw;

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    function wrapBuffer(text: string, cap: number): string[] {
      if (text.length === 0) return [''];
      const lines: string[] = [];
      for (let i = 0; i < text.length; i += cap) {
        lines.push(text.slice(i, i + cap));
      }
      return lines;
    }

    function render() {
      // Clear previous output
      if (lastCursorRow > 0) {
        process.stdout.write(`\x1b[${lastCursorRow}A`);
      }
      process.stdout.write('\r\x1b[J');

      const cap = getContentWidth(PREFIX_WIDTH);
      const lines = wrapBuffer(buffer, cap);

      // Ensure cursor has a rendered line to land on
      const cursorRow = Math.floor(cursor / cap);
      while (lines.length <= cursorRow) lines.push('');

      // Build output
      const hintText = !hasKeypress && buffer.length === 0
        ? colors.subtle(`${opts.helpKey ? `${t().help.hint}  ` : ''}ctrl+g for vim`)
        : '';

      for (let i = 0; i < lines.length; i++) {
        const prefix = i === 0 ? PREFIX : INDENT;
        const lineText = lines[i];
        if (i > 0) process.stdout.write('\n');
        process.stdout.write(prefix + lineText);
        if (i === 0 && hintText && buffer.length === 0) {
          process.stdout.write(hintText);
        }
      }

      if (errorMsg) {
        process.stdout.write('\n' + INDENT + colors.error(errorMsg));
      }

      // Position cursor
      const cursorCol = (cursor % cap) + PREFIX_WIDTH;
      const totalLines = errorMsg ? lines.length + 1 : lines.length;
      const lastLine = totalLines - 1;

      // Move cursor up from bottom to cursorRow
      const upMoves = lastLine - cursorRow;
      if (upMoves > 0) {
        process.stdout.write(`\x1b[${upMoves}A`);
      }
      process.stdout.write(`\r\x1b[${cursorCol}C`);
      lastCursorRow = cursorRow;
    }

    function renderDone(answer: string) {
      // Clear and show final state
      if (lastCursorRow > 0) {
        process.stdout.write(`\x1b[${lastCursorRow}A`);
      }
      process.stdout.write('\r\x1b[J');

      process.stdout.write(formatSubmittedAnswer(answer) + '\n');
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdout.removeListener('resize', render);
      if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false);
    }

    function onKeypress(_ch: string | undefined, key: readline.Key | undefined) {
      hasKeypress = true;
      errorMsg = '';

      if (key?.ctrl && key.name === 'c') {
        cleanup();
        // Clear the line and show nothing
        if (lastCursorRow > 0) {
          process.stdout.write(`\x1b[${lastCursorRow}A`);
        }
        process.stdout.write('\r\x1b[J');
        reject(new Error('User cancelled'));
        return;
      }

      if (key?.ctrl && key.name === 'g') {
        cleanup();
        // Clear current prompt
        if (lastCursorRow > 0) {
          process.stdout.write(`\x1b[${lastCursorRow}A`);
        }
        process.stdout.write('\r\x1b[J');
        resolve('\x07CTRL_G');
        return;
      }

      if (key?.name === 'return') {
        // Validate
        if (opts.validate) {
          const result = opts.validate(buffer);
          if (typeof result === 'string') {
            errorMsg = result;
            render();
            return;
          }
        }
        cleanup();
        renderDone(buffer);
        resolve(buffer);
        return;
      }

      if (key?.name === 'backspace') {
        if (cursor > 0) {
          buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
          cursor--;
        }
      } else if (key?.name === 'delete') {
        if (cursor < buffer.length) {
          buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
        }
      } else if (key?.name === 'left') {
        if (cursor > 0) cursor--;
      } else if (key?.name === 'right') {
        if (cursor < buffer.length) cursor++;
      } else if (key?.name === 'home' || (key?.ctrl && key.name === 'a')) {
        cursor = 0;
      } else if (key?.name === 'end' || (key?.ctrl && key.name === 'e')) {
        cursor = buffer.length;
      } else if (key?.ctrl && key.name === 'u') {
        buffer = '';
        cursor = 0;
      } else if (_ch && !key?.ctrl && !key?.meta) {
        // Printable character
        buffer = buffer.slice(0, cursor) + _ch + buffer.slice(cursor);
        cursor += _ch.length;
      } else {
        // Ignore other keys
        return;
      }

      render();
    }

    process.stdin.on('keypress', onKeypress);
    process.stdout.on('resize', render);

    // Initial render
    render();
  });
}

export async function vimInput(opts: VimInputOptions): Promise<string> {
  while (true) {
    try {
      const result = await rawInput(opts);

      if (result === '\x07CTRL_G') {
        const editorResult = openInEditor();
        if (editorResult.trim()) {
          const trimmed = editorResult.trim();
          console.log(formatSubmittedAnswer(trimmed));
          return trimmed;
        }
        // Empty result, re-show prompt
        continue;
      }

      if (result.trim() === '/help' && opts.helpKey) {
        showHelp(opts.helpKey);
        continue;
      }

      return result;
    } catch (err) {
      if (err instanceof Error && err.message === 'User cancelled') {
        process.exit(0);
      }
      throw err;
    }
  }
}

function openInEditor(): string {
  const editor = process.env.EDITOR || process.env.VISUAL || 'vim';
  const tmpFile = join(tmpdir(), `rationalizer-${randomUUID()}.txt`);
  writeFileSync(tmpFile, '', { encoding: 'utf-8', mode: 0o600 });

  spawnSync(editor, [tmpFile], { stdio: 'inherit' });

  try {
    const content = readFileSync(tmpFile, 'utf-8');
    unlinkSync(tmpFile);
    return content;
  } catch {
    return '';
  }
}
