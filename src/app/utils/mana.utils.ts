/**
 * The single mana-symbol → mana-font CSS class mapping.
 *
 * Previously implemented three times; the copies had drifted, and the naive one
 * (lowercase + strip slashes) rendered {T} as the nonexistent `ms-t` instead of
 * `ms-tap` on the commander pages. Every renderer of `{X}`-style symbols goes
 * through here.
 */
const SYMBOL_CLASS: Record<string, string> = {
  T: 'ms-tap',
  Q: 'ms-untap',
  E: 'ms-e',
  S: 'ms-s',
  W: 'ms-w',
  U: 'ms-u',
  B: 'ms-b',
  R: 'ms-r',
  G: 'ms-g',
  C: 'ms-c',
  X: 'ms-x',
  Y: 'ms-y',
  Z: 'ms-z',
};

/** Maps the inside of a `{…}` symbol (e.g. "T", "2/W", "W/P") to its ms-* class. */
export function symbolToClass(sym: string): string {
  const up = sym.toUpperCase();

  if (SYMBOL_CLASS[up]) return SYMBOL_CLASS[up];

  // Generic mana: {0}–{20}
  if (/^\d+$/.test(up)) return `ms-${up}`;

  // Hybrid/phyrexian: {W/U}, {2/W}, {W/P}, etc.
  if (up.includes('/')) {
    return `ms-${up.replace('/', '').toLowerCase()}`;
  }

  return 'ms-c';
}
