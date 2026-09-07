import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import * as signalR from '@microsoft/signalr';
import { GameActions } from '../store/game/game.actions';
import { AppState } from '../store';
import { GameViewAdapter } from '../game/game-view.adapter';
import { ToastService } from './toast.service';
import { AttackTarget, GameView, TargetDto } from '../models/play.models';

/**
 * The board's connection to the rules engine.
 *
 * Everything above this line is the game UI exactly as it was written: the board dispatches
 * `GameActions`, the effects call the methods below, and the reducer folds `stateSynced` into
 * the store. Everything below it is `MtgEngine.Rules`, which replaced the engine this UI was
 * built against and speaks a different language — one per-player `GameView` pushed on `State`,
 * commands that take the game id first, and refusals that quote the Comprehensive Rules.
 *
 * So this file is the translator, and it is the only place that knows both. The alternative was
 * rewriting the board against the new shape, which is what turned it into a different board the
 * last three times. `GameViewAdapter` does the state half; the methods here do the commands.
 *
 * One old command has no counterpart and says so rather than failing quietly: `untapLand`.
 * Untapping at will was the old engine's convenience, not a rule, and the control is still on
 * the board — so it explains itself instead of sending something that would be rejected.
 */
@Injectable({ providedIn: 'root' })
export class SignalRService implements OnDestroy {
  private readonly store = inject<Store<AppState>>(Store);
  private readonly adapter = inject(GameViewAdapter);
  private readonly zone = inject(NgZone);
  private readonly toasts = inject(ToastService);

  private hub: signalR.HubConnection | null = null;
  private gameId: string | null = null;

  /** The last view the engine sent, for the command translations that need to read it. */
  private latest: GameView | null = null;

