# Compleat — Browser Client

Compleat companion and game board UI. Connects to the .NET Web API + SignalR hub.

The Compleat brand uses the original logo, sigil, wordmark and purple intro from the archived Unity project. Internal workspace names stay `mtg-client` and `MtgEngine` to preserve existing tooling and data.

## Stack

- **Angular 17** (standalone components, OnPush everywhere)
- **NgRx 17** (Store, Effects, Devtools)
- **@microsoft/signalr** (WebSocket real-time connection)
- **SCSS** with CSS custom properties for the design system

## Setup

```bash
npm install
ng serve
```

Runs on `http://localhost:4200`. The dev proxy forwards:
- `/api/*` → `https://localhost:7001/api`
- `/hubs/*` → `https://localhost:7001/hubs` (WebSocket)

Start the .NET API before the Angular dev server.

## Project Structure

```
src/app/
├── models/
│   └── game.models.ts        # All TypeScript DTOs + enums (mirrors C# domain)
│
├── store/
│   ├── game/
│   │   ├── game.actions.ts   # All game + connection actions
│   │   ├── game.reducer.ts   # Handles state sync + incremental diffs
│   │   └── game.effects.ts   # Wires actions to SignalR / REST API
│   ├── ui/
│   │   ├── ui.actions.ts     # Selection, targeting, attack/block declaration
│   │   └── ui.reducer.ts     # UI state machine
│   ├── selectors.ts          # 30+ memoized selectors
│   └── index.ts              # AppState, appReducers, re-exports
│
├── services/
│   ├── signalr.service.ts    # Hub connection, auto-reconnect, all invoke methods
│   └── game-api.service.ts   # REST: create/join game, card search
│
├── components/
│   ├── card/                 # Card component (Scryfall art, tapped, counters, states)
│   ├── hand/                 # Fanned hand with castability highlighting
│   ├── stack/                # LIFO stack panel + Pass Priority button
│   ├── zones/                # Battlefield half (creatures + lands rows)
│   ├── player-sidebar/       # Life, mana pool, zone counts
│   ├── phase-track/          # Phase pip track with current step
│   └── priority-indicator/   # Animated gold indicator
│
└── board/
    └── game-board.component  # Root layout (5-row CSS grid), status bar, combat buttons
```

## State Flow

```
User click
  → dispatch UIAction / GameAction
  → GameEffects picks up GameAction
  → SignalRService.invoke(...)
  → .NET hub processes
  → SignalR pushes GameStateDiff
  → store.dispatch(GameActions.stateDiff)
  → game.reducer applies diff
  → selectors recompute
  → components re-render (OnPush)
```

## Key Design Decisions

- **OnPush everywhere** — all components use `ChangeDetectionStrategy.OnPush` and consume `Observable` slices via `async` pipe
- **Incremental diffs** — `GameStateDiffDto` only contains what changed; the reducer merges it into the current state
- **UI state machine** — the `UIState.mode` field drives what happens on card click (`idle` → select, `declaring-attackers` → toggle attacker, etc.)
- **Card cache** — Scryfall card data is cached in the store by `oracleId` after first load, never re-fetched

## Connecting a Game

In `GameBoardComponent.ngOnInit`, dispatch:

```typescript
this.store.dispatch(GameActions.joinGame({
  gameId: 'your-game-id',
  playerToken: 'your-player-token',
}));
```

In production these come from route params after the lobby flow.

## Next Steps (Phase 4 completion)

- [ ] Lobby / game creation screen
- [ ] Zone viewer modal (graveyard, exile)
- [ ] Drag-and-drop blocker assignment
- [ ] Attack arrow SVG overlay
- [ ] Toast notifications for game events
- [ ] Sound effects on cast / damage / death
