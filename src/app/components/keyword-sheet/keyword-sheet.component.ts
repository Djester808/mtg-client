import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, switchMap } from 'rxjs';
import { KeywordDetail, RulesApiService } from '../../services/rules-api.service';
import { RuleBlockComponent } from '../rule-block/rule-block.component';

/**
 * Shows a keyword's rules over whatever the reader is already looking at.
 *
 * Tapping a keyword in a card's rules text used to navigate to /kb — and because the link
 * carried `target="_blank"`, into a second tab with no history in it. The knowledge base's
 * own "← Back" then went to the home page, so the card, the search that found it and the
 * scroll position were all gone. The card modal is opened on seven different hosts and
 * none of them put the card in the URL, so no amount of history fixing brings it back:
 * the answer is not to leave it.
 *
 * It listens at the document because the links are written into `[innerHTML]` by
 * `OracleSymbolsPipe`, so there is no template to bind a handler in. One listener here
 * covers every host that renders card text, present and future.
 *
 * The listener is registered in the **capture** phase, which is not a detail: the card
 * modal calls `stopPropagation()` on clicks inside its own content so a click there does
 * not reach its backdrop and close it. A bubble-phase listener therefore never sees a
 * keyword tapped inside a card — the one place this has to work. Capture runs from the
 * document down, before anything gets the chance to stop it.
 */
@Component({
  selector: 'app-keyword-sheet',
  standalone: true,
  imports: [CommonModule, RouterLink, RuleBlockComponent],
  templateUrl: './keyword-sheet.component.html',
  styleUrls: ['./keyword-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeywordSheetComponent implements OnDestroy {
  keyword: KeywordDetail | null = null;
  loadingName: string | null = null;
  failed = false;

  /** Latest-wins by operator, not by a hand-written check on the pending name. */
  private readonly requests = new Subject<string>();
  private readonly clickHandler = (event: Event) => this.onDocumentClick(event as MouseEvent);
  private readonly keyHandler = (event: Event) => this.onDocumentKeydown(event as KeyboardEvent);

  get open(): boolean {
    return this.loadingName !== null || this.keyword !== null || this.failed;
  }

  constructor(
    private api: RulesApiService,
    private cdr: ChangeDetectorRef,
    @Inject(DOCUMENT) private document: Document,
  ) {
    this.document.addEventListener('click', this.clickHandler, true);
    this.document.addEventListener('keydown', this.keyHandler, true);

    this.requests.pipe(switchMap((name) => this.api.keyword(name))).subscribe({
      next: (keyword) => {
        this.keyword = keyword;
        this.loadingName = null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingName = null;
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('click', this.clickHandler, true);
    this.document.removeEventListener('keydown', this.keyHandler, true);
  }

  onDocumentClick(event: MouseEvent): void {
    // Leave modified clicks alone: someone asking for a new tab should get one, and the
    // anchor keeps a real href so that still works.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const link = (event.target as HTMLElement | null)?.closest?.('a.kw-link');
    if (!link) return;

    const name = keywordFromHref(link.getAttribute('href'));
    if (!name) return;

    event.preventDefault();
    this.show(name);
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.open) return;

    // Swallow it. The card modal underneath closes on Escape too, and dismissing the
    // sheet must not take the card with it.
    event.preventDefault();
    event.stopPropagation();
    this.close();
  }

  /** Kept for the spec and for anything that wants to dismiss the sheet directly. */
  onEscape(): void {
    if (this.open) this.close();
  }

  show(name: string): void {
    this.keyword = null;
    this.failed = false;
    this.loadingName = name;
    this.cdr.markForCheck();
    this.requests.next(name);
  }

  close(): void {
    this.keyword = null;
    this.loadingName = null;
    this.failed = false;
    this.cdr.markForCheck();
  }

  trackByNumber(_: number, rule: { number: string }): string {
    return rule.number;
  }
}

/** `/kb?kw=Double%20Strike` → `Double Strike`. */
export function keywordFromHref(href: string | null): string | null {
  if (!href) return null;

  const at = href.indexOf('kw=');
  if (at < 0) return null;

  const raw = href.slice(at + 3).split('&')[0];
  try {
    return decodeURIComponent(raw) || null;
  } catch {
    return null; // A malformed escape is not a keyword.
  }
}
