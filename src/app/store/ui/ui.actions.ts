import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { CardDto } from '../../models/game.models';

export const UIActions = createActionGroup({
  source: 'UI',
  events: {
    // Card selection
    'Select Card': props<{ permanentId?: string; cardId?: string }>(),
    'Deselect Card': emptyProps(),

    // Targeting mode
    // `abilityId` says the targeting is for an activated ability on a permanent rather than a
    // spell being cast (CR 602.2b vs 601.2c). Without it the board finished every targeting by
    // casting, so pointing an Icy Manipulator would have tried to cast the Icy Manipulator.
    // `variableValue` is the number already named for a cost written with {X} (CR 601.2b). It is
    // announced before targets are chosen, so it has to survive the targeting step to reach the
    // cast or the activation at the end of it.
    'Enter Target Mode': props<{
      sourceCardId: string;
      targetCount: number;
      abilityId?: string;
      variableValue?: number;
    }>(),
    'Add Target': props<{ targetId: string }>(),
    'Confirm Targets': emptyProps(),
    'Cancel Target Mode': emptyProps(),

    // Choosing between a permanent's abilities.
    //
    // A permanent with one usable ability is activated by tapping it, and always has been. Two
    // is the case the board could not express: `readyAbility` returns null rather than guess,
    // and the click fell through to selecting the card — so a Prodigal Pyromancer's ping and its
    // pump were both on the wire, both unreachable, and nothing on screen said either existed.
    'Open Ability Menu': props<{ permanentId: string }>(),
    'Close Ability Menu': emptyProps(),

    // One ability picked, however it was reached — a tap on a permanent with only one, or a
    // press on the menu when it has several. What has to happen next is a question about the
    // ability rather than about the control that named it (a number first, then targets, then
    // the activation), so it is answered once in an effect instead of in each caller.
    'Choose Ability': props<{ permanentId: string; abilityId: string }>(),

    // Naming the number a cost is counted with (CR 601.2b).
    //
    // `abilityId` absent means the announcement belongs to a spell being cast rather than to an
    // ability on the battlefield. The engine flags both, and the two finish differently.
    'Enter Announce Mode': props<{
      sourceId: string;
      abilityId?: string;
      targetCount: number;
    }>(),
    'Confirm Announce': props<{ value: number }>(),
    'Cancel Announce': emptyProps(),

    // Attacker declaration mode
    'Enter Attack Mode': emptyProps(),
    'Toggle Attacker': props<{ permanentId: string }>(),
    'Confirm Attackers': emptyProps(),
    'Cancel Attack Mode': emptyProps(),

    // Blocker declaration mode
    'Enter Block Mode': emptyProps(),
    'Assign Blocker': props<{ blockerId: string; attackerId: string }>(),
    'Confirm Blockers': emptyProps(),
    'Cancel Block Mode': emptyProps(),

    // Hover / tooltip
    'Hover Card': props<{ card: CardDto | null }>(),

    // Graveyard / exile viewer
    'Open Zone Viewer': props<{ playerId: string; zone: 'graveyard' | 'exile' }>(),
    'Close Zone Viewer': emptyProps(),
  },
});
