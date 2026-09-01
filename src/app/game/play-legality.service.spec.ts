import { TestBed } from '@angular/core/testing';
import { PlayLegalityService, CastingWindow } from './play-legality.service';
import { CardType } from '../models/game.models';
import { makeCard, makePermanent } from '../testing/test-factories';

/**
 * The rules the board applies before it offers an action.
 *
 * These are second implementations of rules the engine also enforces, which is why each one
 * names the rule it is applying: when the two disagree the engine is right, and the only way to
 * notice a drift is for both to be written down.
 */
describe('PlayLegalityService', () => {
  let legality: PlayLegalityService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    legality = TestBed.inject(PlayLegalityService);
  });

  const creature = (over = {}, keywords: string[] = []) =>
    makePermanent({
      sourceCard: makeCard({ cardTypes: [CardType.Creature], keywords }),
      ...over,
    });

  const tapAbility = (over = {}) => ({
    id: 'mana',
    text: '{T}: Add {C}.',
    requiresTap: true,
    targetCount: 0,
    isManaAbility: true,
    ...over,
  });

  // ---- Summoning sickness (CR 302.6) ----------------------------

  it('a creature that arrived this turn is summoning sick', () => {
    expect(legality.summoningSick(creature({ hasSummoningSickness: true }))).toBe(true);
  });

  it('haste lifts it (CR 702.10b, 702.10c)', () => {
    expect(legality.summoningSick(creature({ hasSummoningSickness: true }, ['Haste']))).toBe(false);
  });

  it('a noncreature permanent is never summoning sick', () => {
    const rock = makePermanent({
      hasSummoningSickness: true,
      sourceCard: makeCard({ cardTypes: [CardType.Artifact] }),
    });

    expect(legality.summoningSick(rock)).toBe(false);
  });

  // ---- Attacking (CR 508.1a) ------------------------------------

  it('lets an untapped creature that has been around attack', () => {
    expect(legality.canAttack(creature())).toBe(true);
  });

  it('refuses a tapped creature (CR 508.1a)', () => {
    expect(legality.canAttack(creature({ isTapped: true }))).toBe(false);
  });

  it('refuses defender (CR 702.3b)', () => {
    expect(legality.canAttack(creature({}, ['Defender']))).toBe(false);
  });

  it('refuses a noncreature permanent', () => {
    expect(
      legality.canAttack(makePermanent({ sourceCard: makeCard({ cardTypes: [CardType.Land] }) })),
    ).toBe(false);
  });

  it('names the reason it refused', () => {
    expect(legality.whyNotAttacking(creature({ isTapped: true }))).toContain('508.1a');
    expect(legality.whyNotAttacking(creature({}, ['Defender']))).toContain('702.3b');
    expect(legality.whyNotAttacking(creature({ hasSummoningSickness: true }))).toContain('302.6');
  });

  // ---- Which ability to offer (CR 602.1, 602.5b) ----------------

  it('offers the one ability a permanent is ready to use', () => {
    expect(legality.readyAbility(makePermanent({ abilities: [tapAbility()] }))?.id).toBe('mana');
  });

  it('refuses a tap ability on something already tapped (CR 602.5b)', () => {
    expect(
      legality.readyAbility(makePermanent({ isTapped: true, abilities: [tapAbility()] })),
    ).toBeNull();
  });

  it('refuses a creature tap ability the turn it arrives (CR 302.6)', () => {
    const pinger = creature({ hasSummoningSickness: true, abilities: [tapAbility()] });
    expect(legality.readyAbility(pinger)).toBeNull();
  });

  it('allows it with haste (CR 702.10c)', () => {
    const hasty = creature({ hasSummoningSickness: true, abilities: [tapAbility()] }, ['Haste']);
    expect(legality.readyAbility(hasty)?.id).toBe('mana');
  });

  it('does not guess between two abilities', () => {
    const twoWays = makePermanent({
      abilities: [tapAbility({ id: 'a' }), tapAbility({ id: 'b' })],
    });

    expect(legality.readyAbility(twoWays)).toBeNull();
  });

  it('offers an ability with no tap cost even on a tapped permanent', () => {
    const p = makePermanent({ isTapped: true, abilities: [tapAbility({ requiresTap: false })] });
    expect(legality.readyAbility(p)?.id).toBe('mana');
  });

  // ---- Which spells ask for targets (CR 601.2c) -----------------

  it('an instant that says target asks for one', () => {
    const bolt = makeCard({ cardTypes: [CardType.Instant] });
    bolt.oracleText = 'Lightning Bolt deals 3 damage to any target.';
    expect(legality.targetsOnCast(bolt)).toBe(true);
  });

  it('a creature whose trigger targets does not', () => {
    const beetle = makeCard({ cardTypes: [CardType.Creature] });
    beetle.oracleText = 'When Bond Beetle enters, put a +1/+1 counter on target creature.';
    expect(legality.targetsOnCast(beetle)).toBe(false);
  });

  it('an instant with no target in its text does not', () => {
    const salve = makeCard({ cardTypes: [CardType.Instant] });
    salve.oracleText = 'You gain 3 life.';
    expect(legality.targetsOnCast(salve)).toBe(false);
  });

  // ---- Casting speed and cost (CR 117.1a, 304.1, 307.1) ---------

  const window = (over: Partial<CastingWindow> = {}): CastingWindow => ({
    isActivePlayer: true,
    hasPriority: true,
    inMainPhase: true,
    stackIsEmpty: true,
    hasPlayedLandThisTurn: false,
    uiIsIdle: true,
    ...over,
  });

  const pool = { amounts: { R: 2, U: 2, G: 2 }, total: 6 } as never;

  it('a sorcery-speed card needs your main phase and an empty stack (CR 307.1)', () => {
    const bear = makeCard({ cardTypes: [CardType.Creature], manaCost: 'RR' });

    expect(legality.isCastable(bear, window(), pool)).toBe(true);
    expect(legality.isCastable(bear, window({ stackIsEmpty: false }), pool)).toBe(false);
    expect(legality.isCastable(bear, window({ isActivePlayer: false }), pool)).toBe(false);
  });

  it('an instant needs only priority (CR 304.1)', () => {
    const bolt = makeCard({ cardTypes: [CardType.Instant], manaCost: 'R' });

    expect(legality.isCastable(bolt, window({ isActivePlayer: false }), pool)).toBe(true);
    expect(legality.isCastable(bolt, window({ stackIsEmpty: false }), pool)).toBe(true);
    expect(legality.isCastable(bolt, window({ hasPriority: false }), pool)).toBe(false);
  });

  it('flash grants instant speed to anything else (CR 702.8a)', () => {
    const flashy = makeCard({
      cardTypes: [CardType.Creature],
      manaCost: 'RR',
      keywords: ['Flash'],
    });
    expect(legality.isCastable(flashy, window({ isActivePlayer: false }), pool)).toBe(true);
  });

  it('a land is one per turn at sorcery speed (CR 305.1)', () => {
    const forest = makeCard({ cardTypes: [CardType.Land], manaCost: '' });

    expect(legality.isCastable(forest, window(), pool)).toBe(true);
    expect(legality.isCastable(forest, window({ hasPlayedLandThisTurn: true }), pool)).toBe(false);
    expect(legality.isCastable(forest, window({ stackIsEmpty: false }), pool)).toBe(false);
  });

  it('refuses what the pool cannot pay for', () => {
    const pricey = makeCard({ cardTypes: [CardType.Creature], manaCost: '8' });
    expect(legality.isCastable(pricey, window(), pool)).toBe(false);
  });

  // ---- Paying a cost (CR 202.1) ---------------------------------

  it('spends coloured pips before generic', () => {
    // {1}{R} against one red and one blue: the red pays the pip, the blue the generic.
    const small = { amounts: { R: 1, U: 1 }, total: 2 } as never;
    expect(legality.canAfford('1R', small)).toBe(true);
  });

  it('refuses a cost whose colour is missing', () => {
    expect(legality.canAfford('W', pool)).toBe(false);
  });

  it('a free cost is always payable', () => {
    expect(legality.canAfford('0', pool)).toBe(true);
    expect(legality.canAfford('', pool)).toBe(true);
  });

  it('nothing is payable with no pool at all', () => {
    expect(legality.canAfford('R', undefined)).toBe(false);
  });

  // The form the server actually sends. Every spec above this one used a cost with the braces
  // already stripped — a shape nothing in the app produces — so a parser that could not read a
  // real cost passed all of them. On the board it meant the opening brace was read as a coloured
  // pip, no non-land card was ever castable, and a game played in two browsers ran seven turns
  // on six lands and no spells.
  it('reads a cost in the form the server sends it', () => {
    const three = { amounts: { R: 3 }, total: 3 } as never;
    expect(legality.canAfford('{2}{R}', three)).toBe(true);
    expect(legality.canAfford('{R}', three)).toBe(true);
    expect(legality.canAfford('{4}{R}', three)).toBe(false);
    expect(legality.canAfford('{W}', three)).toBe(false);
    expect(legality.canAfford('{0}', three)).toBe(true);
  });

  it('a braced cost and a bare one agree', () => {
    const small = { amounts: { R: 1, U: 1 }, total: 2 } as never;
    expect(legality.canAfford('{1}{R}', small)).toBe(legality.canAfford('1R', small));
  });

  it('X is nothing until it is chosen', () => {
    // CR 202.3b: X is zero anywhere but the stack, so {X}{R} costs one red to look at.
    const one = { amounts: { R: 1 }, total: 1 } as never;
    expect(legality.canAfford('{X}{R}', one)).toBe(true);
  });
});
