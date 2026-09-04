import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { PlayerSidebarComponent } from './player-sidebar.component';
import { UIActions } from '../../store/ui/ui.actions';
import { makePlayer } from '../../testing/test-factories';

/**
 * The per-player strip: life, poison, commander damage, mana pool, zone counts.
 *
 * Commander damage is the one worth pinning here specifically — it reached the wire model and
 * the (unused) `BoardLayoutService` path, but stopped one file short of the `PlayerStateDto`
 * this component actually binds, so the sidebar had a template with nothing to show no matter
 * how much damage a commander had dealt.
 */
describe('PlayerSidebarComponent', () => {
  let component: PlayerSidebarComponent;
  let fixture: ComponentFixture<PlayerSidebarComponent>;
  let store: MockStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerSidebarComponent],
      providers: [provideMockStore()],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(PlayerSidebarComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing when there is no player', () => {
    component.player = undefined as never;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sidebar')).toBeFalsy();
  });

  it('shows the life total', () => {
    component.player = makePlayer([], { life: 33 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.life-number').textContent.trim()).toBe('33');
  });

  // ---- commander damage (CR 903.10a) --------------------------------

  it('reports no commander damage entries when none has landed', () => {
    component.player = makePlayer([], { commanderDamage: {} });
    expect(component.commanderDamageEntries).toEqual([]);
  });

  it('lists each commander that has dealt damage, by name', () => {
    component.player = makePlayer([], {
      commanderDamage: { 'Alesha, Who Smiles at Death': 12, 'The Ur-Dragon': 6 },
    });

    expect(component.commanderDamageEntries).toEqual([
      { name: 'Alesha, Who Smiles at Death', amount: 12 },
      { name: 'The Ur-Dragon', amount: 6 },
    ]);
  });

  it('drops a commander at zero rather than showing an empty pill', () => {
    component.player = makePlayer([], { commanderDamage: { 'Some Commander': 0 } });
    expect(component.commanderDamageEntries).toEqual([]);
  });

  it('renders a pill in the template for each commander with damage', () => {
    component.player = makePlayer([], { commanderDamage: { 'Alesha, Who Smiles at Death': 12 } });
    fixture.detectChanges();

    const pills = fixture.nativeElement.querySelectorAll('.commander-damage-pill');
    expect(pills.length).toBe(1);
    expect(pills[0].querySelector('.cd-amount').textContent.trim()).toBe('12');
  });

  it('renders no commander-damage row for a player nobody has hit', () => {
    // The negative control: an ordinary player with a commander that has not connected yet.
    component.player = makePlayer([], { commanderDamage: {} });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.commander-damage-row')).toBeFalsy();
  });

  // ---- zone viewer dispatch (pre-existing behaviour, now covered) ---

  it('opens the graveyard viewer for this player', () => {
    component.player = makePlayer([], { playerId: 'p9' });
    const dispatchSpy = spyOn(store, 'dispatch');

    component.openGraveyard();

    expect(dispatchSpy).toHaveBeenCalledWith(
      UIActions.openZoneViewer({ playerId: 'p9', zone: 'graveyard' }),
    );
  });

  it('opens the exile viewer for this player', () => {
    component.player = makePlayer([], { playerId: 'p9' });
    const dispatchSpy = spyOn(store, 'dispatch');

    component.openExile();

    expect(dispatchSpy).toHaveBeenCalledWith(
      UIActions.openZoneViewer({ playerId: 'p9', zone: 'exile' }),
    );
  });
});
