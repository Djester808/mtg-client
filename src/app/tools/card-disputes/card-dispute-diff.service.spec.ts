import { CardDisputeDiffService } from './card-dispute-diff.service';

/**
 * The highlight, which is the only reason this screen is readable.
 *
 * Two 60-line JSON documents side by side with nothing marked is a spot-the-difference puzzle,
 * and the person settling a dispute is not there to play one. The server names the path; these
 * tests are about the client landing the mark on the right line whichever way it spells it.
 */
describe('CardDisputeDiffService', () => {
  const sut = new CardDisputeDiffService();
  const definition = JSON.stringify({
    name: 'Lightning Bolt',
    effects: [
      { kind: 'DealDamage', amount: 3, target: 'AnyTarget' },
      { kind: 'Draw', amount: 1 },
    ],
    timing: { instant: true },
    tags: [],
  });

  const diffLine = (path: string) => sut.lines(definition, path).find((l) => l.highlighted);

  it('pretty-prints one line per value, indented', () => {
    const lines = sut.lines(definition, '');
    expect(lines[0].text).toBe('{');
    expect(lines.some((l) => l.text === '  "name": "Lightning Bolt",')).toBe(true);
    expect(lines.some((l) => l.text.trim() === '"amount": 3,')).toBe(true);
  });

  it('highlights the line the server named', () => {
    expect(diffLine('effects[0].amount')?.text.trim()).toBe('"amount": 3,');
  });

  it('highlights exactly one line', () => {
    expect(sut.lines(definition, 'effects[0].amount').filter((l) => l.highlighted).length).toBe(1);
  });

  it('accepts the path however the server spells it', () => {
    const spellings = [
      'effects[0].amount',
      'Effects[0].Amount',
      '$.effects[0].amount',
      'effects/0/amount',
      'effects.0.amount',
    ];
    for (const spelling of spellings) {
      expect(diffLine(spelling)?.text.trim()).withContext(spelling).toBe('"amount": 3,');
    }
  });

  it('highlights the opening line when the difference is a whole object', () => {
    expect(diffLine('timing')?.text.trim()).toBe('"timing": {');
  });

  it('highlights the opening line when the difference is a whole array element', () => {
    expect(diffLine('effects[1]')?.text.trim()).toBe('{');
  });

  it('highlights an empty array in place', () => {
    expect(diffLine('tags')?.text.trim()).toBe('"tags": []');
  });

  it('highlights nothing when the path is not in this reading', () => {
    const lines = sut.lines(definition, 'effects[9].amount');
    expect(sut.hasDifference(lines)).toBe(false);
  });

  it('highlights nothing when the server named no path', () => {
    expect(sut.hasDifference(sut.lines(definition, ''))).toBe(false);
    expect(sut.hasDifference(sut.lines(definition, null))).toBe(false);
  });

  it('does not highlight a closing brace, which belongs to no path', () => {
    const closing = sut.lines(definition, 'timing').filter((l) => l.text.trim() === '}');
    expect(closing.every((l) => !l.highlighted)).toBe(true);
  });

  // A reading the pipeline wrote that this page cannot parse is a fact worth seeing: an empty
  // panel would read as the two models having agreed.
  it('shows unparseable JSON verbatim rather than an empty panel', () => {
    const lines = sut.lines('{ not json', 'effects[0].amount');
    expect(lines.length).toBe(1);
    expect(lines[0].text).toBe('{ not json');
    expect(sut.hasDifference(lines)).toBe(false);
  });

  it('renders nested arrays with their indices in the path', () => {
    const nested = JSON.stringify({ choices: [[1, 2], [3]] });
    expect(
      sut
        .lines(nested, 'choices[0][1]')
        .find((l) => l.highlighted)
        ?.text.trim(),
    ).toBe('2');
  });
});
