import { colorSelectionToken, matchesColorSelection } from './color-filter';

const sel = (...codes: string[]) => new Set(codes);
const matches = (identity: string[], ...codes: string[]) =>
  matchesColorSelection(identity, sel(...codes));

describe('matchesColorSelection', () => {
  it('matches everything when nothing is selected', () => {
    expect(matches([])).toBeTrue();
    expect(matches(['R'])).toBeTrue();
    expect(matches(['W', 'U', 'B', 'R', 'G'])).toBeTrue();
  });

  // ---- The reported bug -------------------------------------------------

  it('one colour means mono-coloured, not "contains that colour"', () => {
    expect(matches(['R'], 'R')).toBeTrue();
    // Every one of these merely *contains* red, and used to match.
    expect(matches(['R', 'W'], 'R')).toBeFalse();
    expect(matches(['U', 'B', 'R'], 'R')).toBeFalse();
    expect(matches(['W', 'U', 'B', 'R', 'G'], 'R')).toBeFalse();
  });

  it('two colours means anything inside those two, including each alone', () => {
    expect(matches(['R'], 'R', 'W')).toBeTrue();
    expect(matches(['W'], 'R', 'W')).toBeTrue();
    expect(matches(['R', 'W'], 'R', 'W')).toBeTrue();
    expect(matches(['U'], 'R', 'W')).toBeFalse();
    expect(matches(['R', 'U'], 'R', 'W')).toBeFalse();
  });

  it('excludes colourless cards from a colour selection', () => {
    // Otherwise every artifact would show up under Red, which is not what the pip asks.
    expect(matches([], 'R')).toBeFalse();
  });

  // ---- The pseudo-pips --------------------------------------------------

  it('colourless alone matches only an empty identity', () => {
    expect(matches([], 'C')).toBeTrue();
    expect(matches(['U'], 'C')).toBeFalse();
  });

  it('multicolour alone is a cardinality question', () => {
    expect(matches(['G', 'W'], 'M')).toBeTrue();
    expect(matches(['G'], 'M')).toBeFalse();
    expect(matches([], 'M')).toBeFalse();
  });

  // These two combinations previously lit both pips while silently behaving as though only
  // the pseudo-pip were selected — the colour choice was discarded with no feedback.

  it('multicolour plus colours means the multicoloured ones within those colours', () => {
    expect(matches(['R', 'W'], 'M', 'R', 'W')).toBeTrue();
    expect(matches(['R'], 'M', 'R', 'W')).toBeFalse();
    expect(matches(['U', 'B'], 'M', 'R', 'W')).toBeFalse();
  });

  it('colourless plus colours widens rather than replaces', () => {
    expect(matches([], 'C', 'R')).toBeTrue();
    expect(matches(['R'], 'C', 'R')).toBeTrue();
    expect(matches(['W'], 'C', 'R')).toBeFalse();
  });

  it('colourless plus multicolour matches both ends but not mono', () => {
    expect(matches([], 'C', 'M')).toBeTrue();
    expect(matches(['R', 'W'], 'C', 'M')).toBeTrue();
    expect(matches(['R'], 'C', 'M')).toBeFalse();
  });

  it('reads identity case-insensitively', () => {
    expect(matchesColorSelection(['r'], sel('R'))).toBeTrue();
  });
});

describe('colorSelectionToken', () => {
  it('is null when nothing is selected', () => {
    expect(colorSelectionToken(sel())).toBeNull();
  });

  it('emits colours in WUBRG order so the token is stable', () => {
    expect(colorSelectionToken(sel('R', 'W'))).toBe('c:wr');
    expect(colorSelectionToken(sel('W', 'R'))).toBe('c:wr');
  });

  it('carries the pseudo-pips alongside the colours instead of dropping them', () => {
    // The old encoding emitted a bare 'c:m' here and threw the red away.
    expect(colorSelectionToken(sel('M', 'R'))).toBe('c:rm');
    expect(colorSelectionToken(sel('C', 'R'))).toBe('c:rc');
    expect(colorSelectionToken(sel('M'))).toBe('c:m');
    expect(colorSelectionToken(sel('C'))).toBe('c:c');
  });
});
