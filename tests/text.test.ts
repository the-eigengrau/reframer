import { describe, it, expect, afterEach } from 'vitest';
import {
  getContentWidth,
  wrapPlain,
  wrapWithPrefix,
  wrapText,
  createStreamWrapper,
} from '../src/ui/text.js';

const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');

function setColumns(value: number | undefined) {
  Object.defineProperty(process.stdout, 'columns', { value, configurable: true });
}

afterEach(() => {
  if (originalColumns) {
    Object.defineProperty(process.stdout, 'columns', originalColumns);
  } else {
    delete (process.stdout as { columns?: number }).columns;
  }
});

describe('getContentWidth', () => {
  it('subtracts indent and one reserved column from terminal width', () => {
    setColumns(50);
    expect(getContentWidth(4)).toBe(45);
  });

  it('caps at max', () => {
    setColumns(120);
    expect(getContentWidth(2, 72)).toBe(72);
  });

  it('never goes below 10', () => {
    setColumns(12);
    expect(getContentWidth(4)).toBe(10);
  });

  it('falls back to 80 columns when undetectable', () => {
    setColumns(undefined);
    expect(getContentWidth(2)).toBe(77);
  });
});

describe('wrapPlain', () => {
  it('returns a single empty line for empty text', () => {
    expect(wrapPlain('', 10)).toEqual(['']);
  });

  it('keeps short text on one line', () => {
    expect(wrapPlain('hello world', 20)).toEqual(['hello world']);
  });

  it('wraps at word boundaries', () => {
    expect(wrapPlain('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
  });

  it('keeps a word of exactly the width on one line without a blank line', () => {
    expect(wrapPlain('abcdefg', 7)).toEqual(['abcdefg']);
  });

  it('hard-breaks words longer than the width', () => {
    expect(wrapPlain('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('preserves paragraph breaks as empty lines', () => {
    expect(wrapPlain('one\n\ntwo', 10)).toEqual(['one', '', 'two']);
  });
});

describe('wrapWithPrefix', () => {
  it('prefixes the first line and indents continuations', () => {
    expect(wrapWithPrefix('hello world foo', '› ', '  ', 5)).toBe('› hello\n  world\n  foo');
  });

  it('leaves blank lines bare', () => {
    expect(wrapWithPrefix('a\n\nb', '› ', '  ', 10)).toBe('› a\n\n  b');
  });

  it('colorizes content but not the prefix or indent', () => {
    const tagged = wrapWithPrefix('aa bb', '> ', '  ', 2, (s) => `[${s}]`);
    expect(tagged).toBe('> [aa]\n  [bb]');
  });
});

describe('wrapText', () => {
  it('indents every line including the first', () => {
    expect(wrapText('aaa bbb ccc', 7, '  ')).toBe('  aaa bbb\n  ccc');
  });
});

describe('createStreamWrapper', () => {
  function makeSink() {
    let out = '';
    return {
      write: (s: string) => { out += s; },
      get output() { return out; },
    };
  }

  it('wraps before printing a word that crosses the width', () => {
    const sink = makeSink();
    const w = createStreamWrapper({ width: 10, indent: '  ', write: sink.write });
    w.push('hello world');
    w.flush();
    expect(sink.output).toBe('hello \n  world');
  });

  it('handles words split across push chunks', () => {
    const sink = makeSink();
    const w = createStreamWrapper({ width: 10, indent: '  ', write: sink.write });
    w.push('hel');
    w.push('lo wor');
    w.push('ld');
    w.flush();
    expect(sink.output).toBe('hello \n  world');
  });

  it('preserves newlines in the stream', () => {
    const sink = makeSink();
    const w = createStreamWrapper({ width: 10, indent: '  ', write: sink.write });
    w.push('a\nb');
    w.flush();
    expect(sink.output).toBe('a\n  b');
  });

  it('swallows leading spaces at the start of a line', () => {
    const sink = makeSink();
    const w = createStreamWrapper({ width: 10, indent: '  ', write: sink.write });
    w.push(' a');
    w.flush();
    expect(sink.output).toBe('a');
  });

  it('hard-breaks oversized words', () => {
    const sink = makeSink();
    const w = createStreamWrapper({ width: 5, indent: '  ', write: sink.write });
    w.push('abcdefghij x');
    w.flush();
    expect(sink.output).toBe('abcde\n  fghij\n  x');
  });

  it('never emits a blank line when a word ends exactly at the width', () => {
    const sink = makeSink();
    const w = createStreamWrapper({ width: 5, indent: '  ', write: sink.write });
    w.push('abcde fg');
    w.flush();
    expect(sink.output).toBe('abcde\n  fg');
  });

  it('colorizes words but not structural whitespace', () => {
    const sink = makeSink();
    const w = createStreamWrapper({
      width: 10,
      indent: '  ',
      write: sink.write,
      colorize: (s) => `[${s}]`,
    });
    w.push('a b');
    w.flush();
    expect(sink.output).toBe('[a] [b]');
  });

  it('emits nothing on flush with no pending word', () => {
    const sink = makeSink();
    const w = createStreamWrapper({ width: 10, indent: '  ', write: sink.write });
    w.flush();
    expect(sink.output).toBe('');
  });
});
