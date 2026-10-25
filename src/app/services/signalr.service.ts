import {
  LibraryAction,
  LibrarySearchRequest,
  LIBRARY_ACTION_COMMANDS,
} from '../game/library-action';
import {
  ChoiceSubmission,
  ChoiceSubmissionControl,
} from '../game/choices/choice-selection.service';
import { UIActions } from '../store/ui/ui.actions';
import {
  EngineView,
  EngineLegal,
  EngineArtwork,
  engineView,
  engineCommand,
} from '../game/engine-transport';
import { storedAuth } from './auth-storage';
import { Injectable, NgZone, OnDestroy, inject, signal } from '@angular/core';
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
  private choiceWarning: { gameId: string; choiceId: string; toastId: number } | null = null;

  get libraryRequestScope(): string | null {
    return this.gameId && this.latest?.gameId === this.gameId
      ? JSON.stringify([this.gameId, this.latest.viewer])
      : null;
  }

  // ---- Connect to game hub --------------------------------
  async connect(gameId: string, _playerToken: string): Promise<void> {
    const previous = this.hub;
    // Detach first: stop/start callbacks from the previous table must never touch this one.
    const hub = this.createHub();
    this.hub = hub;
    this.gameId = gameId;
    this.latest = null;
    this.clearChoiceState();
    const active = () => this.hub === hub;
    this.registerHandlers(hub, gameId);

    const lost = () => {
      if (!active()) return;
      this.latest = null;
      this.zone.run(() => this.store.dispatch(GameActions.connectionLost()));
    };
    const failed = (err: unknown) => {
      if (!active()) return;
      const error = err instanceof Error ? err.message : String(err);
      this.zone.run(() => this.store.dispatch(GameActions.connectionError({ error })));
    };
    hub.onclose(lost);
    hub.onreconnecting(lost);
    hub.onreconnected(() => {
      if (active()) void hub.invoke('Join', gameId).catch(failed);
    });

    try {
      await previous?.stop();
      if (!active()) return;
      await hub.start();
      if (!active()) return;
      await hub.invoke('Join', gameId);
    } catch (err) {
      failed(err);
    }
  }

  private createHub(): signalR.HubConnection {
    return new signalR.HubConnectionBuilder()
      .withUrl('/hubs/game', { accessTokenFactory: () => storedAuth('auth_token') ?? '' })
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();
  }

  private clearChoiceState(): void {
    if (this.choiceWarning) this.toasts.dismiss(this.choiceWarning.toastId);
    this.choiceWarning = null;
    this.pendingChoice.set(null);
    this.choiceRequests.clear();
  }

  // ---- Server -> Client messages --------------------------
  private registerHandlers(hub: signalR.HubConnection, gameId: string): void {
    hub.on('ViewUpdated', (raw: EngineView, legal: EngineLegal, artwork?: EngineArtwork | null) => {
      if (this.hub !== hub) return;
      const view = engineView(raw, gameId, legal, artwork ?? undefined);
      this.updateLatest(view);
      this.zone.run(() =>
        this.store.dispatch(GameActions.stateSynced({ gameState: this.adapter.toGameState(view) })),
      );
    });
    // The engine pushes a whole view rather than a diff. That is a simplification for this
    // side: the old GameStateDiff path is never exercised, and the board folds a full state.
    hub.on('State', (view: GameView) => {
      if (this.hub !== hub || view.gameId !== gameId) return;
      this.updateLatest(view);
      this.zone.run(() =>
        this.store.dispatch(GameActions.stateSynced({ gameState: this.adapter.toGameState(view) })),
      );
    });

    hub.on('Log', () => {
      /* The engine's narration. The original board has nowhere to put it. */
    });

    // A refused action, quoting the rule it broke.
    //
    // These went to the console, which is nowhere: a player pressed something illegal and got
    // silence. The board already carries a toast container — it is in the template, under the
    // grid — so the engine's own sentence goes there. It is a better message than anything this
    // side could compose, because it names the rule: "A land is played during your main phase
    // with an empty stack (CR 505.6b)."
    hub.on('Refused', (message: string) => {
      if (this.hub !== hub) return;
      this.zone.run(() => {
        this.toasts.show(message, 'warn', 5000);
        this.store.dispatch(UIActions.castFailed({ error: message }));
      });
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
   * Attackers, aimed at the defending player.
   *
   * The old shape is a list of ids; the engine wants what each one is attacking, because a
   * creature may attack a planeswalker instead (CR 508.1b). The board has no way to say that,
   * so every attacker is aimed at the opponent — which is what the old engine assumed too.
   */
  declareAttackers(attackerIds: string[], defenders: Record<string, string> = {}): Promise<void> {
    const defender = this.opponentOfViewer();
    const attackers: Record<string, AttackTarget> = {};
    for (const id of attackerIds) {
      attackers[id] = { defendingPlayer: defenders[id] || defender, planeswalker: null };
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

  /** A player may concede at any time and leaves immediately (CR 104.3a). */
  concede(): Promise<void> {
    return this.invoke('Concede');
  }

  /** Answers whatever decision the engine is waiting on (CR 103.4, 510.1c, 603.3b). */
  private readonly pendingChoice = signal<(ChoiceSubmission & { key: string }) | null>(null);
  choiceSubmission(choiceId: string): ChoiceSubmission | null {
    const pending = this.pendingChoice();
    return pending?.key === `${this.gameId}:${choiceId}` ? pending : null;
  }
  isChoicePending(choiceId: string): boolean {
    return this.choiceSubmission(choiceId) !== null;
  }

  private readonly choiceRequests = new Map<string, Promise<void>>();

  choose(picks: string[], control: ChoiceSubmissionControl | null = null): Promise<void> {
    const key = `${this.gameId}:${this.latest?.choice?.id}`;
    const pending = this.choiceRequests.get(key);
    if (pending) return pending;
    this.pendingChoice.set({ key, control, picks: Object.freeze([...picks]) });
    const request = this.invoke('Choose', picks).finally(() => {
      if (this.choiceRequests.get(key) !== request) return;
      this.choiceRequests.delete(key);
      this.zone.run(() => {
        if (this.pendingChoice()?.key === key) this.pendingChoice.set(null);
      });
    });
    this.choiceRequests.set(key, request);
    return request;
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
  manualLibrary(action: LibraryAction, requestId: string): Promise<void> {
    return this.invoke(LIBRARY_ACTION_COMMANDS[action], requestId);
  }

  manualLibrarySearch(requestId: string, options: LibrarySearchRequest): Promise<void> {
    return this.invoke('ManualLibrarySearch', requestId, options);
  }
  manualLibraryArrange(requestId: string, order: readonly string[]): Promise<void> {
    return this.invoke('ManualLibraryArrange', requestId, order);
  }

  manualLibraryReposition(requestId: string, cardId: string, position: number): Promise<void> {
    return this.invoke('ManualLibraryReposition', requestId, cardId, position);
  }

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
    const them = view?.players.find((p) => p.playerId !== view.viewer && !p.hasLost);
    return them?.playerId ?? '';
  }

  private updateLatest(view: GameView): void {
    this.latest = view;
    const warning = this.choiceWarning;
    if (warning && (warning.gameId !== this.gameId || warning.choiceId !== view.choice?.id)) {
      this.toasts.dismiss(warning.toastId);
      this.choiceWarning = null;
    }
  }
  private async invoke(method: string, ...args: unknown[]): Promise<void> {
    const libraryAction = method.startsWith('ManualLibrary');
    if (!this.hub || this.hub.state !== signalR.HubConnectionState.Connected || !this.gameId) {
      if (method === 'Concede') {
        this.toasts.show('Reconnect before conceding.', 'warn', 3000);
        throw Error('Not connected.');
      }
      if (method === 'CastSpell')
        this.store.dispatch(
          UIActions.castFailed({ error: 'Not connected. Reconnect before casting.' }),
        );
      console.warn(`SignalR: cannot invoke ${method} — not connected`);
      if (libraryAction) throw Error('Not connected.');
      return;
    }
    const sentHub = this.hub;
    const sentGameId = this.gameId;
    const sentChoiceId = this.latest?.choice?.id;
    try {
      // Every command on this hub takes the game id first.
      if (!this.latest) {
        if (libraryAction || method === 'Concede') throw Error('Waiting for the game state.');
        this.toasts.show('Waiting for the game state.', 'warn', 3000);
        return;
      }
      const snapshot = this.latest;
      const command = engineCommand(method, args, snapshot);
      await sentHub.invoke('Command', sentGameId, command);
      if (this.hub !== sentHub && method === 'Concede') throw Error('The table changed.');
    } catch (err) {
      if (this.hub !== sentHub) {
        if (method === 'Concede' || libraryAction) throw err;
        return;
      }
      if (method === 'CastSpell')
        this.store.dispatch(
          UIActions.castFailed({
            error: 'Could not send the spell. Check the connection and try again.',
          }),
        );
      console.error(`SignalR invoke ${method} failed:`, err);
      if (method === 'Choose') {
        if (
          sentChoiceId &&
          this.gameId === sentGameId &&
          this.latest?.choice?.id === sentChoiceId
        ) {
          if (this.choiceWarning) this.toasts.dismiss(this.choiceWarning.toastId);
          this.choiceWarning = {
            gameId: sentGameId,
            choiceId: sentChoiceId,
            toastId: this.toasts.show('Choice status unknown. Reload to sync.', 'warn', 5000),
          };
        }
      } else if (!libraryAction) {
        this.toasts.show(
          'The action could not be sent. Check the connection and try again.',
          'warn',
          5000,
        );
      }
      if (method === 'Concede' || libraryAction) throw err;
    }
  }

  get connectionState(): signalR.HubConnectionState {
    return this.hub?.state ?? signalR.HubConnectionState.Disconnected;
  }

  async disconnect(): Promise<void> {
    const hub = this.hub;
    this.hub = null;
    this.gameId = null;
    this.latest = null;
    this.clearChoiceState();
    await hub?.stop();
  }

  ngOnDestroy(): void {
    void this.disconnect();
  }
}
