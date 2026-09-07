import { CardDisputeDiffService } from './card-dispute-diff.service';
import { CardReading } from '../../services/card-implementation-api.service';

/**
 * The highlight, which is the only reason this screen is readable.
 *
 * Two 60-line JSON documents side by side with nothing marked is a spot-the-difference puzzle,
 * and the person settling a dispute is not there to play one.
 *
 * These tests were rewritten after the screen was rendered against a live API for the first
 * time: they used to feed `lines()` a path like `effects[0].amount` and assert the mark landed,
 * and they passed, because the path was invented in the spec. The endpoint sends 60 characters
 * of each reading around the first differing *character* instead, so on the real corpus nothing
 * matched and all 105 disputed cards showed "the named path is not in this reading". Everything
 * below is driven from two readings, the way the page is.
 */
describe('CardDisputeDiffService', () => {
  const sut = new CardDisputeDiffService();

  const bolt = {
    name: 'Lightning Bolt',
    effects: [
      { kind: 'DealDamage', amount: 3, target: 'AnyTarget' },
      { kind: 'Draw', amount: 1 },
    ],
    timing: { instant: true },
    tags: [] as string[],
  };

  const reading = (model: string, value: unknown): CardReading => ({
    model,
    definitionJson: JSON.stringify(value),
  });

  /** The line both panels mark, asserted to be the same line in each. */
  const marked = (a: unknown, b: unknown) => {
    const out = sut.render([reading('opus', a), reading('sonnet', b)]);
    const hits = out.readings.map((r) => r.lines.filter((l) => l.highlighted));
    expect(hits.every((h) => h.length <= 1)).toBe(true);
    return { out, texts: hits.map((h) => h[0]?.text.trim()) };
  };

  it('pretty-prints one line per value, indented', () => {
    const lines = sut.lines(JSON.stringify(bolt));
    expect(lines[0].text).toBe('{');
    expect(lines.some((l) => l.text === '  "name": "Lightning Bolt",')).toBe(true);
    expect(lines.some((l) => l.text.trim() === '"amount": 3,')).toBe(true);
  });

  it('marks the line the two readings differ at, in both readings', () => {
    const { texts } = marked(bolt, {
      ...bolt,
      effects: [{ ...bolt.effects[0], amount: 2 }, bolt.effects[1]],
    });
    expect(texts).toEqual(['"amount": 3,', '"amount": 2,']);
  });

  it('names the path of the differing line for the header', () => {
    const { out } = marked(bolt, {
      ...bolt,
      effects: [{ ...bolt.effects[0], amount: 2 }, bolt.effects[1]],
    });
    expect(out.path).toBe('effects[0].amount');
  });

  it('marks the opening line when the readings differ in a whole object', () => {
    const { texts } = marked(bolt, { ...bolt, timing: { instant: true, sorcery: false } });
    // Identical until the object's contents, so the difference is the line inside it.
    expect(texts[0]).toBe('"instant": true');
    expect(texts[1]).toBe('"instant": true,');
  });

  it('marks where one reading runs out when the other keeps going', () => {
    const shorter = { name: 'Lightning Bolt', effects: [bolt.effects[0]] };
    const longer = { name: 'Lightning Bolt', effects: [bolt.effects[0], bolt.effects[1]] };
    const out = sut.render([reading('opus', shorter), reading('sonnet', longer)]);
    expect(out.lineIndex).toBeGreaterThan(0);
    expect(out.readings[1].lines[out.lineIndex].highlighted).toBe(true);
  });

  it('marks nothing when the two readings render identically', () => {
    const out = sut.render([reading('opus', bolt), reading('sonnet', bolt)]);
    expect(out.lineIndex).toBe(-1);
    expect(out.readings.every((r) => r.lines.every((l) => !l.highlighted))).toBe(true);
  });

  it('marks nothing when only one model produced a reading', () => {
    const out = sut.render([reading('opus', bolt)]);
    expect(out.lineIndex).toBe(-1);
    expect(out.readings.length).toBe(1);
  });

  it('marks nothing when there are no readings at all', () => {
    expect(sut.render([]).lineIndex).toBe(-1);
  });

  // A reading the pipeline wrote that this page cannot parse is a fact worth seeing: an empty
  // panel would read as the two models having agreed.
  it('shows unparseable JSON verbatim rather than an empty panel', () => {
    const out = sut.render([
      { model: 'opus', definitionJson: '{ not json' },
      reading('sonnet', bolt),
    ]);
    expect(out.readings[0].lines.length).toBe(1);
    expect(out.readings[0].lines[0].text).toBe('{ not json');
    expect(out.lineIndex).toBe(0);
  });

  it('renders nested arrays with their indices in the path', () => {
    const out = sut.render([
      reading('opus', { choices: [[1, 2], [3]] }),
      reading('sonnet', { choices: [[1, 9], [3]] }),
    ]);
    expect(out.path).toBe('choices[0][1]');
    expect(out.readings[0].lines[out.lineIndex].text.trim()).toBe('2');
  });

  it('does not mark a closing brace, which belongs to no path', () => {
    const out = sut.render([
      reading('opus', { a: 1, b: { c: 1 } }),
      reading('sonnet', { a: 1, b: { c: 2 } }),
    ]);
    expect(out.readings[0].lines[out.lineIndex].text.trim()).toBe('"c": 1');
  });
});
