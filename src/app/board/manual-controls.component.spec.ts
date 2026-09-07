import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ManualControlsComponent } from './manual-controls.component';
import { ManualControlsService } from './manual-controls.service';
import { SignalRService } from '../services/signalr.service';
import { ToastService } from '../services/toast.service';
import { PermanentDto, PlayerStateDto } from '../models/game.models';
import { makeCard, makePermanent, makePlayer } from '../testing/test-factories';

/**
 * The panel, from the click to the hub call.
 *
 * The real `ManualControlsService` is used with a spy hub rather than a spy service, because the
 * thing worth proving is the whole path: a control that looks right and sends nothing is exactly
 * the failure this board has had before (a cast that stayed in hand with no refusal anywhere).
 */
describe('ManualControlsComponent', () => {
  let fixture: ComponentFixture<ManualControlsComponent>;
  let component: ManualControlsComponent;
  let hub: jasmine.SpyObj<SignalRService>;

  const honour = makePermanent({
    permanentId: 'manual-1',
    enforced: false,
    sourceCard: makeCard({ name: 'Ancestral Vision' }),
  });
  const enforced = makePermanent({
    permanentId: 'engine-1',
    enforced: true,
    sourceCard: makeCard({ name: 'Grizzly Bears' }),
  });
  const alice = makePlayer([], { playerId: 'alice', name: 'Alice', life: 20 });

  beforeEach(async () => {
    hub = jasmine.createSpyObj<SignalRService>('SignalRService', [
      'manualMove',
      'manualTap',
      'manualCounters',
      'manualLife',
    ]);
    hub.manualMove.and.returnValue(Promise.resolve());
    hub.manualTap.and.returnValue(Promise.resolve());
    hub.manualCounters.and.returnValue(Promise.resolve());
    hub.manualLife.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [ManualControlsComponent],
      providers: [
        ManualControlsService,
        { provide: SignalRService, useValue: hub },
        {
          provide: ToastService,
          useValue: jasmine.createSpyObj<ToastService>('ToastService', ['show']),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManualControlsComponent);
    component = fixture.componentInstance;
    // setInput rather than a plain assignment: the component is OnPush, and detectChanges() does
    // not re-check a view nothing has marked dirty. Writing the field straight onto the instance
    // updates the getter and leaves the template showing the previous list — a spec that would
    // pass for the wrong reason as readily as it fails.
    setInputs([honour, enforced], [alice]);
  });

  const setInputs = (permanents: PermanentDto[], players: PlayerStateDto[]) => {
    fixture.componentRef.setInput('permanents', permanents);
    fixture.componentRef.setInput('players', players);
    fixture.detectChanges();
  };

  const rows = () => fixture.debugElement.queryAll(By.css('.mp-object'));
  const click = (selector: string) => {
    fixture.debugElement.query(By.css(selector)).nativeElement.click();
    fixture.detectChanges();
  };

  it('lists only the objects the players have to play themselves', () => {
    expect(rows().length).toBe(1);
    expect(rows()[0].nativeElement.getAttribute('data-object-id')).toBe('manual-1');
    expect(fixture.nativeElement.textContent).toContain('Ancestral Vision');
    expect(fixture.nativeElement.textContent).not.toContain('Grizzly Bears');
  });

  it('badges the row as honour-system', () => {
    expect(fixture.debugElement.query(By.css('.mp-badge.is-honour'))).toBeTruthy();
  });

  it('draws nothing at all when the engine is playing every card on the table', () => {
    setInputs([enforced], [alice]);

    expect(rows().length).toBe(0);
    // Not an empty panel: a board with no honour-system cards on it has no use for the controls,
    // and the badge on each card is what says which kind of table this is.
    expect(fixture.debugElement.query(By.css('.manual-panel'))).toBeNull();
  });

  it('memoizes the filter on the input identity, as a template getter must', () => {
    const first = component.honourSystem;

    expect(component.honourSystem).toBe(first);

    component.permanents = [honour];
    expect(component.honourSystem).not.toBe(first);
  });

  describe('the move menu', () => {
    it('is closed until it is asked for', () => {
      expect(fixture.debugElement.query(By.css('.mp-menu'))).toBeNull();
    });

    it('offers every zone a card can be put in by hand', () => {
      click('.mp-move-btn');

      const labels = fixture.debugElement
        .queryAll(By.css('.mp-menu-item'))
        .map((b) => b.nativeElement.textContent.trim());
      expect(labels).toEqual([
        'Hand',
        'Battlefield',
        'Graveyard',
        'Exile',
        'Library (top)',
        'Library (bottom)',
        'Command',
      ]);
    });

    it('sends the move, then closes', () => {
      click('.mp-move-btn');
      const bottom = fixture.debugElement
        .queryAll(By.css('.mp-menu-item'))
        .find((b) => b.nativeElement.textContent.includes('bottom'));
      bottom!.nativeElement.click();
      fixture.detectChanges();

      expect(hub.manualMove).toHaveBeenCalledWith('manual-1', 'Library', -1, false);
      expect(fixture.debugElement.query(By.css('.mp-menu'))).toBeNull();
    });
  });

  it('taps and untaps the object it is drawn for', () => {
    click('.mp-tap');

    expect(hub.manualTap).toHaveBeenCalledWith('manual-1', true);
  });

  it('counts counters by whatever the card calls them', () => {
    const field = fixture.debugElement.query(By.css('.mp-kind-input')).nativeElement;
    expect(field.value).toBe('+1/+1');

    field.value = 'charge';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const steps = fixture.debugElement.queryAll(By.css('.mp-counters .mp-step'));
    steps[1].nativeElement.click();
    expect(hub.manualCounters).toHaveBeenCalledWith('manual-1', 'charge', 1);

    steps[0].nativeElement.click();
    expect(hub.manualCounters).toHaveBeenCalledWith('manual-1', 'charge', -1);
  });

  it('moves a life total for the seat it is drawn beside', () => {
    const steps = fixture.debugElement.queryAll(By.css('.mp-life .mp-step'));
    steps[1].nativeElement.click();
    expect(hub.manualLife).toHaveBeenCalledWith('alice', 1);

    steps[0].nativeElement.click();
    expect(hub.manualLife).toHaveBeenCalledWith('alice', -1);
  });

  it('shows the counters the engine says are already on it', () => {
    setInputs(
      [
        makePermanent({
          permanentId: 'manual-2',
          enforced: false,
          counters: { PlusOnePlusOne: 2 } as never,
        }),
      ],
      [alice],
    );

    expect(fixture.debugElement.query(By.css('.mp-on')).nativeElement.textContent).toContain(
      '2 × PlusOnePlusOne',
    );
  });
});
