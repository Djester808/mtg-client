import { Injectable, NgZone, inject, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { firstValueFrom } from 'rxjs';
import { PlayApiService } from './play-api.service';
import { GameView, TargetDto } from '../models/play.models';

/** Whether the client is talking to the server, for the board to say so. */
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

/**
 * The live connection to a game.
 *
 * Everything the player does goes out as an intent and comes back as a new view. There is no
 * client-side rules check and no local prediction, on purpose: the server is authoritative, and
 * a client that guessed would be a client that can disagree with it. The board shows what the
 * last view said, which is always what the server believes.
 *
 * Refusals ("you do not have priority") come back on their own channel and are shown to the
 * player who tried, not treated as errors — the rules saying no is a normal answer.
 */
@Injectable({ providedIn: 'root' })
export class PlayHubService {
  private connection: signalR.HubConnection | null = null;
  private gameId: string | null = null;

  /** The last view the server sent. Null until the first one arrives. */
  readonly view = signal<GameView | null>(null);

  /** The game log, newest last, as the server describes it. */
  readonly log = signal<readonly string[]>([]);

  /** The last thing the rules refused, for the board to surface and then clear. */
  readonly refusal = signal<string | null>(null);

  readonly connection$ = signal<ConnectionState>('idle');

  private readonly api = inject(PlayApiService);

  constructor(private zone: NgZone) {}

  /** Opens the connection and joins a game. Safe to call again for the same game. */
  async join(gameId: string): Promise<void> {
    if (this.connection && this.gameId === gameId) {
      return;
    }

    await this.leave();
    this.gameId = gameId;
    this.connection$.set('connecting');

    // Seed from the REST view first. The hub pushes on every action, but nothing happens
    // between a page load and the next action, so without this a refresh shows an empty board
    // for as long as the other player takes to think.
    try {
      const [view, log] = await Promise.all([
        firstValueFrom(this.api.view(gameId)),
        firstValueFrom(this.api.log(gameId)),
      ]);
      // Inside the zone, for the same reason the socket handlers are: this continuation
      // resolves after an await on the fetch backend, which is outside Angular, and a signal
      // set there schedules no change detection. The board rendered "Joining the game…" over a
      // view it already had until a capture run showed it.
      this.zone.run(() => {
        this.view.set(view);
        this.log.set(log);
      });
    } catch (err) {
      // The socket is the real source of truth; a failed seed only means a slower first paint.
      // It is still worth saying so — a seed that fails silently looks exactly like a board
      // that is still connecting, which is the wrong thing to show for minutes at a time.
      console.warn('Could not seed the board from the API:', err);
    }

    const connection = this.buildConnection();

    // Handlers run outside Angular, so each one ends by setting a signal inside the zone.
    connection.on('State', (view: GameView) => this.zone.run(() => this.view.set(view)));
    connection.on('Log', (lines: string[]) => this.zone.run(() => this.log.set(lines)));
    connection.on('Refused', (message: string) => this.zone.run(() => this.refusal.set(message)));

    connection.onreconnecting(() => this.zone.run(() => this.connection$.set('reconnecting')));
    connection.onreconnected(() =>
      this.zone.run(() => {
        this.connection$.set('connected');
        // The board may have missed pushes while the socket was down, so ask for the current
        // view rather than trusting what is on screen.
        void connection.invoke('Join', gameId);
      }),
    );
    connection.onclose(() => this.zone.run(() => this.connection$.set('closed')));

    this.connection = connection;
    await connection.start();
    this.connection$.set('connected');
    await connection.invoke('Join', gameId);
  }

  async leave(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.gameId = null;

    if (!connection) {
      return;
    }

    try {
      await connection.stop();
    } finally {
      this.connection$.set('closed');
      this.view.set(null);
      this.log.set([]);
    }
  }

  /** Clears a refusal once the player has seen it. */
  acknowledge(): void {
    this.refusal.set(null);
  }

  passPriority(): Promise<void> {
    return this.send('PassPriority');
  }

  playLand(cardId: string): Promise<void> {
    return this.send('PlayLand', cardId);
  }

  castSpell(cardId: string, targets: TargetDto[] = [], variableValue = 0): Promise<void> {
    return this.send('CastSpell', cardId, targets, variableValue);
  }

  activateAbility(sourceId: string, abilityId: string, targets: TargetDto[] = []): Promise<void> {
    return this.send('ActivateAbility', sourceId, abilityId, targets);
  }

  declareAttackers(attackers: Record<string, string>): Promise<void> {
    return this.send('DeclareAttackers', attackers);
  }

  declareBlockers(blocks: Record<string, string[]>): Promise<void> {
    return this.send('DeclareBlockers', blocks);
  }

  discard(cardId: string): Promise<void> {
    return this.send('Discard', cardId);
  }

  /**
   * Builds the connection. Its own method so a spec can replace the socket.
   *
   * Standing up a real SignalR connection in a unit test would be a test of SignalR; what is
   * worth pinning is everything this service does around it.
   */
  protected buildConnection(): signalR.HubConnection {
    return new signalR.HubConnectionBuilder()
      .withUrl('/hubs/game', {
        // A browser cannot set an Authorization header on a WebSocket handshake, so the token
        // goes as a query parameter; the API accepts it that way only for this path.
        accessTokenFactory: () => localStorage.getItem('auth_token') ?? '',
      })
      .withAutomaticReconnect()
      .build();
  }

  private async send(method: string, ...args: unknown[]): Promise<void> {
    if (!this.connection || !this.gameId) {
      return;
    }

    await this.connection.invoke(method, this.gameId, ...args);
  }
}
