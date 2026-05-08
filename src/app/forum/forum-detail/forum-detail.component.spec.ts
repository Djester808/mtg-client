import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { provideMockStore } from '@ngrx/store/testing';
import { provideHttpClient } from '@angular/common/http';
import { ForumDetailComponent } from './forum-detail.component';
import { ForumPostDetail } from '../../models/forum.models';
import { CollectionCardDto } from '../../models/game.models';
import { CardType } from '../../models/game.models';
import { makeCard } from '../../testing/test-factories';

function makeCollectionCard(overrides: Partial<CollectionCardDto> = {}): CollectionCardDto {
  return {
    id: 'cc-1',
    oracleId: 'oracle-1',
    scryfallId: null,
    quantity: 1,
    quantityFoil: 0,
    notes: null,
    addedAt: '2024-01-01',
    cardDetails: makeCard(),
    board: 'main',
    ...overrides,
  };
}

function makePost(overrides: Partial<ForumPostDetail> = {}): ForumPostDetail {
  return {
    id: 'post-1',
    deckId: 'deck-1',
    authorId: 'user-1',
    authorUsername: 'player1',
    deckName: 'My Deck',
    deckCoverUri: null,
    deckFormat: 'commander',
    commanderOracleId: null,
    description: null,
    colorIdentity: ['R', 'G'],
    publishedAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    cards: [],
    comments: [],
    ...overrides,
  };
}

const INITIAL_STATE = {
  forum: {
    posts: [],
    activePost: null,
    loading: false,
    postLoading: false,
    publishLoading: false,
    error: null,
  },
  auth: { isLoggedIn: false, user: null, token: null, loading: false, error: null },
};

async function setup() {
  await TestBed.configureTestingModule({
    imports: [ForumDetailComponent, FormsModule, RouterModule.forRoot([])],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      provideMockStore({ initialState: INITIAL_STATE }),
      provideHttpClient(),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => 'post-1' } } },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ForumDetailComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { component };
}

// ── cardCount ─────────────────────────────────────────────────────────────────

describe('ForumDetailComponent — cardCount', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sums quantity and quantityFoil', async () => {
    const { component } = await setup();
    const card = makeCollectionCard({ quantity: 2, quantityFoil: 1 });
    expect(component.cardCount(card)).toBe(3);
  });

  it('returns quantity alone when foil is 0', async () => {
    const { component } = await setup();
    const card = makeCollectionCard({ quantity: 4, quantityFoil: 0 });
    expect(component.cardCount(card)).toBe(4);
  });
});

// ── totalCards ────────────────────────────────────────────────────────────────

describe('ForumDetailComponent — totalCards', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sums all main board cards by default', async () => {
    const { component } = await setup();
    const post = makePost({
      cards: [
        makeCollectionCard({ id: 'c1', quantity: 2, quantityFoil: 0, board: 'main' }),
        makeCollectionCard({ id: 'c2', quantity: 1, quantityFoil: 1, board: 'main' }),
      ],
    });
    expect(component.totalCards(post)).toBe(4);
  });

  it('counts only the specified board', async () => {
    const { component } = await setup();
    const post = makePost({
      cards: [
        makeCollectionCard({ id: 'c1', quantity: 3, board: 'main' }),
        makeCollectionCard({ id: 'c2', quantity: 2, board: 'side' }),
      ],
    });
    expect(component.totalCards(post, 'side')).toBe(2);
    expect(component.totalCards(post, 'main')).toBe(3);
  });

  it('treats undefined board as main', async () => {
    const { component } = await setup();
    const card = makeCollectionCard({ quantity: 1, quantityFoil: 0 });
    (card as any).board = undefined;
    const post = makePost({ cards: [card] });
    expect(component.totalCards(post)).toBe(1);
  });
});

// ── getGroups ─────────────────────────────────────────────────────────────────

