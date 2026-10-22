import { engineCommand, engineView, EngineView, snapshotView } from './engine-transport';
import { GameView } from '../models/play.models';
const id = (value: number) => ({ value });
function fixture(): EngineView {
  const o = {
    id: id(7),
    name: 'Scout',
    oracleId: 'sample',
    owner: id(0),
    controller: id(0),
    tapped: false,
    faceDown: false,
    power: 2,
    toughness: 2,
    loyalty: null,
    damage: 0,
    counters: {},
    attachedTo: null,
    attachedToPlayer: null,
    keywords: [],
    types: ['Creature'],
    subtypes: [],
    enforced: true,
  };
  return {
    viewer: id(0),
    turnNumber: 1,
    step: 'Upkeep',
    activePlayer: id(0),
    priorityHolder: id(0),
    players: [0, 1, 2, 3].map((n) => ({
      id: id(n),
      name: 'Player ' + n,
      life: 40,
      handCount: 7,
      libraryCount: 90,
      counters: {},
      mana: { green: 1 },
      graveyard: [],
      command: [],
    })),
    battlefield: [o],
    hand: [{ ...o, id: id(8) }],
    stack: [
      { ...o, id: id(10) },
      { ...o, id: id(11) },
    ],
    exile: [],
    pending: null,
  };
}
describe('Authoritative engine transport', () => {
  it('projects four distinct seats and never populates opponent hands', () => {
    const v = engineView(fixture(), 'game');
    expect(v.players.length).toBe(4);
    expect(v.players[0].hand?.length).toBe(1);
    expect(v.players.slice(1).every((p) => p.hand === null)).toBeTrue();
    expect(v.players[1].handCount).toBe(7);
    expect(v.players[0].manaPool['G']).toBe(1);
  });
  it('keeps stack conversion reversible between existing board contracts', () => {
    const v = engineView(fixture(), 'game');
    expect(v.stack.map((o) => o.id)).toEqual(['o11', 'o10']);
  });
  it('normalizes an HTTP snapshot and preserves game identity', () => {
    const raw = fixture();
    expect(snapshotView({ gameId: 'abc', view: raw }).gameId).toBe('abc');
  });
  it('sends no actor in pass and play-land commands', () => {
    const v = engineView(fixture(), 'game');
    expect(engineCommand('PassPriority', [], v)).toEqual({ kind: 'pass' });
    expect(engineCommand('PlayLand', ['o8'], v)).toEqual({ kind: 'playLand', card: 8 });
  });
  it('sends object and player targets separately with the announced cost', () => {
    const v = engineView(fixture(), 'game');
    const c = engineCommand(
      'CastSpell',
      [
        'o8',
        [
          { kind: 'player', objectId: null, playerId: 'p2' },
          { kind: 'permanent', objectId: 'o7', playerId: null },
        ],
        3,
      ],
      v,
    );
    expect(c['targets']).toEqual([7]);
    expect(c['targetPlayers']).toEqual([2]);
    expect(c['x']).toBe(3);
    expect(c['kind']).toBe('cast');
  });
  it('translates activated abilities by the actual engine ability index', () => {
    const v = engineView(fixture(), 'game');
    const c = engineCommand('ActivateAbility', ['o7', '2', [], 0], v);
    expect(c['source']).toBe(7);
    expect(c['abilityIndex']).toBe(2);
  });
  it('does not treat non-target command arguments as target arrays', () => {
    const v = engineView(fixture(), 'game');
    expect(engineCommand('ManualTap', ['o7', true], v)).toEqual({
      kind: 'manualTap',
      object: 7,
      tapped: true,
    });
  });
  it('sends distinct defenders for multiplayer attackers', () => {
    const v = engineView(fixture(), 'game');
    const c = engineCommand(
      'DeclareAttackers',
      [{ o7: { defendingPlayer: 'p2' }, o9: { defendingPlayer: 'p3' } }],
      v,
    );
    expect(c['attacks']).toEqual([
      { attacker: 7, defendingPlayer: 2, defendingPermanent: null },
      { attacker: 9, defendingPlayer: 3, defendingPermanent: null },
    ]);
  });
  it('answers the current choice identity instead of an unrelated prompt', () => {
    const v = { ...engineView(fixture(), 'game'), choice: { id: 'c4' } } as GameView;
    expect(engineCommand('Choose', [['keep']], v)).toEqual({
      kind: 'answer',
      choice: 4,
      answer: ['keep'],
    });
  });
  it('uses server ability offers to avoid unreachable or duplicate land actions', () => {
    const raw = fixture();
    raw.battlefield[0].abilities = [
      {
        index: 0,
        text: 'Old ability',
        requiresTap: true,
        isManaAbility: true,
        targetCount: 0,
        announcesVariable: false,
      },
      {
        index: 1,
        text: 'Tap for mana',
        requiresTap: true,
        isManaAbility: true,
        targetCount: 0,
        announcesVariable: false,
      },
    ];
    const v = engineView(raw, 'game', {
      activatable: [{ source: { value: 7 }, abilityIndex: 1, text: 'Tap for mana' }],
      mayPass: true,
    });
    expect(v.battlefield[0].abilities?.map((a) => a.id)).toEqual(['1']);
  });

  it('moves a controlled opponent card to its owners personal zone', () => {
    const raw = fixture();
    raw.battlefield[0].owner = { value: 2 };
    const v = engineView(raw, 'game');
    expect(engineCommand('ManualMove', ['o7', 'Graveyard', -1, false], v)['to']).toEqual({
      zone: 'Graveyard',
      player: 2,
    });
    expect(engineCommand('ManualMove', ['o7', 'Command', -1, false], v)['to']).toEqual({
      zone: 'Command',
      player: 2,
    });
    expect(engineCommand('ManualMove', ['o7', 'Exile', -1, false], v)['to']).toEqual({
      zone: 'Exile',
      player: null,
    });
  });

  it('carries the authoritative winner even when no player has lost', () => {
    const raw = fixture();
    raw.outcome = { winners: [{ value: 2 }], draw: false, reason: 'Effect' };
    expect(engineView(raw, 'game').outcome).toEqual({
      winners: ['p2'],
      draw: false,
      reason: 'Effect',
    });
  });
});

describe('server casting offers', () => {
  it('normalizes allowed object ids and defaults to no offers when absent', () => {
    expect(
      engineView(fixture(), 'game', { castable: [id(9)], activatable: [], mayPass: true })
        .castableCards,
    ).toEqual(['o9']);
    expect(engineView(fixture(), 'game').castableCards).toEqual([]);
  });
});
