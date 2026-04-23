import { createActionGroup, emptyProps, props } from '@ngrx/store';
import {
  GameStateDto,
  GameStateDiffDto,
  CardDto,
  PermanentDto,
} from '../../models/game.models';

export const GameActions = createActionGroup({
  source: 'Game',
  events: {
    // Connection
    'Join Game':        props<{ gameId: string; playerToken: string }>(),
    'Game Joined':      props<{ gameState: GameStateDto; localPlayerId: string }>(),
    'Connection Lost':  emptyProps(),
    'Connection Error': props<{ error: string }>(),

    // Full state sync (on join / reconnect)
    'State Synced':     props<{ gameState: GameStateDto }>(),

    // Incremental diff from SignalR
    'State Diff':       props<{ diff: GameStateDiffDto }>(),

    // Player actions — sent to SignalR hub
    'Play Land':        props<{ cardId: string }>(),
    'Cast Spell':       props<{ cardId: string; targetIds: string[] }>(),
    'Activate Mana':    props<{ permanentId: string }>(),
    'Pass Priority':    emptyProps(),
    'Declare Attackers':props<{ attackerIds: string[] }>(),
    'Declare Blockers': props<{ blockerToAttacker: Record<string, string> }>(),
    'Set Blocker Order':props<{ attackerId: string; orderedBlockerIds: string[] }>(),
    'Concede':          emptyProps(),

    // Card cache (from Scryfall)
    'Card Loaded':      props<{ card: CardDto }>(),
  },
});
