import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { CastPromptComponent } from './cast-prompt.component';
import {
  selectCastDraft,
  selectLocalPlayer,
  selectLocalPermanents,
  selectHasPriority,
  selectChoice,
  selectPlayers,
  selectBattlefield,
  selectStack,
  selectPendingTargets,
} from '../../store/selectors';
import { makeCard, makePlayer, makePermanent } from '../../testing/test-factories';
import { UIActions, GameActions } from '../../store';
import { ManaColor } from '../../models/game.models';
import { CastDraft } from '../../store/ui/ui.reducer';

describe('CastPromptComponent', () => {
  const card = makeCard({
    cardId: 'bolt',
    name: 'Lightning Bolt',
    manaCost: '{R}',
    targetCount: 1,
  });
  const draft: CastDraft = { card, stage: 'payment', x: 0, targets: [], error: null };
  function setup(over: Partial<CastDraft> = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideMockStore({
          selectors: [
            { selector: selectCastDraft, value: { ...draft, ...over } },
            {
              selector: selectLocalPlayer,
              value: makePlayer([card], { manaPool: { amounts: {}, total: 0 } }),
            },
            {
              selector: selectLocalPermanents,
              value: [
                makePermanent({
                  permanentId: 'land',
                  sourceCard: makeCard({ name: 'Mountain' }),
                  abilities: [
                    {
                      id: '0',
                      text: 'Add R',
                      isManaAbility: true,
                      requiresTap: false,
                      targetCount: 0,
                      announcesVariable: false,
                    },
                  ],
                }),
              ],
            },
            { selector: selectHasPriority, value: true },
            { selector: selectChoice, value: null },
            { selector: selectPlayers, value: [makePlayer()] },
            { selector: selectBattlefield, value: [] },
            { selector: selectStack, value: [] },
            { selector: selectPendingTargets, value: [] },
          ],
        }),
      ],
    });
    const fixture = TestBed.createComponent(CastPromptComponent),
      store = TestBed.inject(MockStore);
    fixture.detectChanges();
    return { fixture, store };
  }
  it('blocks continuation without mana but offers mana sources and cancellation', () => {
    const { fixture, store } = setup();
    const dispatch = spyOn(store, 'dispatch');
    expect(fixture.nativeElement.querySelector('.cast-next').disabled).toBeTrue();
    fixture.nativeElement.querySelector('.mana-sources button').click();
    expect(dispatch).toHaveBeenCalledWith(
      GameActions.activateAbility({ permanentId: 'land', abilityId: '0', targetIds: [] }),
    );
    fixture.nativeElement.querySelector('.cast-cancel').click();
    expect(dispatch).toHaveBeenCalledWith(UIActions.cancelCast());
  });
  it('enables continuation after a live mana update and asks for targets', () => {
    const { fixture, store } = setup();
    const dispatch = spyOn(store, 'dispatch');
    store.overrideSelector(
      selectLocalPlayer,
      makePlayer([card], { manaPool: { amounts: { [ManaColor.Red]: 1 }, total: 1 } }),
    );
    store.refreshState();
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.cast-next');
    expect(button.disabled).toBeFalse();
    button.click();
    expect(dispatch).toHaveBeenCalledWith(
      UIActions.enterTargetMode({ sourceCardId: 'bolt', targetCount: 1, variableValue: 0 }),
    );
  });
  it('shows selected target names and requires confirmation', () => {
    const { fixture, store } = setup({ stage: 'review', targets: ['p1'] });
    store.overrideSelector(
      selectLocalPlayer,
      makePlayer([card], { manaPool: { amounts: { [ManaColor.Red]: 1 }, total: 1 } }),
    );
    store.refreshState();
    fixture.detectChanges();
    const dispatch = spyOn(store, 'dispatch');
    expect(fixture.nativeElement.querySelector('.chosen-targets').textContent).toContain(
      makePlayer().name,
    );
    fixture.nativeElement.querySelector('.cast-submit').click();
    expect(dispatch).toHaveBeenCalledOnceWith(UIActions.submitCast());
    fixture.componentInstance.back();
    expect(dispatch).toHaveBeenCalledWith(UIActions.setCastStage({ stage: 'payment' }));
  });
  it('allows player targets and X choices without sending a spell', () => {
    const { fixture, store } = setup({ stage: 'targets' });
    const dispatch = spyOn(store, 'dispatch');
    fixture.nativeElement.querySelector('.player-targets button').click();
    expect(dispatch).toHaveBeenCalledWith(UIActions.addTarget({ targetId: 'p1' }));
    fixture.componentInstance.setX('3');
    expect(dispatch).toHaveBeenCalledWith(UIActions.setCastX({ value: 3 }));
  });
  it('shows server refusals and hides submission controls while sending', () => {
    const { fixture, store } = setup({ stage: 'submitting', error: 'Invalid target' });
    expect(fixture.nativeElement.textContent).toContain('Invalid target');
    expect(fixture.nativeElement.querySelector('.cast-submit')).toBeNull();
    store.overrideSelector(selectCastDraft, null);
    store.refreshState();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cast-prompt')).toBeNull();
  });
});
