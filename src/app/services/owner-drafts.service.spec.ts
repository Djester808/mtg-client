import { TestBed } from '@angular/core/testing';
import { OwnerDraftsService } from './owner-drafts.service';
import { BuilderDraftService, BuilderDraft, validBuilderDraft } from './builder-draft.service';
import { saveAuth, clearAuth } from './auth-storage';
function signIn(owner: string) {
  saveAuth('x.' + btoa(JSON.stringify({ sub: owner })) + '.x', owner);
}
const text = (v: unknown): v is string => typeof v === 'string';
const draft: BuilderDraft = {
  version: 1,
  brief: 'Token creatures',
  colors: ['G'],
  bracket: 3,
  ownedOnly: false,
  step: 'commanders',
  suggestions: [],
  picked: null,
  plan: null,
  saveAttemptDeckId: null,
  stageLabel: 'Planning',
  stageStep: 2,
};
describe('Owner drafts', () => {
  afterEach(() => {
    for (const owner of ['draft-a', 'draft-b'])
      for (const suffix of ['publish.deck', 'builder.current'])
        localStorage.removeItem('compleat.draft.v1.' + owner + '.' + suffix);
    clearAuth();
  });
  it('uses the stable nameid claim issued by the real server', () => {
    saveAuth('x.' + btoa(JSON.stringify({ nameid: 'draft-a' })) + '.x', 'Renamable user');
    const service = TestBed.inject(OwnerDraftsService);
    service.write('publish', 'deck', 'Real token draft');
    expect(service.read('publish', 'deck', text)).toBe('Real token draft');
  });
  it('isolates owners, survives new service instances, and removes a confirmed draft', () => {
    signIn('draft-a');
    const s = TestBed.inject(OwnerDraftsService);
    s.write('publish', 'deck', 'Description');
    expect(new OwnerDraftsService().read('publish', 'deck', text)).toBe('Description');
    signIn('draft-b');
    expect(s.read('publish', 'deck', text)).toBeNull();
    signIn('draft-a');
    s.remove('publish', 'deck');
    expect(s.read('publish', 'deck', text)).toBeNull();
  });
  it('rejects malformed and wrong-version data without breaking the screen', () => {
    signIn('draft-a');
    const s = TestBed.inject(BuilderDraftService);
    s.save(draft);
    expect(s.load()).toEqual(draft);
    localStorage.setItem('compleat.draft.v1.draft-a.builder.current', 'bad json');
    expect(s.load()).toBeNull();
    expect(validBuilderDraft({ ...draft, version: 2 })).toBeFalse();
    expect(validBuilderDraft({ ...draft, colors: ['invalid'] })).toBeFalse();
    expect(validBuilderDraft({ ...draft, plan: { cards: [] } })).toBeFalse();
    expect(validBuilderDraft(null)).toBeFalse();
    s.clear();
    expect(s.load()).toBeNull();
  });
  it('reports unavailable device storage and ignores signed-out writes', () => {
    signIn('draft-a');
    const s = TestBed.inject(OwnerDraftsService);
    spyOn(Storage.prototype, 'setItem').and.throwError('full');
    s.write('publish', 'deck', 'Text');
    expect(s.saved()).toBeFalse();
    clearAuth();
    s.write('publish', 'deck', 'Text');
    expect(s.read('publish', 'deck', text)).toBeNull();
  });
});
