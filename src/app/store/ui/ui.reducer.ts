import { createReducer, on } from '@ngrx/store';
import { GameActions } from '../game/game.actions';
import { CardDto } from '../../models/game.models';
import { UIActions } from './ui.actions';

export type UIMode =
  | 'idle'
  | 'targeting'
  | 'declaring-attackers'
  | 'declaring-blockers'
  | 'choosing-ability'
  | 'announcing';

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

  // Choosing between a permanent's abilities (CR 602.1). The permanent whose list is open.
  abilityMenuPermanentId: string | null;

  // Announcing a number for a cost written with {X} (CR 601.2b).
  //
  // The source outlives `confirmAnnounce` on purpose. Reducers run before effects, so an effect
  // that has to read what was being announced cannot be given a state the confirmation has
  // already cleared — the same trap that made confirming an attack declare nothing. It is
  // cleared when the cast or the activation is actually sent.
  announceSourceId: string | null;
  /** Null while announcing for a spell rather than for an ability on the battlefield. */
  announceAbilityId: string | null;
  /** How many targets follow the announcement, so the effect knows whether to ask (CR 601.2c). */
  announceTargetCount: number;
  /** The number named, carried through the targeting step to the cast or activation. */
  variableValue: number;

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
  abilityMenuPermanentId: null,
  announceSourceId: null,
  announceAbilityId: null,
  announceTargetCount: 0,
  variableValue: 0,
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
  on(
    UIActions.enterTargetMode,
    (state, { sourceCardId, targetCount, abilityId, variableValue }) => ({
      ...state,
      mode: 'targeting' as UIMode,
      targetSourceCardId: sourceCardId,
      targetAbilityId: abilityId ?? null,
      targetCount,
      pendingTargetIds: [],
      abilityMenuPermanentId: null,
      // Announced before targets (CR 601.2b before 601.2c), so it is carried rather than reset.
      variableValue: variableValue ?? state.variableValue,
    }),
  ),

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
    // The spell was abandoned, so the number named for it goes with it. Left standing it would
    // be spent by the next thing that announced one.
    announceSourceId: null,
    announceAbilityId: null,
    variableValue: 0,
  })),

  // ---- Choosing between abilities -------------------------
  // Deliberately not `selectedPermanentId` as well.
  //
  // Selecting a permanent opens the card preview, and at 375px that panel is positioned from a
  // desktop constant — `innerWidth - 460`, which is -85 — so it sits half off the left edge and
  // straight over the status bar. It covered the first ability button in the very first capture
  // of this menu. The menu already names the permanent in the message above it and puts each
  // ability's own text on its button, so the preview adds nothing here and hid the one thing
  // that had to be read.
  on(UIActions.openAbilityMenu, (state, { permanentId }) => ({
    ...state,
    mode: 'choosing-ability' as UIMode,
    abilityMenuPermanentId: permanentId,
    selectedPermanentId: null,
    selectedCardId: null,
  })),

  on(UIActions.closeAbilityMenu, (state) => ({
    ...state,
    mode: 'idle' as UIMode,
    abilityMenuPermanentId: null,
  })),

  // ---- Announcing a number (CR 601.2b) --------------------
  on(UIActions.enterAnnounceMode, (state, { sourceId, abilityId, targetCount }) => ({
    ...state,
    mode: 'announcing' as UIMode,
    abilityMenuPermanentId: null,
    announceSourceId: sourceId,
    announceAbilityId: abilityId ?? null,
    announceTargetCount: targetCount,
    variableValue: 0,
  })),

  // The mode ends here; what was being announced does not — `announced$` reads it.
  on(UIActions.confirmAnnounce, (state, { value }) => ({
    ...state,
    mode: 'idle' as UIMode,
    variableValue: value,
  })),

  on(UIActions.cancelAnnounce, (state) => ({
    ...state,
    mode: 'idle' as UIMode,
    announceSourceId: null,
    announceAbilityId: null,
    announceTargetCount: 0,
    variableValue: 0,
  })),

  // Sent: the announcement is spent, and nothing after this may reuse it.
  on(GameActions.castSpell, GameActions.activateAbility, (state) => ({
    ...state,
    announceSourceId: null,
    announceAbilityId: null,
    announceTargetCount: 0,
    variableValue: 0,
    abilityMenuPermanentId: null,
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
