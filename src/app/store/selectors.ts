import { createFeatureSelector, createSelector } from '@ngrx/store';
import { GameState } from './game/game.reducer';
import { UIState } from './ui/ui.reducer';
import { Phase, Step, CardType, PermanentDto } from '../models/game.models';

// ---- Feature selectors ------------------------------------
export const selectGameFeature = createFeatureSelector<GameState>('game');
export const selectUIFeature   = createFeatureSelector<UIState>('ui');

// ---- Game selectors ---------------------------------------
export const selectGameState       = createSelector(selectGameFeature, s => s.gameState);
export const selectLocalPlayerId   = createSelector(selectGameFeature, s => s.localPlayerId);
export const selectConnected       = createSelector(selectGameFeature, s => s.connected);
export const selectConnectionError = createSelector(selectGameFeature, s => s.connectionError);
export const selectCardCache       = createSelector(selectGameFeature, s => s.cardCache);

export const selectPlayers = createSelector(
  selectGameState, g => g?.players ?? []
);

export const selectBattlefield = createSelector(
  selectGameState, g => g?.battlefield ?? []
);

export const selectStack = createSelector(
  selectGameState, g => g?.stack ?? []
);

export const selectStackIsEmpty = createSelector(
  selectStack, stack => stack.length === 0
);

export const selectCurrentPhase = createSelector(
  selectGameState, g => g?.currentPhase ?? Phase.Beginning
);

export const selectCurrentStep = createSelector(
  selectGameState, g => g?.currentStep ?? Step.Untap
);

export const selectTurn = createSelector(
  selectGameState, g => g?.turn ?? 1
);

export const selectActivePlayerId = createSelector(
  selectGameState, g => g?.activePlayerId ?? ''
);

export const selectPriorityPlayerId = createSelector(
  selectGameState, g => g?.priorityPlayerId ?? ''
);

export const selectGameResult = createSelector(
  selectGameState, g => g?.result
);

export const selectCombatState = createSelector(
  selectGameState, g => g?.combat ?? null
);

// Derived: local player / opponent
export const selectLocalPlayer = createSelector(
  selectPlayers, selectLocalPlayerId,
  (players, localId) => players.find(p => p.playerId === localId) ?? null
);

export const selectOpponent = createSelector(
  selectPlayers, selectLocalPlayerId,
  (players, localId) => players.find(p => p.playerId !== localId) ?? null
);

export const selectHasPriority = createSelector(
  selectPriorityPlayerId, selectLocalPlayerId,
  (priorityId, localId) => priorityId === localId
);

export const selectIsActivePlayer = createSelector(
  selectActivePlayerId, selectLocalPlayerId,
  (activeId, localId) => activeId === localId
);

// Derived: split battlefield
export const selectLocalPermanents = createSelector(
  selectBattlefield, selectLocalPlayerId,
  (bf, localId) => bf.filter(p => p.controllerId === localId)
);

export const selectOpponentPermanents = createSelector(
  selectBattlefield, selectLocalPlayerId,
  (bf, localId) => bf.filter(p => p.controllerId !== localId)
);

export const selectLocalCreatures = createSelector(
  selectLocalPermanents,
  perms => perms.filter(p => p.sourceCard.cardTypes.includes(CardType.Creature))
);

export const selectLocalLands = createSelector(
  selectLocalPermanents,
  perms => perms.filter(p => p.sourceCard.cardTypes.includes(CardType.Land))
);

export const selectOpponentCreatures = createSelector(
  selectOpponentPermanents,
  perms => perms.filter(p => p.sourceCard.cardTypes.includes(CardType.Creature))
);

export const selectOpponentLands = createSelector(
  selectOpponentPermanents,
  perms => perms.filter(p => p.sourceCard.cardTypes.includes(CardType.Land))
);

// ---- UI selectors -----------------------------------------
export const selectUIMode           = createSelector(selectUIFeature, s => s.mode);
export const selectSelectedPermId   = createSelector(selectUIFeature, s => s.selectedPermanentId);
export const selectSelectedCardId   = createSelector(selectUIFeature, s => s.selectedCardId);
export const selectHoveredCard      = createSelector(selectUIFeature, s => s.hoveredCard);
export const selectPendingAttackers = createSelector(selectUIFeature, s => s.pendingAttackerIds);
export const selectPendingBlockers  = createSelector(selectUIFeature, s => s.pendingBlockerAssignments);
export const selectPendingTargets   = createSelector(selectUIFeature, s => s.pendingTargetIds);
export const selectZoneViewerOpen   = createSelector(selectUIFeature, s => s.zoneViewerOpen);
export const selectZoneViewer       = createSelector(selectUIFeature, s => ({
  open: s.zoneViewerOpen,
  playerId: s.zoneViewerPlayerId,
  zone: s.zoneViewerZone,
}));

export const selectIsDeclaringAttackers = createSelector(
  selectUIMode, mode => mode === 'declaring-attackers'
);

export const selectIsDeclaringBlockers = createSelector(
  selectUIMode, mode => mode === 'declaring-blockers'
);

export const selectIsTargeting = createSelector(
  selectUIMode, mode => mode === 'targeting'
);

export const selectPreviewCard = createSelector(
  selectLocalPlayer, selectSelectedCardId,
  selectBattlefield, selectSelectedPermId,
  (player, cardId, battlefield, permId) => {
    if (cardId) {
      return player?.hand.find(c => c.cardId === cardId) ?? null;
    }
    if (permId) {
      return battlefield.find(p => p.permanentId === permId)?.sourceCard ?? null;
    }
    return null;
  }
);
