import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <app-navbar />
    <div class="app-content">
      <router-outlet />
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; }
    .app-content { height: calc(100vh - 52px); margin-top: 52px; overflow: hidden; }
  `],
})
export class AppComponent {}
