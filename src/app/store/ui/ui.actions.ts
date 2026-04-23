import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { CardDto, PermanentDto } from '../../models/game.models';

export const UIActions = createActionGroup({
  source: 'UI',
  events: {
    // Card selection
    'Select Card':        props<{ permanentId?: string; cardId?: string }>(),
    'Deselect Card':      emptyProps(),

    // Targeting mode
    'Enter Target Mode':  props<{ sourceCardId: string; targetCount: number }>(),
    'Add Target':         props<{ targetId: string }>(),
    'Confirm Targets':    emptyProps(),
    'Cancel Target Mode': emptyProps(),

    // Attacker declaration mode
    'Enter Attack Mode':  emptyProps(),
    'Toggle Attacker':    props<{ permanentId: string }>(),
    'Confirm Attackers':  emptyProps(),
    'Cancel Attack Mode': emptyProps(),

    // Blocker declaration mode
    'Enter Block Mode':   emptyProps(),
    'Assign Blocker':     props<{ blockerId: string; attackerId: string }>(),
    'Confirm Blockers':   emptyProps(),
    'Cancel Block Mode':  emptyProps(),

    // Hover / tooltip
    'Hover Card':         props<{ card: CardDto | null }>(),

    // Graveyard / exile viewer
    'Open Zone Viewer':   props<{ playerId: string; zone: 'graveyard' | 'exile' }>(),
    'Close Zone Viewer':  emptyProps(),
  },
});
