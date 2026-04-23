import { Injectable, OnDestroy } from '@angular/core';
import { Store } from '@ngrx/store';
import * as signalR from '@microsoft/signalr';
import { Subject, takeUntil } from 'rxjs';
import { GameStateDto, GameStateDiffDto } from '../models/game.models';
import { GameActions } from '../store/game/game.actions';
import { AppState } from '../store';

@Injectable({ providedIn: 'root' })
export class SignalRService implements OnDestroy {
  private hub: signalR.HubConnection | null = null;
  private destroy$ = new Subject<void>();

  constructor(private store: Store<AppState>) {}

  // ---- Connect to game hub --------------------------------
  async connect(gameId: string, playerToken: string): Promise<void> {
    this.hub = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/game', {
        accessTokenFactory: () => playerToken,
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.registerHandlers();

    this.hub.onclose(() => {
      this.store.dispatch(GameActions.connectionLost());
    });

    this.hub.onreconnecting(() => {
      this.store.dispatch(GameActions.connectionLost());
    });

    this.hub.onreconnected(() => {
      // Re-request full state sync on reconnect
      this.hub?.invoke('RequestStateSync');
    });

    try {
      await this.hub.start();
      await this.hub.invoke('JoinGame', gameId, playerToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.store.dispatch(GameActions.connectionError({ error: msg }));
    }
  }

  // ---- Server -> Client messages --------------------------
  private registerHandlers(): void {
    if (!this.hub) return;

    // Full state on join / reconnect
    this.hub.on('GameStateSnapshot', (gameState: GameStateDto) => {
      this.store.dispatch(GameActions.stateSynced({ gameState }));
    });

    // Incremental diff
    this.hub.on('GameStateDiff', (diff: GameStateDiffDto) => {
      this.store.dispatch(GameActions.stateDiff({ diff }));
    });
  }

  // ---- Client -> Server messages --------------------------
  passpriority(): Promise<void> {
    return this.invoke('PassPriority');
  }

  castSpell(cardId: string, targetIds: string[]): Promise<void> {
    return this.invoke('CastSpell', cardId, targetIds);
  }

  playLand(cardId: string): Promise<void> {
    return this.invoke('PlayLand', cardId);
  }

  activateMana(permanentId: string): Promise<void> {
    return this.invoke('ActivateMana', permanentId);
  }

  declareAttackers(attackerIds: string[]): Promise<void> {
    return this.invoke('DeclareAttackers', attackerIds);
  }

  declareBlockers(blockerToAttacker: Record<string, string>): Promise<void> {
    return this.invoke('DeclareBlockers', blockerToAttacker);
  }

  setBlockerOrder(attackerId: string, orderedBlockerIds: string[]): Promise<void> {
    return this.invoke('SetBlockerOrder', attackerId, orderedBlockerIds);
  }

  concede(): Promise<void> {
    return this.invoke('Concede');
  }

  // ---- Helpers --------------------------------------------
  private async invoke(method: string, ...args: unknown[]): Promise<void> {
    if (!this.hub || this.hub.state !== signalR.HubConnectionState.Connected) {
      console.warn(`SignalR: cannot invoke ${method} — not connected`);
      return;
    }
    try {
      await this.hub.invoke(method, ...args);
    } catch (err) {
      console.error(`SignalR invoke ${method} failed:`, err);
    }
  }

  get connectionState(): signalR.HubConnectionState {
    return this.hub?.state ?? signalR.HubConnectionState.Disconnected;
  }

  async disconnect(): Promise<void> {
    await this.hub?.stop();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.hub?.stop();
  }
}
