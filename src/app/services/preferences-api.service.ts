import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

export interface UserPreferences {
  deckLayout?: 'list' | 'visual';
  forumLayout?: 'list' | 'visual' | 'text';
  forumSort?: 'type' | 'cmc' | 'name';
}

const LS_KEYS: Record<keyof UserPreferences, string> = {
  deckLayout: 'pref.deckLayout',
  forumLayout: 'pref.forumLayout',
  forumSort: 'pref.forumSort',
};

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
    if (fs === 'type' || fs === 'cmc' || fs === 'name') prefs.forumSort = fs;
    return prefs;
  }

  private writeLocalStorage(prefs: UserPreferences): void {
    if (prefs.deckLayout) localStorage.setItem(LS_KEYS.deckLayout, prefs.deckLayout);
    if (prefs.forumLayout) localStorage.setItem(LS_KEYS.forumLayout, prefs.forumLayout);
    if (prefs.forumSort) localStorage.setItem(LS_KEYS.forumSort, prefs.forumSort);
  }
}