  // ---- Connect to game hub --------------------------------
  async connect(gameId: string, _playerToken: string): Promise<void> {
    this.gameId = gameId;

    this.hub = new signalR.HubConnectionBuilder()
      // The account's own JWT, not a per-game token: the rebuilt engine authenticates the hub
      // the same way it authenticates the API, and works out which seat you are from it.
      .withUrl('/hubs/game', {
        accessTokenFactory: () => localStorage.getItem('auth_token') ?? '',
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.registerHandlers();

    this.hub.onclose(() => this.zone.run(() => this.store.dispatch(GameActions.connectionLost())));
    this.hub.onreconnecting(() =>
      this.zone.run(() => this.store.dispatch(GameActions.connectionLost())),
    );
    this.hub.onreconnected(() => {
      // Joining again is how the engine is asked for the current view; there is no separate
      // sync call, and the board may have missed pushes while the socket was down.
      void this.hub?.invoke('Join', gameId);
    });

    try {
      await this.hub.start();
      await this.hub.invoke('Join', gameId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.zone.run(() => this.store.dispatch(GameActions.connectionError({ error: msg })));
    }
  }

  // ---- Server -> Client messages --------------------------
  private registerHandlers(): void {
    if (!this.hub) return;

    // The engine pushes a whole view rather than a diff. That is a simplification for this
    // side: the old GameStateDiff path is never exercised, and the board folds a full state.
    this.hub.on('State', (view: GameView) => {
      this.latest = view;
      this.zone.run(() =>
        this.store.dispatch(GameActions.stateSynced({ gameState: this.adapter.toGameState(view) })),
      );
    });

    this.hub.on('Log', () => {
      /* The engine's narration. The original board has nowhere to put it. */
    });

    // A refused action, quoting the rule it broke.
    //
    // These went to the console, which is nowhere: a player pressed something illegal and got
    // silence. The board already carries a toast container — it is in the template, under the
    // grid — so the engine's own sentence goes there. It is a better message than anything this
    // side could compose, because it names the rule: "A land is played during your main phase
    // with an empty stack (CR 505.6b)."
    this.hub.on('Refused', (message: string) => {
      this.zone.run(() => this.toasts.show(message, 'warn', 5000));
    });
  }

  // ---- Client -> Server messages --------------------------

  passpriority(): Promise<void> {
    return this.invoke('PassPriority');
  }

  /**
   * Casts a spell (CR 601.2).
   *
   * The last argument is sent even when nothing was chosen. SignalR binds hub arguments by
   * position and does not fill in a server-side default for one the client left off, so a hub
   * method that grew a fifth parameter simply stopped accepting four — every cast came back
   * "Failed to invoke 'CastSpell' due to an error on the server", with no refusal and no line in
   * the game log, because the invocation never reached the method at all.
   *
   * `variableValue` was hardcoded to zero here, which is a different kind of silence: the call
   * succeeds and the spell is cast for an X of nothing. Harvest Pyre exiled no cards and dealt
   * no damage; the engine charged the announced number correctly the whole time.
   */
  castSpell(
    cardId: string,
    targetIds: string[],
    variableValue = 0,
    options: unknown = null,
  ): Promise<void> {
    return this.invoke('CastSpell', cardId, this.targetsFor(targetIds), variableValue, options);
  }

  playLand(cardId: string): Promise<void> {
    return this.invoke('PlayLand', cardId);
  }

  /** Tapping a land for mana is an activated ability on the permanent (CR 605.1a). */
  activateMana(permanentId: string): Promise<void> {
    return this.activateAbility(permanentId, 'mana');
  }

  /**
   * Any activated ability, by the id the engine gave it (CR 602.1).
   *
   * The board could previously only ever say "mana", so every other ability a card had — a
   * pinger's, an Icy Manipulator's — was unreachable from the screen.
   */
  activateAbility(
    permanentId: string,
    abilityId: string,
    targetIds: string[] = [],
    variableValue = 0,
  ): Promise<void> {
    return this.invoke(
      'ActivateAbility',
      permanentId,
      abilityId,
      this.targetsFor(targetIds),
      variableValue,
    );
  }

  /**
   * Untapping a land at will is not a thing a player may do.
   *
   * The old engine offered it and the board still has the control. The rules have no such
   * action, so this refuses in the same voice the engine would rather than sending something
   * that would be rejected.
   */
  untapLand(_permanentId: string): Promise<void> {
    this.toasts.show('A permanent cannot be untapped at will (CR 701.21).', 'warn', 4000);
    return Promise.resolve();
  }

  /**
   * Attackers, aimed at the defending player.
   *
   * The old shape is a list of ids; the engine wants what each one is attacking, because a
   * creature may attack a planeswalker instead (CR 508.1b). The board has no way to say that,
   * so every attacker is aimed at the opponent — which is what the old engine assumed too.
   */
  declareAttackers(attackerIds: string[]): Promise<void> {
    const defender = this.opponentOfViewer();
    const attackers: Record<string, AttackTarget> = {};
    for (const id of attackerIds) {
      attackers[id] = { defendingPlayer: defender, planeswalker: null };
    }
    return this.invoke('DeclareAttackers', attackers);
  }

  /** The old shape is blocker → attacker; the engine wants attacker → its blockers. */
  declareBlockers(blockerToAttacker: Record<string, string>): Promise<void> {
    const blocks: Record<string, string[]> = {};
    for (const [blockerId, attackerId] of Object.entries(blockerToAttacker)) {
      (blocks[attackerId] ??= []).push(blockerId);
    }
    return this.invoke('DeclareBlockers', blocks);
  }

  /**
   * Damage assignment order is a decision the engine asks for, not one it is told.
   *
   * When a creature is blocked by several, the engine puts the question on the wire as a choice
   * and waits for the answer (CR 510.1c), so there is nothing to send here.
   */
  setBlockerOrder(_attackerId: string, _orderedBlockerIds: string[]): Promise<void> {
    return Promise.resolve();
  }

  /** A player may concede at any time and leaves immediately (CR 104.3a). */
  concede(): Promise<void> {
    return this.invoke('Concede');
  }

  /** Answers whatever decision the engine is waiting on (CR 103.4, 510.1c, 603.3b). */
  choose(picks: string[]): Promise<void> {
    return this.invoke('Choose', picks);
  }

  // ---- The honour system ----------------------------------------------------------------
  //
  // Four commands the engine applies no rule to: it accepts them only on objects the deck gate
  // admitted as honour-system, refuses them on an enforced object, and writes each one to the
  // log with the actor who did it, so a replay still holds and the table can see who moved
  // what. The board is the players' hands here; the rules are theirs to keep.
  //
  // Every argument is sent, `null` and `false` included. A hub call binds by position and the
  // server does not apply a C# default for one the client left off — the four spellings below
  // are `ManualMove(objectId, zone, position, tapped)`, `ManualTap(objectId, tapped)`,
  // `ManualCounters(objectId, kind, delta)` and `ManualLife(targetPlayerId, delta)`, and
  // `signalr.service.spec.ts` counts each one.

  /**
   * Puts an object in a zone by hand (the engine's `ManualMove`, CR 400.1 by agreement).
   *
   * `position` is where in the zone it goes — 0 for the top of a library, -1 for the bottom or
   * for a zone where order does not matter (CR 401.1, 401.4). `tapped` says how it arrives on
   * the battlefield; it is meaningless elsewhere and still sent, because leaving it off is not
   * "the default", it is a failed invocation.
   *
   * The defaults here are the engine's own (`ManualMove(… , int Position = -1, bool Tapped =
   * false)`), not `null`, and nothing manufactures a null for these two slots. A JSON null
   * arriving at a non-nullable `int` is the same class of failure as an omitted argument — the
   * invocation never reaches the method — so "send everything" cannot be honoured by sending
   * nothing-shaped values into slots that cannot hold one. A null a caller passes deliberately is
   * still passed on rather than dropped, because whether the hub types them nullable is the hub's
   * to say and silently swallowing an argument is the bug this whole section is about.
   */
  manualMove(
    objectId: string,
    zone: string,
    position: number | null = -1,
    tapped: boolean | null = false,
  ): Promise<void> {
    return this.invoke('ManualMove', objectId, zone, position, tapped);
  }

  /** Turns an object sideways, or back (the engine's `ManualTap`, CR 701.21). */
  manualTap(objectId: string, tapped: boolean): Promise<void> {
    return this.invoke('ManualTap', objectId, tapped);
  }

  /**
   * Adds or removes counters of one kind by hand (the engine's `ManualCounters`, CR 122.1).
   *
   * The kind is the card's own word for them — `+1/+1`, `charge`, `loyalty`, or whatever a card
   * the engine has never read calls its own. `delta` is signed; removing is a negative one, and
   * how few a permanent may end with is the players' business, not this method's.
   */
  manualCounters(objectId: string, kind: string, delta: number): Promise<void> {
    return this.invoke('ManualCounters', objectId, kind, delta);
  }

  /** Moves one player's life total by hand (the engine's `ManualLife`, CR 119.3). */
  manualLife(targetPlayerId: string, delta: number): Promise<void> {
    return this.invoke('ManualLife', targetPlayerId, delta);
  }

  // ---- Helpers --------------------------------------------

  /**
   * An id the board picked, as the engine's target shape.
   *
   * The board sends bare ids because the old engine took them; the engine wants to know what
   * kind of thing each one is. The view says which ids are players, so this reads it rather
   * than guessing from the shape of the string.
   */
  private targetsFor(ids: string[]): TargetDto[] {
    const players = new Set((this.latest?.players ?? []).map((p) => p.playerId));
    // A spell is on the stack, not the battlefield, and the engine takes it as its own kind of
    // target (CR 115.1). Everything that was not a player used to be sent as a permanent, so a
    // Counterspell aimed at a spell came back "Illegal target: target spell." — the one target
    // a counterspell can ever have was the one the board could not express.
    const spells = new Set((this.latest?.stack ?? []).map((o) => o.id));

    return ids.map((id) => {
      if (players.has(id)) return { kind: 'player', objectId: null, playerId: id };
      if (spells.has(id)) return { kind: 'spell', objectId: id, playerId: null };
      return { kind: 'permanent', objectId: id, playerId: null };
    });
  }

  private opponentOfViewer(): string {
    const view = this.latest;
    const them = view?.players.find((p) => p.playerId !== view.viewer);
    return them?.playerId ?? '';
  }

  private async invoke(method: string, ...args: unknown[]): Promise<void> {
    if (!this.hub || this.hub.state !== signalR.HubConnectionState.Connected || !this.gameId) {
      console.warn(`SignalR: cannot invoke ${method} — not connected`);
      return;
    }
    try {
      // Every command on this hub takes the game id first.
      await this.hub.invoke(method, this.gameId, ...args);
    } catch (err) {
      console.error(`SignalR invoke ${method} failed:`, err);
    }
  }

  get connectionState(): signalR.HubConnectionState {
    return this.hub?.state ?? signalR.HubConnectionState.Disconnected;
  }

  async disconnect(): Promise<void> {
    await this.hub?.stop();
    this.hub = null;
    this.gameId = null;
    this.latest = null;
  }

  ngOnDestroy(): void {
    void this.hub?.stop();
  }
}
