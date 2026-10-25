import { CardCastingService } from '../../game/card-casting.service';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { BehaviorSubject, of } from 'rxjs';
import { ChoiceSelectionService } from '../../game/choices/choice-selection.service';
import { LibraryRevealComponent } from './library-reveal.component';
import { CardOptionsMenuComponent } from '../card-options-menu/card-options-menu.component';
import { CardDto, CardType, ChoiceDto } from '../../models/game.models';
@Component({ selector: 'app-card-modal', standalone: true, template: '' })
class DetailStubComponent {
  @Input() card: CardDto | null = null;
  @Input() gameplay = false;
  @Output() closed = new EventEmitter<void>();
}
describe('LibraryRevealComponent', () => {
  it('authorizes top placement only for the current inspected unique option and blocks busy or stale actions', () => {
    const card = { cardId: 'a', ownerId: 'p0', name: 'Island' } as CardDto;
    const second = { cardId: 'b', ownerId: 'p0', name: 'Forest' } as CardDto;
    const choice = {
      id: 'order-1',
      kind: 'library-top-order',
      isOrdering: true,
      isDivision: false,
      minPicks: 2,
      maxPicks: 2,
      options: [
        { id: 'pick-a', label: 'Island', card },
        { id: 'pick-b', label: 'Forest', card: second },
      ],
    } as ChoiceDto;
    const state = new BehaviorSubject({ inspectedLibraryCards: [card, second], choice });
    TestBed.configureTestingModule({
      imports: [LibraryRevealComponent],
      providers: [{ provide: Store, useValue: { select: () => state } }],
    });
    TestBed.overrideComponent(LibraryRevealComponent, {
      set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
    });
    const fixture = TestBed.createComponent(LibraryRevealComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const emit = spyOn(component.topPlacement, 'emit');
    const open = () => {
      const button = Array.from(
        fixture.nativeElement.querySelectorAll('.inspection-cards button'),
      ).find((item: any) => item.textContent.includes('Island')) as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      fixture.detectChanges();
    };
    open();
    expect(component.topOrderOption?.id).toBe('pick-a');
    const action = Array.from(fixture.nativeElement.querySelectorAll('[role="menuitem"]')).find(
      (item: any) => item.textContent.trim() === 'Put on top of your library',
    ) as HTMLButtonElement;
    expect(action).toBeTruthy();
    component.pending = true;
    component.performExtraAction('order-top');
    expect(emit).not.toHaveBeenCalled();
    component.pending = false;
    component.ready = false;
    component.performExtraAction('order-top');
    expect(emit).not.toHaveBeenCalled();
    component.ready = true;
    component.performExtraAction('order-top');
    expect(emit).toHaveBeenCalledOnceWith({ choice, optionId: 'pick-a' });
    expect(component.context).toBeNull();
    emit.calls.reset();
    component.picks = ['pick-b', 'pick-a'];
    expect(component.topPosition(card)).toBe(2);
    expect(component.topPosition(second)).toBe(1);
    open();
    state.next({ inspectedLibraryCards: [card, second], choice: { ...choice, id: 'order-2' } });
    fixture.detectChanges();
    component.performExtraAction('order-top');
    expect(emit).not.toHaveBeenCalled();
    open();
    state.next({ inspectedLibraryCards: [], choice: { ...choice, id: 'order-2' } });
    fixture.detectChanges();
    component.performExtraAction('order-top');
    expect(component.context).toBeNull();
    expect(emit).not.toHaveBeenCalled();
    for (const invalid of [
      { ...choice, minPicks: 0 },
      { ...choice, maxPicks: 3 },
      { ...choice, isOrdering: false },
      { ...choice, isDivision: true },
      { ...choice, options: [choice.options![0], { ...choice.options![0], id: 'duplicate' }] },
    ]) {
      state.next({ inspectedLibraryCards: [card, second], choice: invalid });
      fixture.detectChanges();
      open();
      component.performExtraAction('order-top');
      expect(emit).not.toHaveBeenCalled();
    }
    fixture.destroy();
  });

  it('opens a new active inspection, preserves manual collapse and keeps history collapsed', () => {
    const card = { cardId: 'a', ownerId: 'p0', name: 'Forest' } as CardDto;
    const state = new BehaviorSubject({
      inspectedLibraryCards: [card],
      lastReveal: { cards: [card] },
    });
    TestBed.configureTestingModule({
      imports: [LibraryRevealComponent],
      providers: [{ provide: Store, useValue: { select: () => state } }],
    });
    TestBed.overrideComponent(LibraryRevealComponent, {
      set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
    });
    const fixture = TestBed.createComponent(LibraryRevealComponent);
    fixture.detectChanges();
    const active = () =>
      fixture.nativeElement.querySelector('[data-active-inspection]') as HTMLDetailsElement | null;
    const original = active()!;
    expect(original.open).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('details:not([data-active-inspection])').open,
    ).toBeFalse();
    original.querySelector('summary')!.click();
    expect(original.open).toBeFalse();
    state.next({
      inspectedLibraryCards: [{ ...card, name: 'Renamed' }],
      lastReveal: { cards: [card] },
    });
    fixture.detectChanges();
    expect(active()).toBe(original);
    expect(active()!.open).toBeFalse();
    state.next({ inspectedLibraryCards: [], lastReveal: { cards: [card] } });
    fixture.detectChanges();
    expect(active()).toBeNull();
    state.next({ inspectedLibraryCards: [card], lastReveal: { cards: [card] } });
    fixture.detectChanges();
    expect(active()!.open).toBeTrue();
    expect(active()).not.toBe(original);
  });
  for (const land of [false, true]) {
    it(
      'delegates only currently offered inspected ' +
        (land ? 'lands' : 'spells') +
        ' to shared casting',
      () => {
        const card = {
          cardId: 'o7',
          ownerId: 'p0',
          name: 'Scout',
          cardTypes: [land ? CardType.Land : CardType.Creature],
        } as CardDto;
        const state = new BehaviorSubject({
          inspectedLibraryCards: [card],
          castableCards: land ? [] : ['o7'],
          playableLands: land ? ['o7'] : [],
        });
        const casting = jasmine.createSpyObj<CardCastingService>('casting', ['start']);
        TestBed.configureTestingModule({
          imports: [LibraryRevealComponent],
          providers: [
            { provide: Store, useValue: { select: () => state } },
            { provide: CardCastingService, useValue: casting },
          ],
        });
        TestBed.overrideComponent(LibraryRevealComponent, {
          set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
        });
        const fixture = TestBed.createComponent(LibraryRevealComponent);
        fixture.detectChanges();
        const component = fixture.componentInstance;
        const open = () => {
          component.context = { card, active: true, x: 0, y: 0 };
        };
        open();
        expect(component.playLabel).toBe(land ? 'Play land' : 'Cast');
        component.performAction();
        expect(casting.start).toHaveBeenCalledOnceWith(card);
        expect(component.context).toBeNull();
        open();
        component.ready = false;
        expect(component.playLabel).toBe('');
        component.performAction();
        component.ready = true;
        fixture.componentRef.setInput('pending', true);
        component.performAction();
        fixture.componentRef.setInput('pending', false);
        component.interactionIdle = false;
        expect(component.playLabel).toBe('');
        component.performAction();
        component.interactionIdle = true;
        component.context!.active = false;
        expect(component.playLabel).toBe('');
        component.performAction();
        open();
        state.next({
          inspectedLibraryCards: [card],
          castableCards: land ? ['o7'] : [],
          playableLands: land ? [] : ['o7'],
        });
        fixture.detectChanges();
        expect(component.playLabel).toBe('');
        component.performAction();
        expect(casting.start).toHaveBeenCalledTimes(1);
      },
    );
  }
  it('offers reposition only for current own manual inspection and respects pending actions', () => {
    const card = { cardId: 'o7', ownerId: 'p0', name: 'Forest' } as CardDto;
    const state = new BehaviorSubject({
      inspectedLibraryCards: [card],
      manualLibraryLookActive: true,
      manualLibraryActionsAllowed: true,
    });
    TestBed.configureTestingModule({
      imports: [LibraryRevealComponent],
      providers: [{ provide: Store, useValue: { select: () => state } }],
    });
    TestBed.overrideComponent(LibraryRevealComponent, {
      set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
    });
    const fixture = TestBed.createComponent(LibraryRevealComponent);
    fixture.componentRef.setInput('localPlayerId', 'p0');
    const emitted = jasmine.createSpy('reposition');
    fixture.componentInstance.libraryReposition.subscribe(emitted);
    fixture.detectChanges();
    const open = () => {
      fixture.nativeElement
        .querySelector('.inspection-cards button')
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };
    open();
    expect(fixture.nativeElement.textContent).toContain('Put on top of library');
    fixture.componentInstance.reposition('top');
    expect(emitted).toHaveBeenCalledWith({ cardId: 'o7', position: 0 });
    open();
    fixture.componentInstance.reposition('bottom');
    expect(emitted).toHaveBeenCalledWith({ cardId: 'o7', position: -1 });
    open();
    fixture.componentRef.setInput('repositionBusy', true);
    fixture.detectChanges();
    fixture.componentInstance.reposition('top');
    expect(emitted).toHaveBeenCalledTimes(2);
    fixture.componentRef.setInput('repositionBusy', false);
    fixture.componentRef.setInput('interactionIdle', false);
    fixture.detectChanges();
    expect(fixture.componentInstance.canReposition).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('Put on top of library');
    fixture.componentInstance.reposition('top');
    expect(emitted).toHaveBeenCalledTimes(2);
    fixture.componentRef.setInput('interactionIdle', true);
    fixture.componentRef.setInput('localPlayerId', 'p1');
    fixture.detectChanges();
    expect(fixture.componentInstance.canReposition).toBeFalse();
    fixture.componentInstance.reposition('top');
    expect(emitted).toHaveBeenCalledTimes(2);
    fixture.componentRef.setInput('localPlayerId', 'p0');
    state.next({
      inspectedLibraryCards: [],
      manualLibraryLookActive: false,
      manualLibraryActionsAllowed: true,
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.context).toBeNull();
    fixture.componentInstance.reposition('bottom');
    expect(emitted).toHaveBeenCalledTimes(2);
  });
  it('shares multi-card search limits, deselection and order with the prompt selection service', () => {
    const cards = ['a', 'b', 'c'].map(
      (cardId) => ({ cardId, ownerId: 'p0', name: cardId }) as CardDto,
    );
    const choice = {
      id: 'multi-search',
      kind: 'search',
      minPicks: 1,
      maxPicks: 2,
      options: cards.map((card) => ({ id: 'pick-' + card.cardId, label: card.name, card })),
    } as ChoiceDto;
    const state = new BehaviorSubject({ inspectedLibraryCards: cards, choice });
    TestBed.configureTestingModule({
      imports: [LibraryRevealComponent],
      providers: [{ provide: Store, useValue: { select: () => state } }],
    });
    TestBed.overrideComponent(LibraryRevealComponent, {
      set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
    });
    const fixture = TestBed.createComponent(LibraryRevealComponent);
    const selection = new ChoiceSelectionService();
    const answers: string[][] = [];
    fixture.componentInstance.choicePick.subscribe(({ choice: request, optionId }) => {
      const answer = selection.select(request, optionId);
      fixture.componentRef.setInput('picks', selection.picks);
      if (answer) answers.push(answer);
    });
    fixture.detectChanges();
    const choose = (index: number, pending = false) => {
      fixture.componentRef.setInput('pending', pending);
      fixture.nativeElement
        .querySelectorAll('.inspection-cards button')
        [index].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
      const action = fixture.nativeElement.querySelectorAll(
        '[role="menuitem"]',
      )[1] as HTMLButtonElement;
      expect(action.textContent).toContain('Toggle search selection');
      expect(action.disabled).toBe(pending);
      action.click();
      fixture.detectChanges();
    };
    choose(1);
    choose(0);
    expect(selection.picks).toEqual(['pick-b', 'pick-a']);
    expect(fixture.nativeElement.querySelectorAll('details button.is-picked').length).toBe(2);
    choose(2);
    expect(selection.picks).toEqual(['pick-b', 'pick-a']);
    expect(fixture.nativeElement.querySelectorAll('details button.is-picked').length).toBe(2);
    choose(1);
    expect(selection.picks).toEqual(['pick-a']);
    choose(2, true);
    expect(selection.picks).toEqual(['pick-a']);
    choose(2);
    expect(selection.picks).toEqual(['pick-a', 'pick-c']);
    expect(selection.canSubmit(choice)).toBeTrue();
    expect(answers).toEqual([
      ['pick-b', 'pick-a'],
      ['pick-a', 'pick-c'],
    ]);
    const highlighted = () =>
      [...fixture.nativeElement.querySelectorAll('details button.is-picked')].map(
        (button: Element) => button.textContent?.trim(),
      );
    expect(highlighted().length).toBe(2);
    expect(highlighted().every((text) => text?.includes('Selected for search'))).toBeTrue();
    selection.reset();
    fixture.componentRef.setInput('picks', selection.picks);
    fixture.detectChanges();
    expect(highlighted()).toEqual([]);
  });
  it('offers only an unambiguous current search option and delegates selection without sending an answer', () => {
    const card = { cardId: 'mountain', ownerId: 'p0', name: 'Mountain' } as CardDto;
    const choice = {
      id: 'search-1',
      kind: 'search',
      maxPicks: 1,
      options: [{ id: 'pick-mountain', label: 'Mountain', card }],
    } as ChoiceDto;
    const state = new BehaviorSubject({ inspectedLibraryCards: [card], choice });
    TestBed.configureTestingModule({
      imports: [LibraryRevealComponent],
      providers: [{ provide: Store, useValue: { select: () => state } }],
    });
    TestBed.overrideComponent(LibraryRevealComponent, {
      set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
    });
    const fixture = TestBed.createComponent(LibraryRevealComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const emit = spyOn(component.choicePick, 'emit');
    const open = () => {
      fixture.nativeElement
        .querySelector('.inspection-cards button')
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };
    open();
    expect(component.searchOption).toBe(choice.options![0]);
    expect(component.searchOption).toBe(choice.options![0]);
    fixture.nativeElement.querySelectorAll('[role="menuitem"]')[1].click();
    expect(emit).toHaveBeenCalledOnceWith({ choice, optionId: 'pick-mountain' });
    expect(component.context).toBeNull();
    emit.calls.reset();
    open();
    component.pending = true;
    component.pickSearch();
    expect(emit).not.toHaveBeenCalled();
    component.pending = false;
    state.next({ inspectedLibraryCards: [card], choice: { ...choice, id: 'search-2' } });
    fixture.detectChanges();
    expect(component.context).toBeNull();
    component.pickSearch();
    expect(emit).not.toHaveBeenCalled();
    open();
    component.context!.active = false;
    expect(component.searchOption).toBeNull();
    component.context!.active = true;
    state.next({ inspectedLibraryCards: [card], choice: { ...choice, options: [] } });
    fixture.detectChanges();
    open();
    expect(component.searchOption).toBeNull();
    state.next({
      inspectedLibraryCards: [card],
      choice: {
        ...choice,
        options: [...choice.options!, { ...choice.options![0], id: 'alternative' }],
      },
    });
    fixture.detectChanges();
    expect(component.searchOption).toBeNull();
    component.pickSearch();
    expect(emit).not.toHaveBeenCalled();
  });
  it('opens details through the shared menu and expires an active menu with inspection permission', () => {
    const card = { cardId: 'o8', ownerId: 'p0', name: 'Mountain' } as CardDto;
    const state = new BehaviorSubject({ inspectedLibraryCards: [card] });
    TestBed.configureTestingModule({
      imports: [LibraryRevealComponent],
      providers: [{ provide: Store, useValue: { select: () => state } }],
    });
    TestBed.overrideComponent(LibraryRevealComponent, {
      set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
    });
    const fixture = TestBed.createComponent(LibraryRevealComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '.inspection-cards button',
    ) as HTMLButtonElement;
    button.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 80 }),
    );
    fixture.detectChanges();
    expect(fixture.componentInstance.context?.card).toBe(card);
    expect(fixture.componentInstance.selected).toBeNull();
    fixture.nativeElement.querySelector('[role="menuitem"]').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected).toBe(card);
    expect(fixture.componentInstance.context).toBeNull();
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).not.toBeNull();
    state.next({ inspectedLibraryCards: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
    expect(fixture.componentInstance.selected).toBeNull();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(fixture.componentInstance.context).toBeNull();
  });
  it('separates owners and preserves an open library through rename and another owner expiring', () => {
    const first = { cardId: 'a', ownerId: 'p0', name: 'Forest' } as CardDto;
    const second = { cardId: 'b', ownerId: 'p1', name: 'Island' } as CardDto;
    const state = new BehaviorSubject({
      inspectedLibraryCards: [first, second],
      players: [
        { playerId: 'p0', name: 'Alice' },
        { playerId: 'p1', name: 'Bob' },
      ],
    });
    TestBed.configureTestingModule({
      imports: [LibraryRevealComponent],
      providers: [{ provide: Store, useValue: { select: () => state } }],
    });
    TestBed.overrideComponent(LibraryRevealComponent, {
      set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
    });
    const fixture = TestBed.createComponent(LibraryRevealComponent);
    fixture.detectChanges();
    const alice = fixture.nativeElement.querySelector(
      '[data-library-owner="p0"]',
    ) as HTMLDetailsElement;
    const bob = fixture.nativeElement.querySelector(
      '[data-library-owner="p1"]',
    ) as HTMLDetailsElement;
    expect(alice.textContent).toContain('Alice');
    expect(alice.textContent).not.toContain('Island');
    expect(bob.textContent).toContain('Bob');
    expect(bob.textContent).not.toContain('Forest');
    alice.open = true;
    bob.querySelector<HTMLButtonElement>('.inspection-cards button')!.click();
    fixture.detectChanges();
    state.next({ inspectedLibraryCards: [first], players: [{ playerId: 'p0', name: 'Renamed' }] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-library-owner="p0"]')).toBe(alice);
    expect(alice.open).toBeTrue();
    expect(alice.textContent).toContain('Renamed');
    expect(fixture.nativeElement.querySelector('[data-library-owner="p1"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-card-modal')).toBeNull();
  });

  it('closes active inspection and its detail when permission expires, keeping only history', () => {
    const card = { cardId: 'o8', name: 'Mountain', oracleId: 'mountain' } as CardDto;
    const state = new BehaviorSubject({
      inspectedLibraryCards: [card],
      lastLook: { by: 'p0', cards: [card] },
    });
    TestBed.configureTestingModule({
      imports: [LibraryRevealComponent],
      providers: [{ provide: Store, useValue: { select: () => state } }],
    });
    TestBed.overrideComponent(LibraryRevealComponent, {
      set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
    });
    const fixture = TestBed.createComponent(LibraryRevealComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Inspecting library');
    expect(fixture.nativeElement.textContent).not.toContain('Last look');
    fixture.nativeElement.querySelector('.inspection-cards button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-card-modal')).toBeNull();
    fixture.nativeElement.querySelector('[role="menuitem"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-card-modal')).not.toBeNull();
    state.next({ inspectedLibraryCards: [], lastLook: { by: 'p0', cards: [card] } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-active-inspection]')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-card-modal')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Last look');
  });

  it('keeps the inspection list open when the game view refreshes', () => {
    const state = new BehaviorSubject({ lastLook: { by: 'p0', cards: [] } });
    TestBed.configureTestingModule({
      imports: [LibraryRevealComponent],
      providers: [{ provide: Store, useValue: { select: () => state } }],
    });
    TestBed.overrideComponent(LibraryRevealComponent, {
      set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
    });
    const fixture = TestBed.createComponent(LibraryRevealComponent);
    fixture.detectChanges();
    const details = fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    state.next({ lastLook: { by: 'p0', cards: [] } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('details')).toBe(details);
    expect(details.open).toBeTrue();
  });
  it('opens historical details without selecting a live game object', () => {
    const card = {
      name: 'Mountain',
      oracleId: 'mountain',
      cardId: '',
      imageUriNormal: 'mountain.jpg',
    } as CardDto;
    const store = { select: () => of({ lastReveal: { by: 'p0', cards: [card] } }) };
    TestBed.configureTestingModule({
      imports: [LibraryRevealComponent],
      providers: [{ provide: Store, useValue: store }],
    });
    TestBed.overrideComponent(LibraryRevealComponent, {
      set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
    });
    const fixture = TestBed.createComponent(LibraryRevealComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Last reveal');
    fixture.nativeElement.querySelector('.inspection-cards button').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected).toBe(card);
    expect(fixture.nativeElement.querySelector('app-card-modal')).not.toBeNull();
  });
  it('shows no reveal control before anything has been revealed', () => {
    TestBed.configureTestingModule({
      imports: [LibraryRevealComponent],
      providers: [{ provide: Store, useValue: { select: () => of(null) } }],
    });
    TestBed.overrideComponent(LibraryRevealComponent, {
      set: { imports: [CommonModule, DetailStubComponent, CardOptionsMenuComponent] },
    });
    const fixture = TestBed.createComponent(LibraryRevealComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('details')).toBeNull();
  });
});
