import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { provideMockStore } from '@ngrx/store/testing';
import { ForumListComponent } from './forum-list.component';
import { ForumPostSummary } from '../../models/forum.models';

function makePost(overrides: Partial<ForumPostSummary> = {}): ForumPostSummary {
  return {
    id: 'post-1', deckId: 'deck-1', authorUsername: 'player1',
    deckName: 'My Deck', deckCoverUri: null, deckFormat: 'commander',
    description: null, colorIdentity: ['R', 'G'],
    cardCount: 100, commentCount: 5, publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

const INITIAL_STATE = {
  forum: { posts: [], activePost: null, loading: false, postLoading: false, publishLoading: false, error: null },
  auth:  { isLoggedIn: false, user: null, token: null, loading: false, error: null },
};

async function setup() {
  await TestBed.configureTestingModule({
    imports: [ForumListComponent, FormsModule, RouterModule.forRoot([])],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [provideMockStore({ initialState: INITIAL_STATE })],
  }).compileComponents();

  const fixture = TestBed.createComponent(ForumListComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { component };
}

// ── manaClass ────────────────────────────────────────────────────────────────

describe('ForumListComponent — manaClass', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns correct class for each color', async () => {
    const { component } = await setup();
    expect(component.manaClass('W')).toBe('ms-w');
    expect(component.manaClass('U')).toBe('ms-u');
    expect(component.manaClass('B')).toBe('ms-b');
    expect(component.manaClass('R')).toBe('ms-r');
    expect(component.manaClass('G')).toBe('ms-g');
    expect(component.manaClass('C')).toBe('ms-c');
  });

  it('falls back to ms-c for unknown color', async () => {
    const { component } = await setup();
    expect(component.manaClass('X')).toBe('ms-c');
  });
});

// ── formatLabel ───────────────────────────────────────────────────────────────

describe('ForumListComponent — formatLabel', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('capitalises first letter', async () => {
    const { component } = await setup();
    expect(component.formatLabel('commander')).toBe('Commander');
    expect(component.formatLabel('standard')).toBe('Standard');
  });

  it('returns empty string for null', async () => {
    const { component } = await setup();
    expect(component.formatLabel(null)).toBe('');
  });
});

// ── timeAgo ───────────────────────────────────────────────────────────────────

describe('ForumListComponent — timeAgo', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns "just now" for dates within the last minute', async () => {
    const { component } = await setup();
    expect(component.timeAgo(new Date().toISOString())).toBe('just now');
  });

  it('returns minutes for dates within the last hour', async () => {
    const { component } = await setup();
    const d = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(component.timeAgo(d)).toBe('5m ago');
  });

  it('returns hours for dates within the last day', async () => {
    const { component } = await setup();
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(component.timeAgo(d)).toBe('3h ago');
  });

  it('returns days for dates within the last month', async () => {
    const { component } = await setup();
    const d = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(component.timeAgo(d)).toBe('10d ago');
  });
});

// ── filteredPosts — search ────────────────────────────────────────────────────

describe('ForumListComponent — filteredPosts search', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns all posts when search is empty', async () => {
    const { component } = await setup();
    const posts = [makePost({ deckName: 'Burn' }), makePost({ id: 'p2', deckName: 'Control' })];
    component.searchQuery = '';
    expect(component.filteredPosts(posts)).toHaveSize(2);
  });

  it('filters by deck name (case-insensitive)', async () => {
    const { component } = await setup();
    const posts = [makePost({ deckName: 'Burn Aggro' }), makePost({ id: 'p2', deckName: 'Control' })];
    component.searchQuery = 'burn';
    expect(component.filteredPosts(posts)).toHaveSize(1);
    expect(component.filteredPosts(posts)[0].deckName).toBe('Burn Aggro');
  });

  it('filters by author username (case-insensitive)', async () => {
    const { component } = await setup();
    const posts = [
      makePost({ authorUsername: 'Alice' }),
      makePost({ id: 'p2', authorUsername: 'Bob' }),
    ];
    component.searchQuery = 'alice';
    expect(component.filteredPosts(posts)).toHaveSize(1);
    expect(component.filteredPosts(posts)[0].authorUsername).toBe('Alice');
  });

  it('returns empty array when no posts match search', async () => {
    const { component } = await setup();
    const posts = [makePost({ deckName: 'Burn' })];
    component.searchQuery = 'xyz';
    expect(component.filteredPosts(posts)).toHaveSize(0);
  });
});

// ── filteredPosts — color filter ──────────────────────────────────────────────

