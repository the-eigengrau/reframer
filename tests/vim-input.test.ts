import { describe, it, expect, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { displayLines, cursorRowCol, vimInput } from '../src/ui/vim-input.js';

describe('displayLines', () => {
  it('wraps a single paragraph at the cap', () => {
    expect(displayLines('abcdef', 3)).toEqual(['abc', 'def']);
  });

  it('breaks on hard newlines, keeping empty lines', () => {
    expect(displayLines('ab\n\ncd', 10)).toEqual(['ab', '', 'cd']);
  });

  it('returns a single empty row for empty input', () => {
    expect(displayLines('', 10)).toEqual(['']);
  });
});

describe('cursorRowCol', () => {
  it('advances to a new row at the wrap boundary', () => {
    expect(cursorRowCol('abcdef', 3, 3)).toEqual({ row: 1, col: 0 });
    expect(cursorRowCol('abcdef', 4, 3)).toEqual({ row: 1, col: 1 });
  });

  it('counts hard newlines as row breaks', () => {
    expect(cursorRowCol('ab\ncd', 5, 10)).toEqual({ row: 1, col: 2 });
  });
});

// Drive vimInput through a fake, non-TTY stdin so we can feed raw bytes and let
// Node's readline parse them into keypress events exactly as a terminal would.
function withFakeStdin(run: (stdin: PassThrough) => Promise<void>): Promise<void> {
  const fakeIn = new PassThrough() as PassThrough & { isTTY?: boolean };
  fakeIn.isTTY = false; // skip raw-mode + escape writes
  const origIn = Object.getOwnPropertyDescriptor(process, 'stdin')!;
  const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  Object.defineProperty(process, 'stdin', { value: fakeIn, configurable: true });
  return run(fakeIn).finally(() => {
    Object.defineProperty(process, 'stdin', origIn);
    writeSpy.mockRestore();
  });
}

const tick = () => new Promise((r) => setImmediate(r));

describe('vimInput paste handling', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not submit on newlines inside a bracketed paste', async () => {
    await withFakeStdin(async (stdin) => {
      const p = vimInput({ validate: (v) => v.trim().length > 0 || 'required' });
      // Paste a two-line block; the embedded newline must NOT submit.
      stdin.write('\x1b[200~Line one\nLine two\x1b[201~');
      await tick();
      let settled = false;
      void p.then(() => (settled = true));
      await tick();
      expect(settled).toBe(false);
      // Explicit Enter (CR) submits.
      stdin.write('\r');
      await expect(p).resolves.toBe('Line one\nLine two');
    });
  });

  it('collapses CRLF inside a paste to a single newline', async () => {
    await withFakeStdin(async (stdin) => {
      const p = vimInput({ validate: () => true });
      stdin.write('\x1b[200~a\r\nb\x1b[201~');
      await tick();
      stdin.write('\r');
      await expect(p).resolves.toBe('a\nb');
    });
  });

  it('still submits a normally typed line on Enter', async () => {
    await withFakeStdin(async (stdin) => {
      const p = vimInput({ validate: () => true });
      stdin.write('hello');
      await tick();
      stdin.write('\r');
      await expect(p).resolves.toBe('hello');
    });
  });
});
