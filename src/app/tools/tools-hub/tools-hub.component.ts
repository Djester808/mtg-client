import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface Tool {
  path: string;
  name: string;
  blurb: string;
  glyph: string;
  /** Off when the tool needs a signed-in account to be worth opening. */
  worksSignedOut: boolean;
}

/**
 * The things in this app that are not about a collection or a deck.
 *
 * A list of one is a list, and the alternative was hanging the life counter off the navbar
 * next to Decks — where it would read as a fifth section of the deck builder rather than
 * something you open at a table with the app otherwise closed.
 */
@Component({
  selector: 'app-tools-hub',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './tools-hub.component.html',
  styleUrls: ['./tools-hub.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolsHubComponent {
  readonly tools: readonly Tool[] = [
    {
      path: '/tools/life-counter',
      name: 'Life counter',
      blurb:
        'Life, poison, commander damage, energy and the rest, for up to eight players. Sign in at a seat to keep a win/loss record.',
      glyph: '◆',
      worksSignedOut: true,
    },
  ];
}
