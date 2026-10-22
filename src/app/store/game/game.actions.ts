import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { GameStateDto, GameStateDiffDto, CardDto } from '../../models/game.models';

export const GameActions = createActionGroup({
  source: 'Game',
  events: {
    // Connection
    'Join Game': props<{ gameId: string; playerToken: string }>(),
    'Game Joined': props<{ gameState: GameStateDto; localPlayerId: string }>(),
    'Connection Lost': emptyProps(),
    'Connection Error': props<{ error: string }>(),

    // Full state sync (on join / reconnect)
    'State Synced': props<{ gameState: GameStateDto }>(),

    // Incremental diff from SignalR
    'State Diff': props<{ diff: GameStateDiffDto }>(),

    // Player actions — sent to SignalR hub
    'Play Land': props<{ cardId: string }>(),
    // `variableValue` is the number named for a cost written with {X} (CR 601.2b), and it is
    // optional because almost nothing asks for one — an absent value is zero, which is what X is
    // until it is chosen (CR 202.3b).
    'Cast Spell': props<{ cardId: string; targetIds: string[]; variableValue?: number }>(),
    'Activate Mana': props<{ permanentId: string }>(),
    // Any ability, by the id the engine gave it (CR 602.1). 'Activate Mana' is the special case
    // this generalises; it stays because tapping a land is dispatched from several places.
    'Activate Ability': props<{
      permanentId: string;
      abilityId: string;
      targetIds: string[];
      variableValue?: number;
    }>(),
    'Untap Land': props<{ permanentId: string }>(),
    'Pass Priority': emptyProps(),
    'Declare Attackers': props<{ attackerIds: string[]; defenders?: Record<string, string> }>(),
    'Declare Blockers': props<{ blockerToAttacker: Record<string, string> }>(),
    'Set Blocker Order': props<{ attackerId: string; orderedBlockerIds: string[] }>(),
    Concede: emptyProps(),

    // Answering whatever the game has stopped to ask (CR 103.4, 510.1c, 603.3b). The picks are
    // option ids, in order, and an option may repeat when the answer is an amount.
    Choose: props<{ picks: string[] }>(),

    // Card cache (from Scryfall)
    'Card Loaded': props<{ card: CardDto }>(),
  },
});
