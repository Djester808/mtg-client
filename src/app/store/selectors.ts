import { createFeatureSelector, createSelector } from '@ngrx/store';
import { GameState } from './game/game.reducer';
import { UIState } from './ui/ui.reducer';
import { Phase, Step } from '../models/game.models';

// ---- Feature selectors ------------------------------------
export const selectGameFeature = createFeatureSelector<GameState>('game');
export const selectUIFeature = createFeatureSelector<UIState>('ui');

// ---- Game selectors ---------------------------------------
export const selectGameState = createSelector(selectGameFeature, (s) => s.gameState);
export const selectLocalPlayerId = createSelector(selectGameFeature, (s) => s.localPlayerId);

export const selectPlayers = createSelector(selectGameState, (g) => g?.players ?? []);

export const selectBattlefield = createSelector(selectGameState, (g) => g?.battlefield ?? []);

export const selectStack = createSelector(selectGameState, (g) => g?.stack ?? []);

export const selectStackIsEmpty = createSelector(selectStack, (stack) => stack.length === 0);

export const selectCurrentPhase = createSelector(
  selectGameState,
  (g) => g?.currentPhase ?? Phase.Beginning,
);

export const selectCurrentStep = createSelector(
  selectGameState,
  (g) => g?.currentStep ?? Step.Untap,
);

export const selectTurn = createSelector(selectGameState, (g) => g?.turn ?? 1);

export const selectActivePlayerId = createSelector(selectGameState, (g) => g?.activePlayerId ?? '');

export const selectPriorityPlayerId = createSelector(
  selectGameState,
  (g) => g?.priorityPlayerId ?? '',
);

export const selectGameResult = createSelector(selectGameState, (g) => g?.result);

export const selectCombatState = createSelector(selectGameState, (g) => g?.combat ?? null);

// Derived: local player / opponent
export const selectLocalPlayer = createSelector(
  selectPlayers,
  selectLocalPlayerId,
  (players, localId) => players.find((p) => p.playerId === localId) ?? null,
);

export const selectOpponent = createSelector(
  selectPlayers,
  selectLocalPlayerId,
  (players, localId) => players.find((p) => p.playerId !== localId) ?? null,
);

export const selectHasPriority = createSelector(
  selectPriorityPlayerId,
  selectLocalPlayerId,
  (priorityId, localId) => priorityId === localId,
);

export const selectIsActivePlayer = createSelector(
  selectActivePlayerId,
  selectLocalPlayerId,
  (activeId, localId) => activeId === localId,
);

// Derived: split battlefield
export const selectLocalPermanents = createSelector(
  selectBattlefield,
  selectLocalPlayerId,
  (bf, localId) => bf.filter((p) => p.controllerId === localId),
);

export const selectOpponentPermanents = createSelector(
  selectBattlefield,
  selectLocalPlayerId,
  (bf, localId) => bf.filter((p) => p.controllerId !== localId),
);

// ---- UI selectors -----------------------------------------
export const selectUIMode = createSelector(selectUIFeature, (s) => s.mode);
export const selectSelectedPermId = createSelector(selectUIFeature, (s) => s.selectedPermanentId);
export const selectSelectedCardId = createSelector(selectUIFeature, (s) => s.selectedCardId);
export const selectPendingAttackers = createSelector(selectUIFeature, (s) => s.pendingAttackerIds);
export const selectPendingBlockers = createSelector(
  selectUIFeature,
  (s) => s.pendingBlockerAssignments,
);
export const selectZoneViewerOpen = createSelector(selectUIFeature, (s) => s.zoneViewerOpen);
export const selectZoneViewer = createSelector(selectUIFeature, (s) => ({
  open: s.zoneViewerOpen,
  playerId: s.zoneViewerPlayerId,
  zone: s.zoneViewerZone,
}));

export const selectIsDeclaringAttackers = createSelector(
  selectUIMode,
  (mode) => mode === 'declaring-attackers',
);

export const selectIsDeclaringBlockers = createSelector(
  selectUIMode,
  (mode) => mode === 'declaring-blockers',
);

export const selectIsTargeting = createSelector(selectUIMode, (mode) => mode === 'targeting');

// ---- Targeting a spell (CR 601.2c) --------------------------------------------------------

/** Set while targeting is for an activated ability rather than a spell (CR 602.2b). */
export const selectTargetAbilityId = createSelector(selectUIFeature, (s) => s.targetAbilityId);

export const selectTargetSourceCardId = createSelector(
  selectUIFeature,
  (s) => s.targetSourceCardId,
);
export const selectPendingTargets = createSelector(selectUIFeature, (s) => s.pendingTargetIds);
export const selectTargetCount = createSelector(selectUIFeature, (s) => s.targetCount);

// ---- Choosing between a permanent's abilities (CR 602.1) ----------------------------------

/**
 * The abilities on offer, with the text the engine wrote for each.
 *
 * This is the only place `AbilityView.Text` reaches a screen. It was carried from the engine
 * through the projector, the adapter and the DTO and then read by nobody — which made
 * r25-43's fix, one that stopped 416 permanents offering two identical-looking buttons,
 * unobservable here: there were no buttons.
 */
export const selectAbilityMenu = createSelector(
  selectUIFeature,
  selectBattlefield,
  (ui, battlefield) => {
    if (!ui.abilityMenuPermanentId) return null;
    const permanent = battlefield.find((p) => p.permanentId === ui.abilityMenuPermanentId);
    return permanent ? { permanent, abilities: permanent.abilities } : null;
  },
);

// ---- Naming a number for a cost (CR 601.2b) ----------------------------------------------

/**
 * What is waiting on a number, and what it is called — so the prompt can name it.
 *
 * "How many?" over a board with nine permanents on it is not a question anyone can answer.
 */
export const selectAnnouncement = createSelector(
  selectUIFeature,
  selectBattlefield,
  selectLocalPlayer,
  (ui, battlefield, player) => {
    if (!ui.announceSourceId) return null;

    const permanent = battlefield.find((p) => p.permanentId === ui.announceSourceId);
    const card = player?.hand.find((c) => c.cardId === ui.announceSourceId);
    const ability = permanent?.abilities.find((a) => a.id === ui.announceAbilityId);

    return {
      sourceId: ui.announceSourceId,
      abilityId: ui.announceAbilityId,
      targetCount: ui.announceTargetCount,
      sourceName: permanent?.sourceCard.name ?? card?.name ?? '',
      abilityText: ability?.text ?? card?.oracleText ?? '',
    };
  },
);

export const selectVariableValue = createSelector(selectUIFeature, (s) => s.variableValue);

// ---- The decision the game is waiting on ------------------------------------------------

export const selectChoice = createSelector(selectGameState, (g) => g?.choice ?? null);

/** Whether the decision belongs to this player — only they are sent the options to pick from. */
export const selectIsMyChoice = createSelector(
  selectChoice,
  selectLocalPlayerId,
  (choice, me) => !!choice && !!me && choice.playerId === me,
);

export const selectPreviewCard = createSelector(
  selectLocalPlayer,
  selectSelectedCardId,
  selectBattlefield,
  selectSelectedPermId,
  (player, cardId, battlefield, permId) => {
    if (cardId) {
      return player?.hand.find((c) => c.cardId === cardId) ?? null;
    }
    if (permId) {
      return battlefield.find((p) => p.permanentId === permId)?.sourceCard ?? null;
    }
    return null;
  },
);
