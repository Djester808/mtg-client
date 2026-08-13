import { symbolToClass } from './mana.utils';

describe('symbolToClass', () => {
  it('maps action symbols by name, not by letter', () => {
    // The naive copy this replaced rendered {T} as the nonexistent ms-t.
    expect(symbolToClass('T')).toBe('ms-tap');
    expect(symbolToClass('Q')).toBe('ms-untap');
  });

  it('maps the five colors, colorless, and X', () => {
    expect(symbolToClass('W')).toBe('ms-w');
    expect(symbolToClass('u')).toBe('ms-u');
    expect(symbolToClass('C')).toBe('ms-c');
    expect(symbolToClass('X')).toBe('ms-x');
  });

  it('maps generic mana numbers', () => {
    expect(symbolToClass('0')).toBe('ms-0');
    expect(symbolToClass('15')).toBe('ms-15');
  });

  it('maps hybrid and phyrexian costs', () => {
    expect(symbolToClass('W/U')).toBe('ms-wu');
    expect(symbolToClass('2/W')).toBe('ms-2w');
    expect(symbolToClass('W/P')).toBe('ms-wp');
  });

  it('falls back to colorless for unknown symbols', () => {
    expect(symbolToClass('CHAOS')).toBe('ms-c');
  });
});
