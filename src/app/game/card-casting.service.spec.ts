import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { CardCastingService } from './card-casting.service';
import { GameActions, UIActions } from '../store';
import { makeCard } from '../testing/test-factories';
import { CardType } from '../models/game.models';
describe('CardCastingService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideMockStore()] }));
  it('plays lands without putting them on the stack', () => {
    const dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
    TestBed.inject(CardCastingService).start(
      makeCard({ cardId: 'land', cardTypes: [CardType.Land] }),
    );
    expect(dispatch.calls.allArgs()).toEqual([[GameActions.playLand({ cardId: 'land' })]]);
  });
  it('asks for announced variables before choosing targets', () => {
    const dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
    TestBed.inject(CardCastingService).start(
      makeCard({ cardId: 'spell', announcesVariable: true, targetCount: 2 }),
    );
    expect(dispatch.calls.allArgs()).toEqual([
      [UIActions.enterAnnounceMode({ sourceId: 'spell', targetCount: 2 })],
    ]);
  });
  it('preserves the actual target count', () => {
    const dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
    TestBed.inject(CardCastingService).start(makeCard({ cardId: 'spell', targetCount: 2 }));
    expect(dispatch.calls.allArgs()).toEqual([
      [UIActions.enterTargetMode({ sourceCardId: 'spell', targetCount: 2 })],
    ]);
  });
  it('casts untargeted spells and clears selection', () => {
    const dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
    TestBed.inject(CardCastingService).start(makeCard({ cardId: 'spell', targetCount: 0 }));
    expect(dispatch.calls.allArgs()).toEqual([
      [GameActions.castSpell({ cardId: 'spell', targetIds: [] })],
      [UIActions.deselectCard()],
    ]);
  });
});
