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
  it('preserves authoritative stack kinds independently of card types', () => {
    const raw = fixture();
    raw.stack[0].stackKind = 'TriggeredAbility';
    raw.stack[1].stackKind = 'ActivatedAbility';
    expect(engineView(raw, 'table').stack.map((o) => o.stackKind)).toEqual([
      'ActivatedAbility',
      'TriggeredAbility',
    ]);
  });

  it('keeps active library inspections separate from history and expires them from authoritative state', () => {
    const raw = fixture();
    raw.inspectedLibraryCards = [{ ...raw.hand[0], artworkKey: 'sample/first' }];
    const view = engineView(raw, 'game', undefined, {
      'sample/first': { imageUri: 'first.jpg', artUri: null },
    });
    expect(view.inspectedLibraryCards?.[0].id).toBe('o8');
    expect(view.inspectedLibraryCards?.[0].imageUri).toBe('first.jpg');
    expect(view.lastLook).toBeNull();
    expect(engineView({ ...raw, inspectedLibraryCards: [] }, 'game').inspectedLibraryCards).toEqual(
      [],
    );
    expect(engineView(fixture(), 'game').inspectedLibraryCards).toEqual([]);
  });

  it('maps historical reveal details without manufacturing a live object id', () => {
    const raw = fixture();
    raw.lastReveal = {
      by: id(1),
      cards: [
        {
          oracleId: 'sample',
          name: 'Revealed',
          manaCost: '{G}',
          oracleText: 'Printed text.',
          artworkKey: 'sample/printing',
        },
      ],
    };
    const view = engineView(raw, 'game', undefined, {
      'sample/printing': { imageUri: 'revealed.jpg', artUri: null },
    });
    expect(view.lastReveal?.cards[0].oracleText).toBe('Printed text.');
    expect(view.lastReveal?.cards[0].imageUri).toBe('revealed.jpg');
    expect(view.lastReveal?.cards[0].id).toBeUndefined();
    raw.lastReveal = null;
    expect(engineView(raw, 'game').lastReveal).toBeNull();
  });
  it('keeps selected-printing artwork distinct for copies of the same Oracle card', () => {
    const raw = fixture();
    raw.hand = [
      { ...raw.hand[0], artworkKey: 'sample/first' },
      { ...raw.hand[0], id: id(9), artworkKey: 'sample/second' },
    ];
    const view = engineView(raw, 'game', undefined, {
      sample: { imageUri: 'default.jpg', artUri: null },
      'sample/first': { imageUri: 'first.jpg', artUri: null },
      'sample/second': { imageUri: 'second.jpg', artUri: null },
    });
    expect(view.players[0].hand?.map((card) => card.imageUri)).toEqual(['first.jpg', 'second.jpg']);
  });
  it('attaches only matching authorized choice cards and clears them with the choice', () => {
    const source = fixture();
    source.choiceCards = source.hand;
    source.pending = {
      id: id(1),
      player: id(0),
      kind: 'search',
      prompt: 'Search',
      min: 0,
      max: 1,
      options: [
        { id: 'found', label: 'Scout', object: id(8) },
        { id: 'missing', label: 'Unknown', object: id(99) },
      ],
    };
    const choice = engineView(source, 'game').choice!;
    expect(choice.options?.[0].card?.id).toBe('o8');
    expect(choice.options?.[1].card).toBeUndefined();
    expect(engineView({ ...source, viewer: id(1) }, 'game').choice?.options).toBeNull();
    expect(engineView({ ...source, pending: null }, 'game').choice).toBeNull();
  });
  it('marks mulligan bottom selections as ordered without treating ordinary searches as ordering', () => {
    const source = fixture();
    source.pending = {
      id: id(1),
      player: id(0),
      kind: 'mulligan-bottom',
      prompt: 'Put two cards on bottom',
      min: 2,
      max: 2,
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    };
    expect(engineView(source, 'game').choice?.isOrdering).toBeTrue();
    for (const kind of ['scry', 'surveil', 'library-top-order']) {
      source.pending.kind = kind;
      expect(engineView(source, 'game').choice?.isOrdering).toBeTrue();
    }
    source.pending.kind = 'search';
    expect(engineView(source, 'game').choice?.isOrdering).toBeFalse();
  });
  it('retains an authorized private top card and clears it on permission revocation', () => {
    const source = fixture();
    source.players[0].lookableTopCard = source.hand[0];
    expect(engineView(source, 'game').players[0].topOfLibrary?.id).toBe('o8');
    expect(engineView(source, 'game').players[1].topOfLibrary).toBeNull();
    source.players[0].lookableTopCard = null;
    expect(engineView(source, 'game').players[0].topOfLibrary).toBeNull();
  });
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
  it('transports explicit library search instructions without player or effect data', () => {
    const search = {
      count: 2,
      destination: 'Battlefield',
      filter: { types: 'Land' },
      reveal: true,
      shuffleAfter: true,
      tapped: true,
      where: 'Default',
    };
    expect(
      engineCommand(
        'ManualLibrarySearch',
        ['request-search', search],
        engineView(fixture(), 'game'),
      ),
    ).toEqual({ kind: 'manualLibrarySearch', requestId: 'request-search', ...search });
  });
  it('transports an exact library order without adding a player identity', () => {
    expect(
      engineCommand(
        'ManualLibraryArrange',
        ['order-request', ['o9', 'o3', 'o7']],
        engineView(fixture(), 'game'),
      ),
    ).toEqual({ kind: 'manualLibraryArrange', requestId: 'order-request', order: [9, 3, 7] });
  });
  it('transports library reposition identity and destination without a caller-supplied player', () => {
    expect(
      engineCommand(
        'ManualLibraryReposition',
        ['request-1', 'o7', -1],
        engineView(fixture(), 'game'),
      ),
    ).toEqual({
      kind: 'manualLibraryReposition',
      requestId: 'request-1',
      card: 7,
      position: -1,
    });
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
    expect(
      engineView(fixture(), 'game', { playableLands: [id(10)], activatable: [], mayPass: true })
        .playableLands,
    ).toEqual(['o10']);
    expect(engineView(fixture(), 'game').playableLands).toEqual([]);
  });
});

describe('manual library transport', () => {
  it('preserves request IDs and exposes only explicit permission', () => {
    expect(
      engineCommand('ManualLibraryDraw', ['request-1'], engineView(fixture(), 'table')),
    ).toEqual({
      kind: 'manualLibraryDraw',
      requestId: 'request-1',
    });
    expect(
      engineCommand('ManualLibraryShuffle', ['request-2'], engineView(fixture(), 'table')),
    ).toEqual({
      kind: 'manualLibraryShuffle',
      requestId: 'request-2',
    });
    expect(engineView(fixture(), 'table').manualLibraryActionsAllowed).toBeFalse();
    expect(
      engineView({ ...fixture(), manualLibraryActionsAllowed: true }, 'table')
        .manualLibraryActionsAllowed,
    ).toBeTrue();
  });
  it('maps private manual library inspection and its stop action', () => {
    const view = engineView({ ...fixture(), manualLibraryLookActive: true }, 'table');
    expect(view.manualLibraryLookActive).toBeTrue();
    expect(engineView(fixture(), 'table').manualLibraryLookActive).toBeFalse();
    expect(engineCommand('ManualLibraryLook', ['look-id'], view)).toEqual({
      kind: 'manualLibraryLook',
      requestId: 'look-id',
    });
    expect(engineCommand('ManualLibraryStopLooking', ['stop-id'], view)).toEqual({
      kind: 'manualLibraryStopLooking',
      requestId: 'stop-id',
    });
  });
});
