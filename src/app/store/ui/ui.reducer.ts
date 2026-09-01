import { createReducer, on } from '@ngrx/store';
import { GameActions } from '../game/game.actions';
import { CardDto } from '../../models/game.models';
import { UIActions } from './ui.actions';

export type UIMode = 'idle' | 'targeting' | 'declaring-attackers' | 'declaring-blockers';

export interface UIState {
  mode: UIMode;

  // Selected card (hand or battlefield)
  selectedPermanentId: string | null;
  selectedCardId: string | null;

  // Targeting
  targetSourceCardId: string | null;
  /** Set when the targeting is for an activated ability rather than a spell (CR 602.2b). */
  targetAbilityId: string | null;
  targetCount: number;
  pendingTargetIds: string[];

  // Attack declaration
  pendingAttackerIds: string[];

  // Block declaration: blockerId -> attackerId
  pendingBlockerAssignments: Record<string, string>;

  // Hover / tooltip
  hoveredCard: CardDto | null;

  // Zone viewer
  zoneViewerOpen: boolean;
  zoneViewerPlayerId: string | null;
  zoneViewerZone: 'graveyard' | 'exile' | null;
}

const initialState: UIState = {
  mode: 'idle',
  selectedPermanentId: null,
  selectedCardId: null,
  targetSourceCardId: null,
  targetAbilityId: null,
  targetCount: 0,
  pendingTargetIds: [],
  pendingAttackerIds: [],
  pendingBlockerAssignments: {},
  hoveredCard: null,
  zoneViewerOpen: false,
  zoneViewerPlayerId: null,
  zoneViewerZone: null,
};

export const uiReducer = createReducer(
  initialState,

  on(UIActions.selectCard, (state, { permanentId, cardId }) => ({
    ...state,
    selectedPermanentId: permanentId ?? null,
    selectedCardId: cardId ?? null,
  })),

  on(UIActions.deselectCard, (state) => ({
    ...state,
    selectedPermanentId: null,
    selectedCardId: null,
  })),

  // ---- Targeting ------------------------------------------
  on(UIActions.enterTargetMode, (state, { sourceCardId, targetCount, abilityId }) => ({
    ...state,
    mode: 'targeting' as UIMode,
    targetSourceCardId: sourceCardId,
    targetAbilityId: abilityId ?? null,
    targetCount,
    pendingTargetIds: [],
  })),

  on(UIActions.addTarget, (state, { targetId }) => ({
    ...state,
    pendingTargetIds: [...state.pendingTargetIds, targetId],
  })),

  on(UIActions.confirmTargets, (state) => ({
    ...state,
    mode: 'idle' as UIMode,
    targetSourceCardId: null,
    targetAbilityId: null,
    targetCount: 0,
    pendingTargetIds: [],
  })),

  on(UIActions.cancelTargetMode, (state) => ({
    ...state,
    mode: 'idle' as UIMode,
    targetSourceCardId: null,
    targetAbilityId: null,
    pendingTargetIds: [],
  })),

  // ---- Attackers ------------------------------------------
  on(UIActions.enterAttackMode, (state) => ({
    ...state,
    mode: 'declaring-attackers' as UIMode,
    pendingAttackerIds: [],
  })),

  on(UIActions.toggleAttacker, (state, { permanentId }) => {
    const already = state.pendingAttackerIds.includes(permanentId);
    return {
      ...state,
      pendingAttackerIds: already
        ? state.pendingAttackerIds.filter((id) => id !== permanentId)
        : [...state.pendingAttackerIds, permanentId],
    };
  }),

  // The mode ends here; the picks do not.
  //
  // NgRx runs every reducer before any effect, and `confirmAttackers$` reads the pending list
  // out of the store to build the declaration. Clearing it on this action meant the effect
  // always read an empty list, so the board declared no attackers however many you had chosen
  // — you could pick creatures, watch them light up, press Confirm, and attack with nothing.
  // The picks are cleared when the declaration is actually sent, below.
  on(UIActions.confirmAttackers, (state) => ({
    ...state,
    mode: 'idle' as UIMode,
  })),

  on(GameActions.declareAttackers, (state) => ({
    ...state,
    pendingAttackerIds: [],
  })),

  on(UIActions.cancelAttackMode, (state) => ({
    ...state,
    mode: 'idle' as UIMode,
    pendingAttackerIds: [],
  })),

  // ---- Blockers -------------------------------------------
  on(UIActions.enterBlockMode, (state) => ({
    ...state,
    mode: 'declaring-blockers' as UIMode,
    pendingBlockerAssignments: {},
  })),

  on(UIActions.assignBlocker, (state, { blockerId, attackerId }) => ({
    ...state,
    pendingBlockerAssignments: {
      ...state.pendingBlockerAssignments,
      [blockerId]: attackerId,
    },
  })),

  // Same as the attackers above: `confirmBlockers$` reads these to build the declaration, so
  // they survive until it has been sent.
  on(UIActions.confirmBlockers, (state) => ({
    ...state,
    mode: 'idle' as UIMode,
  })),

  on(GameActions.declareBlockers, (state) => ({
    ...state,
    pendingBlockerAssignments: {},
  })),

  on(UIActions.cancelBlockMode, (state) => ({
    ...state,
    mode: 'idle' as UIMode,
    pendingBlockerAssignments: {},
  })),

  // ---- Hover ----------------------------------------------
  on(UIActions.hoverCard, (state, { card }) => ({
    ...state,
    hoveredCard: card,
  })),

  // ---- Zone viewer ----------------------------------------
  on(UIActions.openZoneViewer, (state, { playerId, zone }) => ({
    ...state,
    zoneViewerOpen: true,
    zoneViewerPlayerId: playerId,
    zoneViewerZone: zone,
  })),

  on(UIActions.closeZoneViewer, (state) => ({
    ...state,
    zoneViewerOpen: false,
    zoneViewerPlayerId: null,
    zoneViewerZone: null,
  })),
);
