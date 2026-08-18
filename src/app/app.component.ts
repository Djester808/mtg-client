import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ToastContainerComponent } from './components/toast/toast-container.component';
import { KeywordSheetComponent } from './components/keyword-sheet/keyword-sheet.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, ToastContainerComponent, KeywordSheetComponent],
  template: `
    <app-navbar />
    <div class="app-content">
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
    `,
  ],
})
export class AppComponent {}
