import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PermanentDto, PlayerStateDto } from '../models/game.models';
import { ManualControlsService, ManualZoneOption } from './manual-controls.service';

/**
 * The honour system's controls: what a player does themselves for a card the engine cannot play.
 *
 * The deck gate admits a card in one of three ways and this panel is the third. An enforced
 * object is played by the engine and badged as such on its own card; an honour-system object is
 * badged differently and listed here, with the four things the players have to be able to do by
 * hand — put it in a zone, turn it sideways, count counters on it, and move a life total.
 *
 * It is a panel rather than a control per card because the actions are ones a player takes
 * deliberately and sometimes for somebody else's permanent: a menu hidden behind a right-click
 * on a 90-pixel card is not where "put this on the bottom of your library" belongs, and the
 * board's own click already means five other things depending on the mode. The badge on the card
 * is what points here.
 *
 * Every decision this makes is `ManualControlsService`'s (see mtg-client/CLAUDE.md: logic lives
 * in services); the component holds which menu is open and which word the counters are being
 * called, and nothing else.
 */
@Component({
  selector: 'app-manual-controls',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manual-controls.component.html',
  styleUrls: ['./manual-controls.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualControlsComponent {
  private readonly manual = inject(ManualControlsService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() permanents: readonly PermanentDto[] = [];
  @Input() players: readonly PlayerStateDto[] = [];

  /** Which object's move menu is open, or null. One at a time; opening another closes this. */
  openMenuFor: string | null = null;

  /** What the counters on each object are being called, by object id. */
  private readonly kinds = new Map<string, string>();

  readonly zones: readonly ManualZoneOption[] = this.manual.zones;

  /** The default word, because most of what a player counts by hand is a +1/+1 (CR 122.1). */
  static readonly DefaultKind = '+1/+1';

  /**
   * The honour-system objects, memoized on the input's identity.
   *
   * A template-called getter runs on every change-detection pass (mtg-client/CLAUDE.md), and the
   * store hands back a new array per change, so the identity check is both the cache key and
   * exactly the invalidation this needs.
   */
  private memo: { input: readonly PermanentDto[]; result: PermanentDto[] } | null = null;

  get honourSystem(): PermanentDto[] {
    if (this.memo?.input === this.permanents) return this.memo.result;
    const result = this.manual.honourSystem(this.permanents);
    this.memo = { input: this.permanents, result };
    return result;
  }

  get hasHonourSystem(): boolean {
    return this.honourSystem.length > 0;
  }

  toggleMenu(permanent: PermanentDto): void {
    this.openMenuFor = this.openMenuFor === permanent.permanentId ? null : permanent.permanentId;
    this.cdr.markForCheck();
  }

  isMenuOpen(permanent: PermanentDto): boolean {
    return this.openMenuFor === permanent.permanentId;
  }

  move(permanent: PermanentDto, optionId: string): void {
    void this.manual.move(permanent, optionId);
    this.openMenuFor = null;
    this.cdr.markForCheck();
  }

  /** The tap control sends the state it wants, so pressing it twice is not a race. */
  tap(permanent: PermanentDto): void {
    void this.manual.toggleTapped(permanent);
  }

  kindFor(permanent: PermanentDto): string {
    return this.kinds.get(permanent.permanentId) ?? ManualControlsComponent.DefaultKind;
  }

  onKindInput(permanent: PermanentDto, event: Event): void {
    this.kinds.set(permanent.permanentId, (event.target as HTMLInputElement).value);
    this.cdr.markForCheck();
  }

  bumpCounters(permanent: PermanentDto, delta: number): void {
    void this.manual.counters(permanent, this.kindFor(permanent), delta);
  }

  /**
   * What is already on it, for the line under the control: the engine's numbers, not ours.
   *
   * Memoized on the object's identity, because the template calls it on every change-detection
   * pass and the store hands back a new `PermanentDto` per change — so the identity is both the
   * cache key and the invalidation. A `WeakMap` so a permanent that leaves the board takes its
   * entry with it.
   */
  private readonly countersMemo = new WeakMap<PermanentDto, { kind: string; count: number }[]>();

  countersOn(permanent: PermanentDto): { kind: string; count: number }[] {
    const cached = this.countersMemo.get(permanent);
    if (cached) return cached;

    const result = Object.entries(permanent.counters ?? {})
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => ({ kind, count }));
    this.countersMemo.set(permanent, result);
    return result;
  }

  bumpLife(player: PlayerStateDto, delta: number): void {
    void this.manual.life(player, delta);
  }

  trackByPermanent(_: number, permanent: PermanentDto): string {
    return permanent.permanentId;
  }

  trackByPlayer(_: number, player: PlayerStateDto): string {
    return player.playerId;
  }

  trackByZone(_: number, zone: ManualZoneOption): string {
    return zone.id;
  }
}
