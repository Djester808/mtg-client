import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly colors = [
    { cls: 'W', label: 'White' },
    { cls: 'U', label: 'Blue'  },
    { cls: 'B', label: 'Black' },
    { cls: 'R', label: 'Red'   },
    { cls: 'G', label: 'Green' },
  ];

  constructor(private router: Router) {}

  play(): void {
    this.router.navigate(['/lobby']);
  }

  openKb(): void {
    this.router.navigate(['/kb']);
  }

  openCollection(): void {
    this.router.navigate(['/collection']);
  }
}
