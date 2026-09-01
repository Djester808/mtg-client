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
    'Enter Target Mode': props<{
      sourceCardId: string;
      targetCount: number;
      abilityId?: string;
    }>(),
    'Add Target': props<{ targetId: string }>(),
    'Confirm Targets': emptyProps(),
    'Cancel Target Mode': emptyProps(),

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
