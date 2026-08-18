import { escapeRegExp } from './regex.utils';

describe('escapeRegExp', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeRegExp('Flying')).toBe('Flying');
  });

  it('escapes every character a regular expression would otherwise read', () => {
    for (const char of ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']) {
      expect(new RegExp(escapeRegExp(char)).test(char))
        .withContext(`"${char}" must match itself literally`)
        .toBeTrue();
    }
  });

  it('makes a keyword ending in punctuation safe to alternate on', () => {
    // "For Mirrodin!" and "Start Your Engines!" are real keyword names.
    const pattern = new RegExp(`(?<!\\w)(?:${escapeRegExp('For Mirrodin!')})(?!\\w)`);
    expect(pattern.test('For Mirrodin! {2}')).toBeTrue();
  });

  it('does not let a search term smuggle in a pattern', () => {
    // The card search builds a highlight regex from whatever is typed.
    expect(new RegExp(escapeRegExp('a.c')).test('abc')).toBeFalse();
    expect(new RegExp(escapeRegExp('a.c')).test('a.c')).toBeTrue();
  });
});
