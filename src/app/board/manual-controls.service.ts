import { Injectable, inject } from '@angular/core';
import { PermanentDto, PlayerStateDto } from '../models/game.models';
import { SignalRService } from '../services/signalr.service';
import { ToastService } from '../services/toast.service';

/**
 * One place a manual move can put an object.
 *
 * `zone` is the engine's own name for it (`MtgEngine.Cards.Zone`), `position` is where in that
 * zone the object lands — the top and the bottom of a library are the same zone and a different
 * answer (CR 401.1) — and `tapped` is how it arrives on the battlefield, which is meaningless
 * anywhere else and carried anyway so that the call is complete whichever option was picked.
 */
export interface ManualZoneOption {
  id: string;
  label: string;
  zone: string;
  position: number | null;
  tapped: boolean | null;
}

/**
 * The honour system's rules, such as they are.
 *
 * The engine applies none to these four commands: it checks that the object was admitted as
 * honour-system, writes the event with the actor, and pushes the new view back. So there is no
 * optimistic state to fold and nothing for a reducer to reconcile — which is why this calls
 * `SignalRService` rather than dispatching, and why it is a service rather than four methods on
 * the panel: what a control means, what it refuses to send, and what the engine is told are all
 * testable here without a template.
 */
@Injectable({ providedIn: 'root' })
export class ManualControlsService {
  private readonly hub = inject(SignalRService);
  private readonly toasts = inject(ToastService);

  /** How long a counter kind may be. A card's own word for them, not a sentence. */
  static readonly MaxCounterKind = 24;

  /**
   * Where a card may be put by hand, in the order a player reaches for them.
   *
   * A library is two options because its ends are the two answers anything ever asks for
   * (CR 401.1, 401.4); every other zone is unordered, and -1 says "wherever" rather than
   * pretending the client knows an index.
   */
  // Every option carries both trailing values rather than leaving them null: the engine's command
  // types them `int Position = -1, bool Tapped = false`, and a JSON null into a non-nullable
  // parameter fails the invocation exactly as an omitted argument does. -1 is "wherever" and
  // false is "untapped", which is what the flag means for a zone with no opinion about it.
  static readonly Zones: readonly ManualZoneOption[] = [
    { id: 'hand', label: 'Hand', zone: 'Hand', position: -1, tapped: false },
    // Untapped, because that is how a permanent enters unless something says otherwise
    // (CR 110.5c). The battlefield is the one option for which the flag means anything.
    { id: 'battlefield', label: 'Battlefield', zone: 'Battlefield', position: -1, tapped: false },
    { id: 'graveyard', label: 'Graveyard', zone: 'Graveyard', position: -1, tapped: false },
    { id: 'exile', label: 'Exile', zone: 'Exile', position: -1, tapped: false },
    { id: 'library-top', label: 'Library (top)', zone: 'Library', position: 0, tapped: false },
    {
      id: 'library-bottom',
      label: 'Library (bottom)',
      zone: 'Library',
      position: -1,
      tapped: false,
    },
    { id: 'command', label: 'Command', zone: 'Command', position: -1, tapped: false },
  ];

  get zones(): readonly ManualZoneOption[] {
    return ManualControlsService.Zones;
  }

  /**
   * The objects the players have to play themselves.
   *
   * `enforced` absent is read as honour-system by the adapter, so this needs no third state:
   * whatever the board was told, an object either has an engine behind it or it has the panel.
   */
  honourSystem(permanents: readonly PermanentDto[]): PermanentDto[] {
    return permanents.filter((p) => !p.enforced);
  }

  /**
   * Every permanent on the table, both sides, as the panel is handed them.
   *
   * Built once per view-model rather than in a template, so the array's identity changes only
   * when the game state does — the panel memoizes its filter on exactly that identity, and a
   * fresh array per change-detection pass would defeat it.
   *
   * Both battlefields, because a card the engine cannot play is as often the opponent's, and the
   * players moving it by hand are the same players either way.
   */
  bothBattlefields(local: PermanentDto[], opponent: PermanentDto[]): PermanentDto[] {
    return [...local, ...opponent];
  }

  /** The seats a life total can be moved for. An absent player is absent, not a null entry. */
  seatsAtTable(
    local: PlayerStateDto | null | undefined,
    opponent: PlayerStateDto | null | undefined,
  ): PlayerStateDto[] {
    return [local, opponent].filter((p): p is PlayerStateDto => !!p);
  }

  /** Where the move menu should be pointing: the zone the object is already in reads as its own. */
  zoneById(id: string): ManualZoneOption | null {
    return this.zones.find((z) => z.id === id) ?? null;
  }

  /**
   * Moves an object by hand, if it is one the table is playing by hand.
   *
   * The guard is not the engine's — the engine refuses a manual command on an enforced object
   * itself (and says so) — it is so that a control the board should never have drawn cannot
   * send anything if it is drawn by mistake.
   */
  move(permanent: PermanentDto, optionId: string): Promise<void> {
    const option = this.zoneById(optionId);
    if (!option) return Promise.resolve();
    if (!this.admits(permanent)) return Promise.resolve();

    return this.hub.manualMove(permanent.permanentId, option.zone, option.position, option.tapped);
  }

  /** Turns it sideways, or back (CR 701.21a). The board sends the state it wants, not a toggle. */
  setTapped(permanent: PermanentDto, tapped: boolean): Promise<void> {
    if (!this.admits(permanent)) return Promise.resolve();
    return this.hub.manualTap(permanent.permanentId, tapped);
  }

  /** The other side of the tap control: what pressing it now means. */
  toggleTapped(permanent: PermanentDto): Promise<void> {
    return this.setTapped(permanent, !permanent.isTapped);
  }

  /**
   * Adds or removes counters of one kind (CR 122.1).
   *
   * An empty kind is refused here rather than sent, because "put a counter on it" with no name
   * is not something the log could later be read back from: a counter's kind is the whole of
   * what it is. A delta of zero is dropped for the same reason — an event that changed nothing.
   */
  counters(permanent: PermanentDto, kind: string, delta: number): Promise<void> {
    const trimmed = (kind ?? '').trim().slice(0, ManualControlsService.MaxCounterKind);
    if (!this.admits(permanent)) return Promise.resolve();
    if (!trimmed) {
      this.toasts.show('Name the counters first — a counter is what it is called.', 'warn', 4000);
      return Promise.resolve();
    }
    if (!Number.isFinite(delta) || Math.trunc(delta) === 0) return Promise.resolve();

    return this.hub.manualCounters(permanent.permanentId, trimmed, Math.trunc(delta));
  }

  /**
   * Moves a life total (CR 119.3).
   *
   * Any player's, including an opponent's: at a table playing cards the engine does not know,
   * the drain that has to be paid for is as often theirs as yours, and a board that could only
   * change your own would be answered by asking them to do it.
   */
  life(player: PlayerStateDto, delta: number): Promise<void> {
    if (!player?.playerId) return Promise.resolve();
    if (!Number.isFinite(delta) || Math.trunc(delta) === 0) return Promise.resolve();
    return this.hub.manualLife(player.playerId, Math.trunc(delta));
  }

  private admits(permanent: PermanentDto | null): boolean {
    if (!permanent?.permanentId) return false;
    if (permanent.enforced) {
      this.toasts.show(
        `${permanent.sourceCard?.name ?? 'That card'} is enforced — the engine plays it, ` +
          'so a manual action on it is refused.',
        'warn',
        4000,
      );
      return false;
    }
    return true;
  }
}
