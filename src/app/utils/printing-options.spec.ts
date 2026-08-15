import { printingOption, printingOptions, setCodeOption } from './printing-options';
import { PrintingDto } from '../models/game.models';

function printing(over: Partial<PrintingDto> = {}): PrintingDto {
  return {
    scryfallId: 's1',
    setCode: 'lea',
    setName: 'Limited Edition Alpha',
    collectorNumber: '1',
    ...over,
  } as PrintingDto;
}

describe('printing-options', () => {
  it('formats a printing as SET #number with the set symbol', () => {
    expect(printingOption(printing())).toEqual({
      value: 's1',
      label: 'LEA #1',
      title: 'Limited Edition Alpha',
      iconCode: 'lea',
    });
  });

  it('omits the collector number when the printing has none', () => {
    expect(printingOption(printing({ collectorNumber: null as never })).label).toBe('LEA');
  });

  it('accepts an alternate value so a picker can key on the owned row instead', () => {
    // The grouped picker keys on row id: a row that pins no printing still owns copies,
    // and keying on scryfallId dropped those rows out of the menu entirely.
    expect(printingOption(printing(), { value: 'row-7' }).value).toBe('row-7');
  });

  it('appends a suffix for grouped rows', () => {
    expect(printingOption(printing(), { suffix: ' ×2' }).label).toBe('LEA #1 ×2');
  });

  it('falls back to the set name when absent', () => {
    expect(printingOption(printing({ setName: null as never })).title).toBe('LEA');
  });

  it('maps a list in order', () => {
    const opts = printingOptions([printing(), printing({ scryfallId: 's2', setCode: 'vow' })]);
    expect(opts.map((o) => o.value)).toEqual(['s1', 's2']);
    expect(opts[1].label).toBe('VOW #1');
  });

  it('builds a code-only option when printings have not loaded', () => {
    expect(setCodeOption('row-1', 'dbl', ' ×3')).toEqual({
      value: 'row-1',
      label: 'DBL ×3',
      title: 'DBL',
      iconCode: 'dbl',
    });
  });

  it('shows a placeholder rather than an empty label when the set is unknown', () => {
    expect(setCodeOption('row-1', null).label).toBe('···');
  });
});
