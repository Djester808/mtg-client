import { CollectionUndoComponent } from './components/collection-undo/collection-undo.component';
import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith, take } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { BrandIntroComponent } from './components/brand-intro/brand-intro.component';
import { UiPreferencesService } from './services/ui-preferences.service';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ToastContainerComponent } from './components/toast/toast-container.component';
import { KeywordSheetComponent } from './components/keyword-sheet/keyword-sheet.component';

/** A game in progress takes the whole screen; every other route sits under the navbar. */
const FULL_SCREEN = /^\/play\/[^/]+/;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CollectionUndoComponent,
    CommonModule,
    BrandIntroComponent,
    RouterOutlet,
    NavbarComponent,
    ToastContainerComponent,
    KeywordSheetComponent,
  ],
  template: `
    <app-brand-intro *ngIf="introVisible()" (completed)="introVisible.set(false)" />
    <div class="app-shell" [attr.inert]="introVisible() ? '' : null">
      <app-navbar *ngIf="!fullScreen()" />
      <div class="app-content" [class.is-full-screen]="fullScreen()">
        <router-outlet />
      </div>
      <app-toast-container />
      <app-collection-undo />
      <app-keyword-sheet />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100dvh;
      }
      .app-shell {
        display: flow-root;
        height: 100%;
      }
      .app-content {
        height: calc(100dvh - 52px);
        margin-top: 52px;
        overflow-y: auto;
      }
      /*
       * The board is a table, not a page.
       *
       * It carries its own top bar — the phase track, whose priority it is, and the mark — and
       * was built as a full-screen surface with 900px of height to divide between two
       * battlefields and a 400px hand. Under the app's 52px navbar there was not enough left,
       * and the board that came back did not look like the board that went away.
       *
       * The way out is the board's own Leave button, which is where it was before.
       */
      .app-content.is-full-screen {
        height: 100dvh;
        margin-top: 0;
        overflow: hidden;
      }
    `,
  ],
})
export class AppComponent {
  readonly introVisible = signal(true);
  readonly preferences = inject(UiPreferencesService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        take(1),
      )
      .subscribe((event) => {
        if (event.urlAfterRedirects === '/' && this.preferences.state().startup !== '/')
          void this.router.navigateByUrl(this.preferences.state().startup);
      });
  }

  readonly fullScreen = computed(() => FULL_SCREEN.test(this.url()));
}