describe('ForumListComponent — filteredPosts color filter', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('returns all posts when no colors selected', async () => {
    const { component } = await setup();
    const posts = [makePost({ colorIdentity: ['R'] }), makePost({ id: 'p2', colorIdentity: ['U', 'B'] })];
    expect(component.filteredPosts(posts)).toHaveSize(2);
  });

  it('keeps posts that include any selected color', async () => {
    const { component } = await setup();
    const posts = [
      makePost({ id: 'p1', colorIdentity: ['R', 'G'] }),
      makePost({ id: 'p2', colorIdentity: ['U', 'B'] }),
    ];
    component.toggleColor('R');
    expect(component.filteredPosts(posts)).toHaveSize(1);
    expect(component.filteredPosts(posts)[0].id).toBe('p1');
  });

  it('matches posts with any of multiple selected colors (OR logic)', async () => {
    const { component } = await setup();
    const posts = [
      makePost({ id: 'p1', colorIdentity: ['R'] }),
      makePost({ id: 'p2', colorIdentity: ['U'] }),
      makePost({ id: 'p3', colorIdentity: ['G'] }),
    ];
    component.toggleColor('R');
    component.toggleColor('U');
    expect(component.filteredPosts(posts)).toHaveSize(2);
  });

  it('toggleColor removes color when already selected', async () => {
    const { component } = await setup();
    component.toggleColor('R');
    expect(component.selectedColors.has('R')).toBeTrue();
    component.toggleColor('R');
    expect(component.selectedColors.has('R')).toBeFalse();
  });
});

// ── filteredPosts — format filter ─────────────────────────────────────────────

describe('ForumListComponent — filteredPosts format filter', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('filters by format (case-insensitive normalisation)', async () => {
    const { component } = await setup();
    const posts = [
      makePost({ id: 'p1', deckFormat: 'commander' }),
      makePost({ id: 'p2', deckFormat: 'standard' }),
    ];
    component.toggleFormat('Commander');
    expect(component.filteredPosts(posts)).toHaveSize(1);
    expect(component.filteredPosts(posts)[0].id).toBe('p1');
  });

  it('excludes posts with null format when a format is selected', async () => {
    const { component } = await setup();
    const posts = [
      makePost({ id: 'p1', deckFormat: null }),
      makePost({ id: 'p2', deckFormat: 'modern' }),
    ];
    component.toggleFormat('Modern');
    expect(component.filteredPosts(posts)).toHaveSize(1);
  });
});

// ── filteredPosts — sort ──────────────────────────────────────────────────────

describe('ForumListComponent — filteredPosts sort', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sorts by newest publishedAt by default', async () => {
    const { component } = await setup();
    const posts = [
      makePost({ id: 'old', publishedAt: '2024-01-01T00:00:00Z' }),
      makePost({ id: 'new', publishedAt: '2024-06-01T00:00:00Z' }),
    ];
    const result = component.filteredPosts(posts);
    expect(result[0].id).toBe('new');
  });

  it('sorts by comment count descending when sortBy is comments', async () => {
    const { component } = await setup();
    const posts = [
      makePost({ id: 'few',  commentCount: 2 }),
      makePost({ id: 'many', commentCount: 10 }),
    ];
    component.setSortBy('comments');
    const result = component.filteredPosts(posts);
    expect(result[0].id).toBe('many');
  });

  it('sorts by card count descending when sortBy is cards', async () => {
    const { component } = await setup();
    const posts = [
      makePost({ id: 'small', cardCount: 40 }),
      makePost({ id: 'large', cardCount: 100 }),
    ];
    component.setSortBy('cards');
    const result = component.filteredPosts(posts);
    expect(result[0].id).toBe('large');
  });
});

// ── clearFilters ──────────────────────────────────────────────────────────────

describe('ForumListComponent — clearFilters', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('resets all filter state', async () => {
    const { component } = await setup();
    component.searchQuery = 'burn';
    component.toggleColor('R');
    component.toggleFormat('Commander');
    component.clearFilters();
    expect(component.searchQuery).toBe('');
    expect(component.selectedColors.size).toBe(0);
    expect(component.selectedFormats.size).toBe(0);
  });

  it('hasActiveFilters is false after clearFilters', async () => {
    const { component } = await setup();
    component.searchQuery = 'test';
    component.clearFilters();
    expect(component.hasActiveFilters).toBeFalse();
  });

  it('hasActiveFilters is true when search is non-empty', async () => {
    const { component } = await setup();
    component.searchQuery = 'something';
    expect(component.hasActiveFilters).toBeTrue();
  });
});
