import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ToastContainerComponent } from './components/toast/toast-container.component';
import { KeywordSheetComponent } from './components/keyword-sheet/keyword-sheet.component';

/** A game in progress takes the whole screen; every other route sits under the navbar. */
const FULL_SCREEN = /^\/play\/[^/]+/;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    NavbarComponent,
    ToastContainerComponent,
    KeywordSheetComponent,
  ],
  template: `
    <app-navbar *ngIf="!fullScreen()" />
    <div class="app-content" [class.is-full-screen]="fullScreen()">
      <router-outlet />
    </div>
    <app-toast-container />
    <app-keyword-sheet />
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
      }
      .app-content {
        height: calc(100vh - 52px);
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
        height: 100vh;
        margin-top: 0;
        overflow: hidden;
      }
    `,
  ],
})
export class AppComponent {
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly fullScreen = computed(() => FULL_SCREEN.test(this.url()));
}