describe('ForumDetailComponent — getGroups', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns empty array when no cards match active board', async () => {
    const { component } = await setup();
    const post = makePost({ cards: [] });
    expect(component.getGroups(post)).toHaveSize(0);
  });

  it('groups creatures into Creatures group', async () => {
    const { component } = await setup();
    const creature = makeCollectionCard({
      cardDetails: makeCard({ cardTypes: [CardType.Creature] }),
    });
    const post = makePost({ cards: [creature] });
    const groups = component.getGroups(post);
    expect(groups.some((g) => g.label === 'Creatures')).toBeTrue();
  });

  it('groups lands into Lands group', async () => {
    const { component } = await setup();
    const land = makeCollectionCard({
      cardDetails: makeCard({ cardTypes: [CardType.Land], manaCost: '', manaValue: 0 }),
    });
    const post = makePost({ cards: [land] });
    const groups = component.getGroups(post);
    expect(groups.some((g) => g.label === 'Lands')).toBeTrue();
  });

  it('puts cards with no matching type into Other group', async () => {
    const { component } = await setup();
    const other = makeCollectionCard({
      cardDetails: makeCard({ cardTypes: [] }),
    });
    const post = makePost({ cards: [other] });
    const groups = component.getGroups(post);
    expect(groups.some((g) => g.label === 'Other')).toBeTrue();
  });

  it('only includes cards matching activeTab board', async () => {
    const { component } = await setup();
    const mainCard = makeCollectionCard({
      id: 'main',
      board: 'main',
      cardDetails: makeCard({ cardTypes: [CardType.Creature] }),
    });
    const sideCard = makeCollectionCard({
      id: 'side',
      board: 'side',
      cardDetails: makeCard({ cardTypes: [CardType.Creature] }),
    });
    const post = makePost({ cards: [mainCard, sideCard] });
    component.activeTab = 'main';
    const groups = component.getGroups(post);
    const creatures = groups.find((g) => g.label === 'Creatures')!;
    expect(creatures.cards).toHaveSize(1);
    expect(creatures.cards[0].id).toBe('main');
  });

  it('group total reflects card quantities', async () => {
    const { component } = await setup();
    const card = makeCollectionCard({
      quantity: 3,
      quantityFoil: 1,
      cardDetails: makeCard({ cardTypes: [CardType.Instant] }),
    });
    const post = makePost({ cards: [card] });
    const groups = component.getGroups(post);
    const instants = groups.find((g) => g.label === 'Instants')!;
    expect(instants.total).toBe(4);
  });
});

// ── viewMode ──────────────────────────────────────────────────────────────────

describe('ForumDetailComponent — viewMode', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('defaults to list view', async () => {
    const { component } = await setup();
    expect(component.viewMode).toBe('list');
  });

  it('setViewMode switches to visual', async () => {
    const { component } = await setup();
    component.setViewMode('visual');
    expect(component.viewMode).toBe('visual');
  });

  it('setViewMode switches to text', async () => {
    const { component } = await setup();
    component.setViewMode('text');
    expect(component.viewMode).toBe('text');
  });

  it('setViewMode switches back to list', async () => {
    const { component } = await setup();
    component.setViewMode('visual');
    component.setViewMode('list');
    expect(component.viewMode).toBe('list');
  });
});

// ── card modal ────────────────────────────────────────────────────────────────

describe('ForumDetailComponent — card modal', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('openCard sets selectedCard', async () => {
    const { component } = await setup();
    const card = makeCollectionCard();
    component.openCard(card);
    expect(component.selectedCard).toBe(card);
  });

  it('closeCard clears selectedCard', async () => {
    const { component } = await setup();
    component.selectedCard = makeCollectionCard();
    component.closeCard();
    expect(component.selectedCard).toBeNull();
  });
});

// ── colorClass ────────────────────────────────────────────────────────────────

describe('ForumDetailComponent — colorClass', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('maps each color letter to its pip class', async () => {
    const { component } = await setup();
    expect(component.colorClass('W')).toBe('pip-w');
    expect(component.colorClass('U')).toBe('pip-u');
    expect(component.colorClass('B')).toBe('pip-b');
    expect(component.colorClass('R')).toBe('pip-r');
    expect(component.colorClass('G')).toBe('pip-g');
    expect(component.colorClass('C')).toBe('pip-c');
  });

  it('falls back to pip-c for unknown color', async () => {
    const { component } = await setup();
    expect(component.colorClass('X')).toBe('pip-c');
  });
});

// ── formatLabel ───────────────────────────────────────────────────────────────

describe('ForumDetailComponent — formatLabel', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('capitalises first letter', async () => {
    const { component } = await setup();
    expect(component.formatLabel('commander')).toBe('Commander');
  });

  it('returns empty string for null or undefined', async () => {
    const { component } = await setup();
    expect(component.formatLabel(null)).toBe('');
    expect(component.formatLabel(undefined)).toBe('');
  });
});
