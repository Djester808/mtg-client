import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

/**
 * Adding a field here needs four edits, not one: the type, `LS_KEYS`, and a branch in each
 * of `readLocalStorage`/`writeLocalStorage`. They are written out by hand so a value is
 * validated on the way back in — localStorage holds whatever a previous version wrote, and
 * a stale string reaching a component as a layout mode renders an empty grid.
 */
export interface UserPreferences {
  deckLayout?: 'list' | 'visual';
  forumLayout?: 'list' | 'visual' | 'text';
  /** A CardGroupMode — widened from type/cmc/name when the forum adopted the shared bar. */
  forumSort?: string;
  collectionLayout?: 'list' | 'visual';
  /** A CardGroupMode. Kept loose here so the service does not depend on the grid module. */
  collectionGroup?: string;
}

const LS_KEYS: Record<keyof UserPreferences, string> = {
  deckLayout: 'pref.deckLayout',
  forumLayout: 'pref.forumLayout',
  forumSort: 'pref.forumSort',
  collectionLayout: 'pref.collectionLayout',
  collectionGroup: 'pref.collectionGroup',
};

/** The group modes a stored preference may name; anything else is ignored on read. */
const GROUP_MODES = [
  'cmc',
  'type',
  'creature-split',
  'name',
  'subtype',
  'color',
  'color-identity',
  'rarity',
  'artist',
  'set',
];

@Injectable({ providedIn: 'root' })
export class PreferencesApiService {
  private readonly base = '/api/preferences';

  constructor(private http: HttpClient) {}

  load(): Observable<UserPreferences> {
    return this.http.get<UserPreferences>(this.base).pipe(
      tap((prefs) => this.writeLocalStorage(prefs)),
      catchError(() => of(this.readLocalStorage())),
    );
  }

  save(prefs: UserPreferences): void {
    this.writeLocalStorage(prefs);
    this.http
      .put<UserPreferences>(this.base, prefs)
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  private readLocalStorage(): UserPreferences {
    const prefs: UserPreferences = {};
    const dl = localStorage.getItem(LS_KEYS.deckLayout);
    if (dl === 'list' || dl === 'visual') prefs.deckLayout = dl;
    const fl = localStorage.getItem(LS_KEYS.forumLayout);
    if (fl === 'list' || fl === 'visual' || fl === 'text') prefs.forumLayout = fl;
    const fs = localStorage.getItem(LS_KEYS.forumSort);
    if (fs && GROUP_MODES.includes(fs)) prefs.forumSort = fs;
    const cl = localStorage.getItem(LS_KEYS.collectionLayout);
    if (cl === 'list' || cl === 'visual') prefs.collectionLayout = cl;
    const cg = localStorage.getItem(LS_KEYS.collectionGroup);
    if (cg && GROUP_MODES.includes(cg)) prefs.collectionGroup = cg;
    return prefs;
  }

  private writeLocalStorage(prefs: UserPreferences): void {
    if (prefs.deckLayout) localStorage.setItem(LS_KEYS.deckLayout, prefs.deckLayout);
    if (prefs.forumLayout) localStorage.setItem(LS_KEYS.forumLayout, prefs.forumLayout);
    if (prefs.forumSort) localStorage.setItem(LS_KEYS.forumSort, prefs.forumSort);
    if (prefs.collectionLayout)
      localStorage.setItem(LS_KEYS.collectionLayout, prefs.collectionLayout);
    if (prefs.collectionGroup) localStorage.setItem(LS_KEYS.collectionGroup, prefs.collectionGroup);
  }
}
