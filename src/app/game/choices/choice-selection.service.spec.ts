import { ChoiceSelectionService } from './choice-selection.service';
import { ChoiceDto } from '../../models/game.models';

const choice = (over: Partial<ChoiceDto> = {}): ChoiceDto => ({
  id: 'choice-1',
  playerId: 'p1',
  kind: 'search',
  prompt: 'Choose cards',
  minPicks: 1,
  maxPicks: 2,
  isOrdering: false,
  isDivision: false,
  totalToDivide: 0,
  options: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ],
  ...over,
});

describe('ChoiceSelectionService', () => {
  let service: ChoiceSelectionService;
  beforeEach(() => (service = new ChoiceSelectionService()));
  it('maps sequential top placements to a complete top-first answer without changing explicit ordering', () => {
    const request = choice({
      kind: 'library-top-order',
      isOrdering: true,
      minPicks: 3,
      maxPicks: 3,
    });
    expect(service.placeOnTop(request, 'hidden')).toBeNull();
    expect(service.picks).toEqual([]);
    expect(service.placeOnTop(request, 'a')).toBeNull();
    expect(service.placeOnTop(request, 'b')).toBeNull();
    expect(service.picks).toEqual(['b', 'a']);
    expect(service.placeOnTop(request, 'a')).toBeNull();
    expect(service.picks).toEqual(['a', 'b']);
    expect(service.placeOnTop(request, 'c')).toEqual(['c', 'a', 'b']);
    service.reset();
    service.select(request, 'a');
    service.select(request, 'b');
    service.select(request, 'c');
    expect(service.picks).toEqual(['a', 'b', 'c']);
    expect(service.placeOnTop({ ...request, id: 'next', kind: 'search' }, 'a')).toBeNull();
    expect(service.picks).toEqual([]);
  });
  it('returns the complete unordered search at capacity while preserving partial completion', () => {
    const request = choice();
    expect(service.remainingPicks(request)).toBe(2);
    expect(service.select(request, 'b')).toBeNull();
    expect(service.remainingPicks(request)).toBe(1);
    expect(service.canSubmit(request)).toBeTrue();
    expect(service.select(request, 'b')).toBeNull();
    expect(service.remainingPicks(request)).toBe(2);
    expect(service.select(request, 'a')).toBeNull();
    const answer = service.select(request, 'c');
    expect(answer).toEqual(['a', 'c']);
    expect(service.remainingPicks(request)).toBe(0);
    expect(service.select(request, 'b')).toBeNull();
    expect(service.select(request, 'hidden')).toBeNull();
    answer!.push('b');
    expect(service.picks).toEqual(['a', 'c']);
  });
  for (const mode of [
    { isOrdering: true },
    { isDivision: true, totalToDivide: 2 },
    { kind: 'surveil' },
  ])
    it('does not auto-submit nonordinary search mode ' + JSON.stringify(mode), () => {
      const request = choice(mode);
      expect(service.select(request, 'a')).toBeNull();
      expect(service.select(request, 'b')).toBeNull();
      expect(service.canSubmit(request)).toBeTrue();
    });
  it('enforces the offered cards and maximum without rearranging selection order', () => {
    const request = choice();
    service.select(request, 'unknown');
    expect(service.picks).toEqual([]);
    service.select(request, 'b');
    service.select(request, 'a');
    service.select(request, 'c');
    expect(service.picks).toEqual(['b', 'a']);
    expect(service.order('a')).toBe(2);
    service.select(request, 'b');
    expect(service.picks).toEqual(['a']);
    expect(service.canSubmit(request)).toBeTrue();
  });
  it('reorders only selected options in an ordering choice within its boundaries', () => {
    const request = choice({ isOrdering: true });
    service.select(request, 'a');
    service.select(request, 'b');
    service.move(request, 'b', -1);
    expect(service.picks).toEqual(['b', 'a']);
    service.move(request, 'b', -1);
    service.move(request, 'c', 1);
    service.move({ ...request, isOrdering: false }, 'a', -1);
    expect(service.picks).toEqual(['b', 'a']);
    service.move(request, 'b', 1);
    expect(service.picks).toEqual(['a', 'b']);
    service.move({ ...request, id: 'new' }, 'a', 1);
    expect(service.picks).toEqual([]);
  });
  it('discards prior selections when a different pending choice is received', () => {
    service.select(choice(), 'a');
    service.select(choice({ id: 'choice-2' }), 'b');
    expect(service.picks).toEqual(['b']);
  });
  it('returns a single choice answer and rejects hidden options', () => {
    expect(service.select(choice({ kind: 'may', maxPicks: 1 }), 'a')).toEqual(['a']);
    expect(service.select(choice({ options: null }), 'a')).toBeNull();
  });
  it('submits an offered single search immediately without retaining a draft', () => {
    const request = choice({ maxPicks: 1 });
    expect(service.select(request, 'a')).toEqual(['a']);
    expect(service.picks).toEqual([]);
    expect(service.select({ ...request, options: [] }, 'a')).toBeNull();
  });
  it('keeps explicit confirmation for a single ordered search', () => {
    const request = choice({ maxPicks: 1, isOrdering: true });
    expect(service.select(request, 'a')).toBeNull();
    expect(service.picks).toEqual(['a']);
    expect(service.canSubmit(request)).toBeTrue();
  });
  it('preserves immediate single-card mulligan bottoming', () => {
    const request = choice({ kind: 'mulligan-bottom', maxPicks: 1, isOrdering: true });
    expect(service.select(request, 'a')).toEqual(['a']);
    expect(service.requiresConfirmation(request)).toBeFalse();
  });
  it('rejects search picks withdrawn from the current offered options', () => {
    const request = choice();
    service.select(request, 'a');
    const revised = { ...request, options: [{ id: 'b', label: 'B' }] };
    expect(service.canSubmit(revised)).toBeFalse();
    service.bind(revised);
    expect(service.picks).toEqual([]);
    service.select(revised, 'b');
    expect(service.canSubmit(revised)).toBeTrue();
  });
  it('counts repeated division picks, bounds the total, and resets', () => {
    const request = choice({ isDivision: true, totalToDivide: 3, maxPicks: 3 });
    service.select(request, 'a');
    service.select(request, 'a');
    expect(service.assigned('a')).toBe(2);
    expect(service.remaining(request)).toBe(1);
    expect(service.canSubmit(request)).toBeFalse();
    service.select(request, 'b');
    service.select(request, 'b');
    expect(service.picks).toEqual(['a', 'a', 'b']);
    expect(service.canSubmit(request)).toBeTrue();
    service.reset();
    expect(service.picks).toEqual([]);
  });
});
