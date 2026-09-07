// A board whose permanents actually have abilities.
//
// `game-view.json` is a board with nothing to activate on it: every permanent in it carries no
// `abilities` at all, so the whole activation path — the one the engine sends `AbilityView` for —
// has never been captured. These overrides bolt the two shapes that matter onto it:
//
//   - a permanent with **two** abilities, which is the case the board has no way to express by
//     clicking, and the case r25-43 was about (before that fix both read identically);
//   - a cost that asks the player for a number, `AnnouncesVariable` (CR 601.2b), on both surfaces
//     the engine sets it on: an ability on the battlefield, and a card in hand.
//
// Overrides rather than a second fixture file, so the rest of the board — the sidebars, the
// stack, the phase track — stays the one board every other capture is measured against.

const fs = require('fs');
const path = require('path');

const GAME_ID = '11111111-2222-3333-4444-555555555555';
const ALICE = 'aaaaaaaa-0000-0000-0000-000000000001';

const base = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'game-view.json'), 'utf8'));

/** The shape `PlayerViewProjector.ProjectAbilities` sends, with its defaults. */
const ability = (over) => ({
  requiresTap: true,
  targetCount: 0,
  isManaAbility: false,
  announcesVariable: false,
  ...over,
});

function abilityFixture() {
  const view = base();

  for (const obj of view.battlefield) {
    if (obj.name === 'Forest' && obj.controllerId === ALICE) {
      obj.abilities = [ability({ id: 'mana', text: '{T}: Add {G}.', isManaAbility: true })];
    }
  }

  // Two abilities, both real, both reachable in the engine, and on the *viewer's* side of the
  // board: the menu is only offered on your own permanents, because you cannot activate an
  // opponent's. The fixture's own Prodigal Pyromancer is Bob's, and giving that one the
  // abilities photographed a battlefield where the control could never appear.
  view.battlefield.push({
    id: 'p-pyromancer',
    name: 'Prodigal Pyromancer',
    oracleId: 'o-prodigal-pyromancer',
    controllerId: ALICE,
    manaCost: '{2}{R}',
    typeLine: 'Creature — Human Wizard',
    oracleText: '{T}: Prodigal Pyromancer deals 1 damage to any target.',
    printedPower: 1,
    printedToughness: 1,
    isTapped: false,
    hasSummoningSickness: false,
    damageMarked: 0,
    counters: null,
    isPlaneswalker: false,
    isCreature: true,
    isLand: false,
    colors: ['Red'],
    abilities: [
      ability({
        id: 'ping',
        text: '{T}: This creature deals 1 damage to any target.',
        targetCount: 1,
      }),
      ability({
        id: 'pump',
        text: '{1}: This creature gets +1/+0 until end of turn.',
        requiresTap: false,
      }),
    ],
  });

  // A storage land: one ability charges it, the other asks for a number (CR 601.2b). Sent as a
  // land so it lands in the board's lands row, where the tap-for-mana path lives.
  view.battlefield.push({
    id: 'p-pools',
    name: 'Calciform Pools',
    oracleId: 'o-calciform-pools',
    controllerId: ALICE,
    manaCost: null,
    typeLine: 'Land',
    oracleText:
      '{T}: Add {C}.\n{1}, {T}: Put a storage counter on Calciform Pools.\n' +
      '{X}, {T}, Remove X storage counters from Calciform Pools: Add X mana in any combination of {W} and/or {U}.',
    printedPower: null,
    printedToughness: null,
    isTapped: false,
    hasSummoningSickness: false,
    damageMarked: 0,
    counters: { charge: 3 },
    isPlaneswalker: false,
    isCreature: false,
    isLand: true,
    colors: [],
    abilities: [
      ability({ id: 'charge', text: '{1}, {T}: Put a storage counter on this land.' }),
      ability({
        id: 'release',
        text: '{X}, {T}, Remove X storage counters: Add X mana in any combination of {W} and/or {U}.',
        isManaAbility: true,
        announcesVariable: true,
      }),
    ],
  });

  // Which of the deck gate's admissions each object is on the board under (CARD_ENGINE_PLAN.md:
  // a card is enforced, badged honour-system, or refused). Everything the engine can play is
  // enforced; two cards are left on the honour system, which is what puts the manual controls on
  // the board and the second badge on a card. A board where every object is honour-system
  // photographs a panel as long as the battlefield, and one where none is photographs no panel at
  // all — neither is the state worth measuring.
  for (const obj of view.battlefield) {
    obj.enforced = true;
  }
  for (const obj of view.battlefield) {
    if (obj.name === 'Kalonian Hydra' || obj.name === 'Chandra, Torch of Defiance') {
      obj.enforced = false;
    }
  }

  const alice = view.players.find((p) => p.playerId === ALICE);
  // Harvest Pyre is {1}{R} and its only X is in an additional cost, which is the whole reason
  // ObjectView carries the flag: a board reading the printed mana for an {X} finds none.
  alice.hand.push({
    id: 'h-pyre',
    name: 'Harvest Pyre',
    oracleId: 'o-harvest-pyre',
    controllerId: ALICE,
    manaCost: '{1}{R}',
    typeLine: 'Instant',
    oracleText:
      'As an additional cost to cast this spell, exile X cards from your graveyard. ' +
      'Harvest Pyre deals X damage to target creature.',
    printedPower: null,
    printedToughness: null,
    isTapped: null,
    hasSummoningSickness: null,
    damageMarked: null,
    counters: null,
    isPlaneswalker: false,
    isCreature: false,
    isLand: false,
    colors: ['Red'],
    announcesVariable: true,
  });
  alice.handCount = alice.hand.length;

  return { battlefield: view.battlefield, players: view.players };
}

module.exports = { abilityFixture, GAME_ID, ALICE };
