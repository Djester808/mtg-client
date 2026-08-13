import { colorIdentityViolations } from './card.utils';
import { ManaColor } from '../models/game.models';

describe('colorIdentityViolations', () => {
  it('returns the colors outside the commander identity', () => {
    expect(colorIdentityViolations(['R', 'G'], ['R'])).toEqual(['G']);
  });

  it('is empty when the card fits inside the identity', () => {
    expect(colorIdentityViolations(['R'], ['R', 'G'])).toEqual([]);
  });

  it('never flags colorless — C is not a color', () => {
    // The drifted copies disagreed on exactly this case.
    expect(colorIdentityViolations(['C'], ['R'])).toEqual([]);
    expect(colorIdentityViolations(['C', 'U'], ['R'])).toEqual(['U']);
  });

  it('treats missing identities as empty', () => {
    expect(colorIdentityViolations(null, ['R'])).toEqual([]);
    expect(colorIdentityViolations(undefined, undefined)).toEqual([]);
    expect(colorIdentityViolations(['R'], null)).toEqual(['R']);
  });

  it('accepts enum values and strings interchangeably', () => {
    expect(colorIdentityViolations([ManaColor.Green], ['G'])).toEqual([]);
    expect(colorIdentityViolations(['G'], [ManaColor.Red])).toEqual(['G']);
  });
});
