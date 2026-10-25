import { TestBed } from '@angular/core/testing';
import { LibraryArrangementDraftService } from './library-arrangement-draft.service';
import { ChoiceSelectionService } from './choices/choice-selection.service';
import { makeCard } from '../testing/test-factories';

describe('LibraryArrangementDraftService', () => {
  const cards = ['o1', 'o2', 'o3'].map((cardId) => makeCard({ cardId, ownerId: 'p0' }));
  let draft: LibraryArrangementDraftService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LibraryArrangementDraftService, ChoiceSelectionService],
    });
    draft = TestBed.inject(LibraryArrangementDraftService);
  });
  it('uses shared ordering and requires every card before exposing an independent submission', () => {
    draft.begin(cards, 'p0');
    draft.selection.move(draft.choice!, 'o2', -1);
    expect(draft.order).toEqual(['o2', 'o1', 'o3']);
    const submission = draft.order!;
    submission.reverse();
    expect(draft.order).toEqual(['o2', 'o1', 'o3']);
    draft.selection.select(draft.choice!, 'o3');
    expect(draft.order).toBeNull();
    draft.selection.select(draft.choice!, 'o3');
    expect(draft.order).toEqual(['o2', 'o1', 'o3']);
    draft.cancel();
    expect(draft.choice).toBeNull();
    expect(draft.selection.picks).toEqual([]);
  });
  it('preserves equivalent snapshots but expires on permission, membership, owner or order changes', () => {
    draft.begin(cards, 'p0');
    draft.selection.move(draft.choice!, 'o2', -1);
    draft.reconcile(
      cards.map((card) => ({ ...card })),
      'p0',
      true,
    );
    expect(draft.order).toEqual(['o2', 'o1', 'o3']);
    draft.reconcile(cards, 'p0', false);
    expect(draft.choice).toBeNull();
    draft.begin(cards, 'p0');
    draft.reconcile(cards.slice(1), 'p0', true);
    expect(draft.choice).toBeNull();
    draft.begin(cards, 'p0');
    draft.reconcile([...cards].reverse(), 'p0', true);
    expect(draft.choice).toBeNull();
    draft.begin(cards, 'p0');
    draft.reconcile(cards, 'p1', true);
    expect(draft.choice).toBeNull();
  });
  it('does not start with foreign, duplicate, empty or singleton cards', () => {
    for (const supplied of [
      [],
      cards.slice(0, 1),
      [cards[0], cards[0]],
      [cards[0], { ...cards[1], ownerId: 'p1' }],
    ]) {
      draft.begin(supplied, 'p0');
      expect(draft.choice).toBeNull();
      expect(draft.order).toBeNull();
    }
  });
});
