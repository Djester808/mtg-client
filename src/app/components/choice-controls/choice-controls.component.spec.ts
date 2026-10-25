import { makeCard } from '../../testing/test-factories';
import { TestBed } from '@angular/core/testing';
import { ChoiceControlsComponent } from './choice-controls.component';
import { ChoiceSelectionService } from '../../game/choices/choice-selection.service';
import { ChoiceDto } from '../../models/game.models';

describe('ChoiceControlsComponent', () => {
  const choice: ChoiceDto = {
    id: 'bottom',
    playerId: 'p1',
    kind: 'mulligan-bottom',
    prompt: 'Choose bottom order',
    minPicks: 2,
    maxPicks: 2,
    isOrdering: true,
    isDivision: false,
    totalToDivide: 0,
    options: [
      { id: 'a', label: 'First card' },
      { id: 'b', label: 'Second card' },
    ],
  };
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [ChoiceControlsComponent],
      providers: [ChoiceSelectionService],
    }),
  );
  it('shows remaining search picks and keeps partial completion available', () => {
    const fixture = TestBed.createComponent(ChoiceControlsComponent);
    const request = { ...choice, kind: 'search', minPicks: 1, isOrdering: false };
    fixture.componentRef.setInput('choice', request);
    fixture.detectChanges();
    const selection = TestBed.inject(ChoiceSelectionService);
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      '2 remaining',
    );
    expect(fixture.nativeElement.querySelector('.confirm').disabled).toBeTrue();
    selection.select(request, 'a');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      '1 remaining',
    );
    expect(fixture.nativeElement.querySelector('.confirm').disabled).toBeFalse();
    fixture.componentRef.setInput('pending', true);
    fixture.componentRef.setInput('submission', { control: 'option', picks: ['a', 'b'] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.choice-actions button').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('button.choice').length).toBe(2);
  });
  for (const control of ['confirm', 'skip'] as const) {
    it('retains only the submitted search action while sending ' + control, () => {
      const fixture = TestBed.createComponent(ChoiceControlsComponent);
      fixture.componentRef.setInput('choice', { ...choice, kind: 'search', minPicks: 0 });
      fixture.componentRef.setInput('submission', { control, picks: [] });
      fixture.componentRef.setInput('pending', true);
      fixture.detectChanges();
      const actions = fixture.nativeElement.querySelectorAll('.choice-actions button');
      expect(actions.length).toBe(1);
      expect(actions[0].disabled).toBeTrue();
      expect(actions[0].textContent).toContain(control === 'skip' ? 'Choose none' : 'Sending');
      fixture.componentRef.setInput('pending', false);
      fixture.componentRef.setInput('submission', null);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.choice-actions button').length).toBe(3);
    });
  }
  for (const kind of ['mulligan', 'search'])
    it('retains the submitted ' + kind + ' option and restores alternatives after failure', () => {
      const fixture = TestBed.createComponent(ChoiceControlsComponent);
      fixture.componentRef.setInput('choice', {
        ...choice,
        kind,
        minPicks: 1,
        maxPicks: 1,
        isOrdering: false,
      });
      fixture.componentRef.setInput('submission', { control: 'option', picks: ['b'] });
      fixture.componentRef.setInput('pending', true);
      fixture.detectChanges();
      const buttons = fixture.nativeElement.querySelectorAll('button.choice');
      expect(buttons.length).toBe(1);
      expect(buttons[0].textContent).toContain('Second card');
      expect(buttons[0].disabled).toBeTrue();
      fixture.componentRef.setInput('pending', false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('button.choice').length).toBe(2);
    });
  it('rejects search drags symmetrically while preserving taps and keyboard activation', () => {
    const fixture = TestBed.createComponent(ChoiceControlsComponent);
    fixture.componentRef.setInput('choice', { ...choice, kind: 'search' });
    fixture.detectChanges();
    const pick = spyOn(fixture.componentInstance.pick, 'emit');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.choice');
    for (const [x, y] of [
      [20, 0],
      [-20, 0],
      [0, 20],
      [0, -20],
      [7, 0],
      [5, 5],
    ]) {
      button.dispatchEvent(new PointerEvent('pointerdown', { clientX: 50, clientY: 50 }));
      button.dispatchEvent(
        new MouseEvent('click', { detail: 1, clientX: 50 + x, clientY: 50 + y }),
      );
    }
    button.dispatchEvent(new PointerEvent('pointerdown', { clientX: 50, clientY: 50 }));
    button.dispatchEvent(new PointerEvent('pointercancel'));
    button.dispatchEvent(new MouseEvent('click', { detail: 1, clientX: 50, clientY: 50 }));
    expect(pick).not.toHaveBeenCalled();
    const down = new PointerEvent('pointerdown', { clientX: 50, clientY: 50 });
    const held = new MouseEvent('click', { detail: 1, clientX: 50, clientY: 50 });
    Object.defineProperty(down, 'timeStamp', { value: 1000 });
    Object.defineProperty(held, 'timeStamp', { value: 1501 });
    button.dispatchEvent(down);
    button.dispatchEvent(held);
    expect(pick).not.toHaveBeenCalled();
    button.dispatchEvent(new PointerEvent('pointerdown', { clientX: 50, clientY: 50 }));
    button.dispatchEvent(new MouseEvent('click', { detail: 1, clientX: 56, clientY: 50 }));
    expect(pick).toHaveBeenCalledOnceWith('a');
    pick.calls.reset();
    button.click();
    expect(pick).toHaveBeenCalledOnceWith('a');
    pick.calls.reset();
    fixture.componentRef.setInput('pending', true);
    fixture.detectChanges();
    button.click();
    expect(pick).not.toHaveBeenCalled();
  });
  it('routes MTGO mulligan keys only to offered options through pick', () => {
    const fixture = TestBed.createComponent(ChoiceControlsComponent);
    const request = {
      ...choice,
      kind: 'mulligan',
      minPicks: 1,
      maxPicks: 1,
      options: [
        { id: 'keep', label: 'Keep' },
        { id: 'mulligan', label: 'Mulligan' },
      ],
    };
    fixture.componentRef.setInput('choice', request);
    fixture.detectChanges();
    const pick = spyOn(fixture.componentInstance.pick, 'emit');
    const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event;
    };
    expect(press('3').defaultPrevented).toBeTrue();
    expect(pick).toHaveBeenCalledWith('mulligan');
    expect(press('4').defaultPrevented).toBeTrue();
    expect(pick).toHaveBeenCalledWith('keep');
    expect(fixture.nativeElement.querySelector('.choice').getAttribute('aria-keyshortcuts')).toBe(
      '4',
    );
    pick.calls.reset();
    for (const key of ['1', 'Enter', 'Escape']) press(key);
    for (const init of [
      { repeat: true },
      { isComposing: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { shiftKey: true },
    ])
      press('3', init);
    const prevented = new KeyboardEvent('keydown', { key: '3', cancelable: true });
    prevented.preventDefault();
    document.dispatchEvent(prevented);
    for (const tag of ['input', 'textarea', 'select']) {
      const element = document.createElement(tag);
      document.body.appendChild(element);
      press('3', {}, element);
      element.remove();
    }
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    press('4', {}, editable);
    editable.remove();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    press('3', {}, dialog);
    dialog.remove();
    expect(pick).not.toHaveBeenCalled();
    fixture.componentRef.setInput('pending', true);
    fixture.detectChanges();
    press('3');
    expect(pick).not.toHaveBeenCalled();
    fixture.componentRef.setInput('pending', false);
    fixture.componentRef.setInput('choice', {
      ...request,
      options: [{ id: 'keep', label: 'Keep' }],
    });
    fixture.detectChanges();
    press('3');
    expect(pick).not.toHaveBeenCalled();
    fixture.componentRef.setInput('choice', { ...request, kind: 'search' });
    fixture.detectChanges();
    press('4');
    expect(pick).not.toHaveBeenCalled();
    fixture.destroy();
    press('3');
    expect(pick).not.toHaveBeenCalled();
  });
  for (const state of ['pending', 'ready']) {
    it('locks submission and ordering while ' + state + ' and restores retained picks', () => {
      const fixture = TestBed.createComponent(ChoiceControlsComponent);
      fixture.componentRef.setInput('choice', choice);
      fixture.detectChanges();
      const selection = TestBed.inject(ChoiceSelectionService);
      selection.select(choice, 'a');
      selection.select(choice, 'b');
      fixture.componentRef.setInput(state, state === 'pending');
      fixture.detectChanges();
      const pick = spyOn(fixture.componentInstance.pick, 'emit');
      const buttons = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ) as HTMLButtonElement[];
      expect(buttons.every((button) => button.disabled)).toBeTrue();
      buttons.forEach((button) => button.click());
      expect(pick).not.toHaveBeenCalled();
      expect(selection.picks).toEqual(['a', 'b']);
      fixture.componentRef.setInput(state, state !== 'pending');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.confirm').disabled).toBeFalse();
      expect(selection.picks).toEqual(['a', 'b']);
    });
  }
  it('shows authorized card art and opens details without submitting a choice', () => {
    const fixture = TestBed.createComponent(ChoiceControlsComponent);
    fixture.componentRef.setInput('choice', {
      ...choice,
      options: [
        {
          id: 'a',
          label: 'Card',
          card: makeCard({ cardId: 'secret', imageUriNormal: 'card.jpg' }),
        },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.choice img').getAttribute('src')).toBe('card.jpg');
    const pick = spyOn(fixture.componentInstance.pick, 'emit');
    const details = spyOn(fixture.componentInstance.details, 'emit');
    fixture.nativeElement.querySelector('.choice-details').click();
    expect(details).toHaveBeenCalledWith('secret');
    expect(pick).not.toHaveBeenCalled();
    fixture.componentRef.setInput('choice', { ...choice, options: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.choice img')).toBeNull();
  });
  it('filters offered labels without losing selections and clears the filter for a new choice', () => {
    const fixture = TestBed.createComponent(ChoiceControlsComponent);
    const request = { ...choice, kind: 'search' };
    fixture.componentRef.setInput('choice', request);
    fixture.detectChanges();
    const selection = TestBed.inject(ChoiceSelectionService);
    selection.select(request, 'a');
    const input = fixture.nativeElement.querySelector('input');
    input.value = 'second';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.choice').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.choice').textContent).toContain('Second card');
    expect(selection.picks).toEqual(['a']);
    fixture.componentRef.setInput('choice', { ...request, id: 'next' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.choice').length).toBe(2);
    expect(selection.picks).toEqual([]);
    fixture.destroy();
  });
  it('renders authorized labels, ordered selection, and confirmation readiness', () => {
    const fixture = TestBed.createComponent(ChoiceControlsComponent);
    fixture.componentRef.setInput('choice', choice);
    fixture.detectChanges();
    const selection = TestBed.inject(ChoiceSelectionService);
    const emitted: string[] = [];
    fixture.componentInstance.pick.subscribe((id) => {
      emitted.push(id);
      selection.select(choice, id);
    });
    const buttons = fixture.nativeElement.querySelectorAll('.choice');
    expect(buttons.length).toBe(2);
    expect(fixture.nativeElement.querySelector('.confirm').disabled).toBeTrue();
    buttons[1].click();
    buttons[0].click();
    fixture.detectChanges();
    expect(emitted).toEqual(['b', 'a']);
    fixture.nativeElement.querySelector('.choice-order button').click();
    fixture.detectChanges();
    expect(selection.picks).toEqual(['a', 'b']);
    fixture.nativeElement.querySelectorAll('.choice-order button')[1].click();
    fixture.detectChanges();
    expect(selection.picks).toEqual(['b', 'a']);
    expect(buttons[0].textContent).toContain('2.');
    expect(fixture.nativeElement.querySelector('.confirm').disabled).toBeFalse();
    spyOn(fixture.componentInstance.confirm, 'emit');
    fixture.nativeElement.querySelector('.confirm').click();
    expect(fixture.componentInstance.confirm.emit).toHaveBeenCalled();
    fixture.destroy();
  });
  it('exposes choose-none only when permitted and does not render hidden options', () => {
    const fixture = TestBed.createComponent(ChoiceControlsComponent);
    fixture.componentRef.setInput('choice', { ...choice, options: null, minPicks: 0, maxPicks: 1 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.choice').length).toBe(0);
    spyOn(fixture.componentInstance.skip, 'emit');
    fixture.nativeElement.querySelector('.cancel').click();
    expect(fixture.componentInstance.skip.emit).toHaveBeenCalled();
    fixture.destroy();
  });
});
