import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PlayerPanelComponent } from './player-panel.component';
import { Seat } from '../../../models/life-counter.models';

/**
 * The panel is the control, so these are tests of the gesture: which half does what, that a
 * burst of taps reads as one event rather than nine, and that a correction leaves no trace.
 */
describe('PlayerPanelComponent', () => {
  let fixture: ComponentFixture<PlayerPanelComponent>;
  let component: PlayerPanelComponent;
  let deltas: number[];

  function seat(overrides: Partial<Seat> = {}): Seat {
    return {
      id: 's0',
      name: 'Nissa',
      life: 40,
      counters: { poison: 0, energy: 0, experience: 0, rad: 0, ticket: 0 },
      commanderDamage: {},
      commanders: 1,
      art: null,
      artSource: 'none',
      artLabel: null,
      hue: 42,
      account: null,
      out: false,
      lossReason: 'Unspecified',
      ...overrides,
    };
  }

  function press(selector: string): void {
    const zone = fixture.nativeElement.querySelector(selector) as HTMLElement;
    zone.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
  }

  function release(selector: string): void {
    const zone = fixture.nativeElement.querySelector(selector) as HTMLElement;
    zone.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlayerPanelComponent] }).compileComponents();

    fixture = TestBed.createComponent(PlayerPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('seat', seat());

    deltas = [];
    component.lifeChange.subscribe((d) => deltas.push(d));
    fixture.detectChanges();
  });

  /** OnPush: a bare property assignment leaves the view unmarked, so inputs go through here. */
  function setSeat(overrides: Partial<Seat>): void {
    fixture.componentRef.setInput('seat', seat(overrides));
    fixture.detectChanges();
  }

  afterEach(() => fixture.destroy());

  it('takes life on the left half and gives it on the right', fakeAsync(() => {
    press('.tap-down');
    release('.tap-down');
    press('.tap-up');
    release('.tap-up');

    expect(deltas).toEqual([-1, 1]);
    tick(2000);
  }));

  it('ignores a non-primary button', fakeAsync(() => {
    const zone = fixture.nativeElement.querySelector('.tap-down') as HTMLElement;
    zone.dispatchEvent(new PointerEvent('pointerdown', { button: 2, bubbles: true }));

    expect(deltas).toEqual([]);
    tick(2000);
  }));

  it('holding a half repeats it', fakeAsync(() => {
    press('.tap-down');
    tick(1500);
    release('.tap-down');

    // One for the press plus however many the repeat managed; the exact count is timing, the
    // point is that a hold is not a single tap.
    expect(deltas.length).toBeGreaterThan(3);
    expect(deltas.every((d) => d === -1)).toBeTrue();
    tick(2000);
  }));

  it('stops repeating when the finger leaves', fakeAsync(() => {
    press('.tap-down');
    tick(1000);
    release('.tap-down');

    const settled = deltas.length;
    tick(3000);

    expect(deltas.length).toBe(settled);
  }));

  it('gathers a burst of taps into one running total', fakeAsync(() => {
    for (let i = 0; i < 5; i++) {
      press('.tap-down');
      release('.tap-down');
      tick(60);
    }
    fixture.detectChanges();

    expect(component.pending).toBe(-5);
    expect(fixture.nativeElement.querySelector('.delta-pending').textContent.trim()).toBe('−5');
    tick(3000);
  }));

  it('commits the total and flies it away once the tapping stops', fakeAsync(() => {
    press('.tap-down');
    release('.tap-down');
    tick(1200);
    fixture.detectChanges();

    expect(component.pending).toBe(0);
    expect(component.flying).toBe(-1);
    expect(fixture.nativeElement.querySelector('.delta-flying')).not.toBeNull();

    tick(1000);
    fixture.detectChanges();
    expect(component.flying).toBeNull();
  }));

  it('shows nothing for a tap that is immediately taken back', fakeAsync(() => {
    press('.tap-down');
    release('.tap-down');
    press('.tap-up');
    release('.tap-up');
    tick(2000);
    fixture.detectChanges();

    // Net zero is a corrected misclick. Flying a "0" past the table would announce a
    // non-event, and the panel would flash for it.
    expect(component.pending).toBe(0);
    expect(component.flying).toBeNull();
    expect(fixture.nativeElement.querySelector('.delta')).toBeNull();
  }));

  it('colours the panel by direction while a change is in flight', fakeAsync(() => {
    press('.tap-up');
    release('.tap-up');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.panel').classList).toContain('mood-gain');
    tick(3000);
  }));

  it('shows poison at zero but hides the resources until they are used', () => {
    expect(component.chips.map((c) => c.spec.kind)).toEqual(['poison']);

    setSeat({ counters: { poison: 0, energy: 3, experience: 0, rad: 0, ticket: 0 } });
    expect(component.chips.map((c) => c.spec.kind)).toEqual(['poison', 'energy']);
  });

  it('memoizes the chips on the seat object so a render pass does not rebuild them', () => {
    const first = component.chips;
    expect(component.chips).toBe(first);

    setSeat({ life: 39 });
    expect(component.chips).not.toBe(first);
  });

  it('says why a player is out, with the rule', () => {
    setSeat({ life: 0 });

    expect(component.lossReason).toBe('LifeTotal');
    expect(fixture.nativeElement.querySelector('.out-why').textContent).toContain('CR 704.5a');
  });

  it('reports the worst single commander rather than the sum', () => {
    setSeat({ commanderDamage: { 'a#0': 13, 'b#0': 9 } });
    expect(component.worstCommanderDamage).toBe(13);
  });

  it('turns over for a player sitting across the table', () => {
    fixture.componentRef.setInput('flipped', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.panel').classList).toContain('is-flipped');
  });

  it('drops a held repeat when the panel goes away', fakeAsync(() => {
    press('.tap-down');
    const atDestroy = deltas.length;

    fixture.destroy();
    tick(3000);

    // Eight players down to four destroys panels mid-hold; a timer that outlived one would
    // keep emitting into a dead handler.
    expect(deltas.length).toBe(atDestroy);
  }));
});
