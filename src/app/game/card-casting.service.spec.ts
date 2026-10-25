import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { CardCastingService } from './card-casting.service';
import { GameActions, UIActions } from '../store';
import { makeCard } from '../testing/test-factories';
import { CardType } from '../models/game.models';
import { CastDraft } from '../store/ui/ui.reducer';
describe('CardCastingService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideMockStore()] }));
  it('plays lands as a special action', () => {
    const dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
    TestBed.inject(CardCastingService).start(
      makeCard({ cardId: 'land', cardTypes: [CardType.Land] }),
    );
    expect(dispatch).toHaveBeenCalledOnceWith(GameActions.playLand({ cardId: 'land' }));
  });
  it('stages a spell without sending it even when it has no targets', () => {
    const dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
    const card = makeCard({ targetCount: 0 });
    TestBed.inject(CardCastingService).start(card);
    expect(dispatch).toHaveBeenCalledOnceWith(UIActions.beginCast({ card }));
  });
  it('keeps X and actual target count through targeting, without casting', () => {
    const dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
    const draft: CastDraft = {
      card: makeCard({ cardId: 'spell', targetCount: 2, manaCost: '{X}{X}{R}' }),
      stage: 'payment',
      x: 3,
      targets: [],
      error: null,
    };
    const service = TestBed.inject(CardCastingService);
    expect(service.cost(draft)).toBe('{3}{3}{R}');
    service.continue(draft);
    expect(dispatch.calls.allArgs()).toEqual([
      [UIActions.setCastStage({ stage: 'targets' })],
      [UIActions.enterTargetMode({ sourceCardId: 'spell', targetCount: 2, variableValue: 3 })],
    ]);
  });
  it('reviews an untargeted spell instead of sending it immediately', () => {
    const dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
    TestBed.inject(CardCastingService).continue({
      card: makeCard({ targetCount: 0 }),
      stage: 'payment',
      x: 0,
      targets: [],
      error: null,
    });
    expect(dispatch).toHaveBeenCalledOnceWith(UIActions.setCastTargets({ targets: [] }));
  });
});
