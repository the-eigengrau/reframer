/**
 * Usable content width for wrapped output: terminal columns minus the indent,
 * minus one column reserved so a full line never triggers the terminal's own
 * auto-wrap (which would break left alignment).
 */
export function getContentWidth(indentWidth: number, max = Infinity): number {
  const cols = process.stdout.columns || 80;
  return Math.max(Math.min(cols - indentWidth - 1, max), 10);
}

/**
 * Word-aware wrap returning plain lines without indentation. Paragraph breaks
 * ('\n') are preserved as empty lines; words longer than `width` are
 * hard-broken. Must be called on plain text — ANSI codes inflate `.length`,
 * so colorize after wrapping, never before.
 */
export function wrapPlain(text: string, width: number): string[] {
  const lines: string[] = [];

  for (const para of text.split('\n')) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }
    let currentLine = '';
    for (let word of para.split(' ')) {
      if (word === '') continue;
      const needed = currentLine === '' ? word.length : currentLine.length + 1 + word.length;
      if (needed > width && currentLine !== '') {
        lines.push(currentLine);
        currentLine = '';
      }
      while (word.length > width) {
        lines.push(word.slice(0, width));
        word = word.slice(width);
      }
      currentLine = currentLine === '' ? word : currentLine + ' ' + word;
    }
    if (currentLine !== '') lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * Wrap with a distinct first-line prefix and continuation indent (e.g.
 * '  › ' then '    '). `width` measures content only, excluding the
 * prefix/indent. Optional `colorize` is applied per line, after wrapping.
 */
export function wrapWithPrefix(
  text: string,
  prefix: string,
  indent: string,
  width: number,
  colorize?: (s: string) => string,
): string {
  return wrapPlain(text, width)
    .map((line, i) => {
      if (line === '') return '';
      const lead = i === 0 ? prefix : indent;
      return lead + (colorize ? colorize(line) : line);
    })
    .join('\n');
}

export function wrapText(text: string, width: number, indent: string): string {
  return wrapWithPrefix(text, indent, indent, width);
}

export interface StreamWrapper {
  push(text: string): void;
  flush(): void;
}

/**
 * Word-buffered wrapper for streamed text: holds the current word and wraps
 * before printing a word that would cross `width`, so words never spill past
 * the terminal edge mid-stream. Call `flush()` after the stream ends to emit
 * the trailing word.
 */
export function createStreamWrapper(opts: {
  width: number;
  indent: string;
  write: (s: string) => void;
  colorize?: (s: string) => string;
}): StreamWrapper {
  const { width, indent, write } = opts;
  const colorize = opts.colorize ?? ((s: string) => s);
  let col = 0;
  let word = '';

  function newline() {
    write('\n' + indent);
    col = 0;
  }

  function flushWord() {
    if (word === '') return;
    if (col > 0 && col + word.length > width) {
      newline();
    }
    while (word.length > width) {
      write(colorize(word.slice(0, width)));
      newline();
      word = word.slice(width);
    }
    write(colorize(word));
    col += word.length;
    word = '';
  }

  return {
    push(text: string) {
      for (const ch of text) {
        if (ch === '\n') {
          flushWord();
          newline();
        } else if (ch === ' ') {
          flushWord();
          // Swallow spaces at the margins: at col 0 they would mis-indent
          // the line, at col >= width the wrap is deferred to the next word.
          if (col > 0 && col < width) {
            write(' ');
            col++;
          }
        } else {
          word += ch;
        }
      }
    },
    flush() {
      flushWord();
    },
  };
}
