import { LibrarySearchRequest } from './library-action';
import { GameView, ObjectView, ChoiceView } from '../models/play.models';
export interface EngineId {
  value: number;
}
interface EngineAbility {
  index: number;
  text: string;
  requiresTap: boolean;
  isManaAbility: boolean;
  targetCount: number;
  announcesVariable: boolean;
}
interface EngineObject {
  stackKind?: ObjectView['stackKind'];
  targets?: EngineId[];
  targetPlayers?: EngineId[];
  id: EngineId;
  name: string;
  oracleId: string;
  artworkKey?: string;
  owner: EngineId;
  controller: EngineId;
  tapped: boolean;
  faceDown: boolean;
  power: number | null;
  toughness: number | null;
  loyalty: number | null;
  damage: number;
  counters: Record<string, number>;
  attachedTo: EngineId | null;
  attachedToPlayer: EngineId | null;
  keywords: string[];
  types: string[];
  subtypes: string[];
  enforced: boolean;
  manaCost?: string | null;
  oracleText?: string | null;
  colors?: string[];
  isToken?: boolean;
  summoningSick?: boolean;
  targetCount?: number;
  abilities?: EngineAbility[];
}
interface EnginePlayer {
  id: EngineId;
  name: string;
  life: number;
  handCount: number;
  libraryCount: number;
  counters: Record<string, number>;
  mana: Record<string, number>;
  graveyard: EngineObject[];
  command: EngineObject[];
  hasLost?: boolean;
  landsPlayedThisTurn?: number;
  revealedTopCard?: EngineObject | null;
  lookableTopCard?: EngineObject | null;
}
interface EngineChoice {
  id: EngineId;
  player: EngineId;
  kind: string;
  prompt: string;
  min: number;
  max: number;
  options: { id: string; label: string; object?: EngineId | null }[];
  context?: { extra?: Record<string, string> };
}
export interface EngineView {
  manualLibraryActionsAllowed?: boolean;
  manualLibraryLookActive?: boolean;
  lastLook?: EngineView['lastReveal'];
  lastReveal?: {
    by: EngineId;
    cards: {
      oracleId: string;
      name: string;
      manaCost: string | null;
      oracleText: string | null;
      artworkKey: string;
    }[];
  } | null;
  outcome?: { winners: EngineId[]; draw: boolean; reason: string } | null;
  viewer: EngineId;
  turnNumber: number;
  step: string;
  activePlayer: EngineId;
  priorityHolder: EngineId | null;
  players: EnginePlayer[];
  battlefield: EngineObject[];
  stack: EngineObject[];
  hand: EngineObject[];
  exile: EngineObject[];
  pending: EngineChoice | null;
  inspectedLibraryCards?: EngineObject[];
  choiceCards?: EngineObject[];
  combat?: {
    attackers: {
      attacker: EngineId;
      defendingPlayer: EngineId | null;
      defendingPermanent: EngineId | null;
    }[];
    blocks: { attacker: EngineId; blockers: EngineId[] }[];
    defendingPlayers?: EngineId[];
    blockersDeclaredBy?: EngineId[];
    attackersDeclared: boolean;
    blockersDeclared: boolean;
  } | null;
}
export interface EngineLegal {
  castable?: EngineId[];
  playableLands?: EngineId[];
  activatable: { source: EngineId; abilityIndex: number; text: string }[];
  mayPass: boolean;
}
export type EngineArtwork = Record<string, { imageUri: string | null; artUri: string | null }>;
export interface EngineSnapshot {
  artwork?: EngineArtwork | null;
  legal?: EngineLegal;
  gameId: string;
  view: EngineView;
}
const pid = (id: EngineId) => 'p' + id.value;
const oid = (id: EngineId) => 'o' + id.value;
const COLOR: Record<string, string> = {
  White: 'W',
  Blue: 'U',
  Black: 'B',
  Red: 'R',
  Green: 'G',
  Colorless: 'C',
};
/** Converts only a viewer-authorized snapshot. No hidden library or opponent hand is accepted. */
export function engineView(
  view: EngineView,
  gameId: string,
  legal?: EngineLegal,
  artwork?: EngineArtwork,
): GameView {
  const object = (o: EngineObject): ObjectView => ({
    id: oid(o.id),
    announcedObjectTargets: (o.targets ?? []).map(oid),
    announcedPlayerTargets: (o.targetPlayers ?? []).map(pid),
    name: o.faceDown ? 'Face-down card' : o.name,
    oracleId: o.oracleId,
    controllerId: pid(o.controller),
    ownerId: pid(o.owner),
    manaCost: o.manaCost ?? null,
    stackKind: o.stackKind,
    typeLine: o.types.join(' ') + (o.subtypes.length ? ' — ' + o.subtypes.join(' ') : ''),
    oracleText: o.oracleText ?? null,
    artUri: artwork?.[o.artworkKey ?? o.oracleId]?.artUri ?? null,
    imageUri: artwork?.[o.artworkKey ?? o.oracleId]?.imageUri ?? null,
    isPlaneswalker: o.types.includes('Planeswalker'),
    isCreature: o.types.includes('Creature'),
    isLand: o.types.includes('Land'),
    isBattle: o.types.includes('Battle'),
    protectorId: null,
    attachedTo: o.attachedTo ? oid(o.attachedTo) : null,
    attachedToPlayer: o.attachedToPlayer ? pid(o.attachedToPlayer) : null,
    announcesVariable: (o.manaCost ?? '').includes('X'),
    colors: (o.colors ?? []).map((c) => COLOR[c] ?? c),
    printedPower: o.power,
    effectivePower: o.power,
    effectiveToughness: o.toughness,
    printedToughness: o.toughness,
    isTapped: o.tapped,
    hasSummoningSickness: o.summoningSick ?? false,
    damageMarked: o.damage,
    counters: o.counters,
    mergedUnder: [],
    enforced: o.enforced,
    isToken: o.isToken ?? false,
    targetCount: o.targetCount ?? 0,
    keywords: o.keywords,
    abilities: (o.abilities ?? [])
      .filter(
        (a) =>
          !legal ||
          o.controller.value !== view.viewer.value ||
          a.targetCount > 0 ||
          legal.activatable.some(
            (offer) => offer.source.value === o.id.value && offer.abilityIndex === a.index,
          ),
      )
      .map((a) => ({
        id: String(a.index),
        text: a.text,
        requiresTap: a.requiresTap,
        isManaAbility: a.isManaAbility,
        targetCount: a.targetCount,
        announcesVariable: a.announcesVariable,
      })),
  });
  const pending = view.pending;
  const choice: ChoiceView | null = pending
    ? {
        id: 'c' + pending.id.value,
        playerId: pid(pending.player),
        kind: pending.kind,
        prompt: pending.prompt,
        minPicks: pending.min,
        maxPicks: pending.max,
        isOrdering:
          ['mulligan-bottom', 'scry', 'surveil'].includes(pending.kind) ||
          /order/i.test(pending.kind),
        isDivision: /division|divide/i.test(pending.kind),
        totalToDivide: Number(pending.context?.extra?.['total'] ?? 0),
        options:
          pending.player.value === view.viewer.value
            ? pending.options.map((option) => {
                const card = view.choiceCards?.find(
                  (card) => !card.faceDown && card.id.value === option.object?.value,
                );
                return {
                  id: option.id,
                  label: option.label,
                  ...(card ? { card: object(card) } : {}),
                };
              })
            : null,
      }
    : null;
  const combat = view.combat;
  const disclosure = (value: EngineView['lastReveal']) =>
    value
      ? {
          by: pid(value.by),
          cards: value.cards.map((card) => ({
            oracleId: card.oracleId,
            name: card.name,
            manaCost: card.manaCost,
            oracleText: card.oracleText,
            imageUri: artwork?.[card.artworkKey]?.imageUri ?? null,
            artUri: artwork?.[card.artworkKey]?.artUri ?? null,
          })),
        }
      : null;
  return {
    gameId,
    lastReveal: disclosure(view.lastReveal),
    lastLook: disclosure(view.lastLook),
    inspectedLibraryCards: (view.inspectedLibraryCards ?? []).map(object),
    manualLibraryActionsAllowed: view.manualLibraryActionsAllowed === true,
    manualLibraryLookActive: view.manualLibraryLookActive === true,
    castableCards: legal?.castable?.map(oid) ?? [],
    playableLands: legal?.playableLands?.map(oid) ?? [],
    outcome: view.outcome ? { ...view.outcome, winners: view.outcome.winners.map(pid) } : null,
    viewer: pid(view.viewer),
    turnNumber: view.turnNumber,
    activePlayerId: pid(view.activePlayer),
    currentStep: view.step,
    priorityPlayerId: view.priorityHolder ? pid(view.priorityHolder) : null,
    attackers: Object.fromEntries(
      (combat?.attackers ?? []).map((a) => [
        oid(a.attacker),
        {
          defendingPlayer: a.defendingPlayer ? pid(a.defendingPlayer) : '',
          planeswalker: a.defendingPermanent ? oid(a.defendingPermanent) : null,
        },
      ]),
    ),
    defendingPlayerIds: combat?.defendingPlayers?.map(pid),
    blockersDeclaredBy: combat?.blockersDeclaredBy?.map(pid),
    attackersDeclared: combat?.attackersDeclared ?? false,
    blockersDeclared: combat?.blockersDeclared ?? false,
    blockers: Object.fromEntries(
      (combat?.blocks ?? []).map((b) => [oid(b.attacker), b.blockers.map(oid)]),
    ),
    players: view.players.map((p) => ({
      playerId: pid(p.id),
      name: p.name,
      life: p.life,
      poisonCounters: p.counters['poison'] ?? 0,
      libraryCount: p.libraryCount,
      topOfLibrary: p.revealedTopCard
        ? object(p.revealedTopCard)
        : p.lookableTopCard
          ? object(p.lookableTopCard)
          : null,
      handCount: p.handCount,
      hand: p.id.value === view.viewer.value ? view.hand.map(object) : null,
      revealedHand: [],
      graveyard: p.graveyard.map(object),
      hasLost: p.hasLost ?? false,
      landsPlayedThisTurn: p.landsPlayedThisTurn ?? 0,
      commanderDamage: {},
      commanderName: p.command[0]?.name ?? null,
      manaPool: Object.fromEntries(
        Object.entries({
          white: 'W',
          blue: 'U',
          black: 'B',
          red: 'R',
          green: 'G',
          colorless: 'C',
        }).map(([name, symbol]) => [symbol, p.mana[name] ?? 0]),
      ),
      restrictedMana: [],
    })),
    battlefield: view.battlefield.map(object),
    stack: [...view.stack].reverse().map(object),
    exile: view.exile.map(object),
    command: view.players.flatMap((p) => p.command.map(object)),
    choice,
  };
}
export function snapshotView(snapshot: GameView | EngineSnapshot): GameView {
  return 'view' in snapshot
    ? engineView(snapshot.view, snapshot.gameId, snapshot.legal, snapshot.artwork ?? undefined)
    : snapshot;
}
function number(id: unknown): number {
  if (typeof id !== 'string' || !/^([poc])?\d+$/.test(id))
    throw Error('Invalid engine identifier.');
  return Number(id.replace(/^[poc]/, ''));
}
/** The server owns the actor. Only object/target identifiers travel in a command. */
export function engineCommand(
  method: string,
  args: unknown[],
  view: GameView,
): Record<string, unknown> {
  const candidateTargets =
    method === 'ActivateAbility' ? args[2] : method === 'CastSpell' ? args[1] : undefined;
  const targets = (Array.isArray(candidateTargets) ? candidateTargets : []) as {
    kind: string;
    objectId: string | null;
    playerId: string | null;
  }[];
  const chosen = {
    targets: targets.filter((t) => t.objectId !== null).map((t) => number(t.objectId)),
    targetPlayers: targets.filter((t) => t.playerId !== null).map((t) => number(t.playerId)),
  };
  switch (method) {
    case 'PassPriority':
      return { kind: 'pass' };
    case 'PlayLand':
      return { kind: 'playLand', card: number(args[0]) };
    case 'CastSpell':
      return {
        kind: 'cast',
        card: number(args[0]),
        faceIndex: 0,
        ...chosen,
        modes: null,
        x: args[2] ?? 0,
        costChoices: null,
      };
    case 'ActivateAbility':
      return {
        kind: 'activate',
        source: number(args[0]),
        abilityIndex: number(args[1]),
        ...chosen,
        modes: null,
        x: args[3] ?? 0,
        costChoices: null,
      };
    case 'DeclareAttackers':
      return {
        kind: 'attack',
        attacks: Object.entries(
          args[0] as Record<string, { defendingPlayer: string; planeswalker?: string | null }>,
        ).map(([id, target]) => ({
          attacker: number(id),
          defendingPlayer: target.defendingPlayer ? number(target.defendingPlayer) : null,
          defendingPermanent: target.planeswalker ? number(target.planeswalker) : null,
        })),
      };
    case 'DeclareBlockers':
      return {
        kind: 'block',
        blocks: Object.entries(args[0] as Record<string, string[]>).flatMap(([id, blockers]) =>
          blockers.map((b) => ({ attacker: number(id), blocker: number(b) })),
        ),
      };
    case 'Choose':
      if (!view.choice) throw Error('No choice is waiting.');
      return {
        kind: 'answer',
        choice: number(view.choice.id),
        answer: args[0],
      };
    case 'Concede':
      return { kind: 'concede' };
    case 'ManualTap':
      return { kind: 'manualTap', object: number(args[0]), tapped: args[1] };
    case 'ManualCounters':
      return {
        kind: 'manualCounters',
        object: number(args[0]),
        counterKind: args[1],
        delta: args[2],
      };
    case 'ManualLibraryDraw':
      return { kind: 'manualLibraryDraw', requestId: args[0] };
    case 'ManualLibraryShuffle':
      return { kind: 'manualLibraryShuffle', requestId: args[0] };
    case 'ManualLibraryLook':
      return { kind: 'manualLibraryLook', requestId: args[0] };
    case 'ManualLibraryStopLooking':
      return { kind: 'manualLibraryStopLooking', requestId: args[0] };
    case 'ManualLibrarySearch': {
      const search = args[1] as LibrarySearchRequest;
      return {
        kind: 'manualLibrarySearch',
        requestId: args[0],
        count: search.count,
        destination: search.destination,
        filter: search.filter,
        reveal: search.reveal,
        shuffleAfter: search.shuffleAfter,
        tapped: search.tapped,
        where: search.where,
      };
    }
    case 'ManualLibraryArrange':
      return {
        kind: 'manualLibraryArrange',
        requestId: args[0],
        order: (args[1] as string[]).map(number),
      };
    case 'ManualLibraryReposition':
      return {
        kind: 'manualLibraryReposition',
        requestId: args[0],
        card: number(args[1]),
        position: args[2],
      };
    case 'ManualLife':
      return { kind: 'manualLife', target: number(args[0]), delta: args[1] };
    case 'ManualMove': {
      const zone = String(args[1]);
      const visible = [
        ...(view.battlefield ?? []),
        ...(view.stack ?? []),
        ...(view.exile ?? []),
        ...(view.command ?? []),
        ...view.players.flatMap((p) => [...(p.hand ?? []), ...(p.graveyard ?? [])]),
      ];
      const owner = visible.find((o) => o.id === args[0])?.ownerId ?? view.viewer;
      return {
        kind: 'manualMove',
        object: number(args[0]),
        to: { zone, player: /hand|graveyard|library|command/i.test(zone) ? number(owner) : null },
        position: args[2] ?? -1,
        tapped: args[3] ?? false,
      };
    }
    default:
      throw Error('Unsupported game command: ' + method);
  }
}
