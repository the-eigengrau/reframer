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

// Break text into display rows: split on hard newlines, then wrap each
// paragraph at `cap` characters. Mirrors the cursor math in cursorRowCol.
export function displayLines(text: string, cap: number): string[] {
  const rows: string[] = [];
  for (const para of text.split('\n')) {
    if (para.length === 0) {
      rows.push('');
      continue;
    }
    for (let i = 0; i < para.length; i += cap) {
      rows.push(para.slice(i, i + cap));
    }
  }
  return rows;
}

// Map a cursor offset within the buffer to its display row/column, using the
// same wrapping rules as displayLines so the rendered caret lands correctly.
export function cursorRowCol(text: string, cursor: number, cap: number): { row: number; col: number } {
  let row = 0;
  let col = 0;
  for (let i = 0; i < cursor; i++) {
    if (text[i] === '\n') {
      row++;
      col = 0;
    } else {
      col++;
      if (col === cap) {
        row++;
        col = 0;
      }
    }
  }
  return { row, col };
}

function rawInput(opts: VimInputOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let cursor = 0;
    let lastCursorRow = 0;
    let hasKeypress = false;
    let errorMsg = '';
    // Bracketed-paste state: while `pasting`, newlines are inserted into the
    // buffer instead of submitting. `pasteCarriage` collapses CRLF to one \n.
    let pasting = false;
    let pasteCarriage = false;
    const wasRaw = process.stdin.isRaw;

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      // Enable bracketed paste so the terminal brackets pasted text and we can
      // tell pasted newlines apart from a real Enter keypress.
      process.stdout.write('\x1b[?2004h');
    }
    process.stdin.resume();

    function render() {
      // Clear previous output
      if (lastCursorRow > 0) {
        process.stdout.write(`\x1b[${lastCursorRow}A`);
      }
      process.stdout.write('\r\x1b[J');

      const cap = getContentWidth(PREFIX_WIDTH);
      const lines = displayLines(buffer, cap);

      // Ensure cursor has a rendered line to land on
      const { row: cursorRow, col: cursorColRaw } = cursorRowCol(buffer, cursor, cap);
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
      const cursorCol = cursorColRaw + PREFIX_WIDTH;
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
      if (process.stdin.isTTY) {
        process.stdout.write('\x1b[?2004l');
        process.stdin.setRawMode(wasRaw ?? false);
      }
    }

    function onKeypress(_ch: string | undefined, key: readline.Key | undefined) {
      hasKeypress = true;
      errorMsg = '';

      // --- Bracketed paste handling ---
      // The terminal wraps pasted content in paste-start/paste-end markers.
      // While pasting we insert characters verbatim (newlines included) and
      // defer rendering until the paste completes, so a multi-line paste never
      // submits the prompt — the user submits explicitly with Enter afterwards.
      if (key?.name === 'paste-start') {
        pasting = true;
        pasteCarriage = false;
        return;
      }
      if (key?.name === 'paste-end') {
        pasting = false;
        pasteCarriage = false;
        render();
        return;
      }
      if (pasting) {
        let ins = '';
        if (key?.name === 'return') {
          // CR inside a paste — start of a possible CRLF pair.
          ins = '\n';
          pasteCarriage = true;
        } else if (key?.name === 'enter') {
          // LF: skip it if it immediately follows a CR (collapse CRLF to one \n).
          if (!pasteCarriage) ins = '\n';
          pasteCarriage = false;
        } else if (typeof _ch === 'string' && !key?.ctrl && !key?.meta) {
          ins = _ch === '\t' ? ' ' : _ch;
          pasteCarriage = false;
        } else {
          pasteCarriage = false;
        }
        if (ins) {
          buffer = buffer.slice(0, cursor) + ins + buffer.slice(cursor);
          cursor += ins.length;
        }
        return;
      }

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
  const tmpFile = join(tmpdir(), `reframer-${randomUUID()}.txt`);
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
