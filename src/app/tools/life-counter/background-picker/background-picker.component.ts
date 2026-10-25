import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subject, timer, of, EMPTY, catchError, switchMap, takeUntil } from 'rxjs';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { CardDto } from '../../../models/game.models';
import { selectIsLoggedIn } from '../../../store/auth/auth.selectors';
import { SearchInputComponent } from '../../../components/search-input/search-input.component';
import { prepareImage } from '../../../utils/avatar-image';

/** What the picker hands back. */
export interface ChosenArt {
  url: string;
  source: 'card' | 'upload';
  label: string;
}

/**
 * Backdrops are drawn small. 640px is generous for a panel that is at most half the screen
 * wide, and the cap is what keeps eight of them inside a browser's storage allowance.
 */
const MAX_ART_DIMENSION = 640;
const MAX_ART_BYTES = 180_000;

/** Enough art to choose from without scrolling all afternoon. */
const SEARCH_LIMIT = 24;

/**
 * Choosing what sits behind a player.
 *
 * Two sources, because the two answers people actually want are different: a card's art,
 * which the app already has thirty thousand of, and a photo of the person, which it never
 * will. Card search needs a signed-in account (`/api/cards` is authorized); the camera roll
 * does not, so a table of guests still gets to tell its seats apart.
 */
@Component({
  selector: 'app-background-picker',
  standalone: true,
  imports: [CommonModule, SearchInputComponent],
  templateUrl: './background-picker.component.html',
  styleUrls: ['./background-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackgroundPickerComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly store = inject(Store);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Shown so the picker can offer to remove what is already there. */
  @Input() current: string | null = null;
  @Input() currentLabel: string | null = null;

  @Output() chosen = new EventEmitter<ChosenArt | null>();
  @Output() cancelled = new EventEmitter<void>();

  readonly canSearchCards = toSignal(this.store.select(selectIsLoggedIn), { initialValue: false });

  results: CardDto[] = [];
  searching = false;
  searched = false;
  error: string | null = null;
  preparing = false;

  private currentQuery = '';
  private readonly queries = new Subject<string>();
  private readonly destroyed = new Subject<void>();

  constructor() {
    this.queries
      .pipe(
        // Switch immediately, so clearing or replacing text also cancels an in-flight request.
        switchMap((query) =>
          query.length < 2
            ? of([] as CardDto[])
            : timer(300).pipe(
                switchMap(() => this.search(query)),
                catchError(() => {
                  this.searching = false;
                  this.searched = this.currentQuery.length >= 2;
                  this.error = 'Card search is not answering.';
                  this.cdr.markForCheck();
                  return EMPTY;
                }),
              ),
        ),
        takeUntil(this.destroyed),
      )
      .subscribe({
        next: (cards) => {
          this.results = cards;
          this.searching = false;
          this.searched = this.currentQuery.length >= 2;
          this.cdr.markForCheck();
        },
        error: () => {
          this.searching = false;
          this.searched = this.currentQuery.length >= 2;
          this.error = 'Card search is not answering.';
          this.cdr.markForCheck();
        },
      });
  }

  onQuery(text: string): void {
    this.error = null;
    const query = text.trim();
    this.currentQuery = query;

    if (query.length < 2) {
      this.queries.next(query);
      this.results = [];
      this.searched = false;
      this.searching = false;
      this.cdr.markForCheck();
      return;
    }

    this.searching = true;
    this.cdr.markForCheck();
    this.queries.next(query);
  }

  private search(query: string) {
    return this.http.get<CardDto[]>('/api/cards/search', {
      params: { q: query, limit: SEARCH_LIMIT },
    });
  }

  /** Only cards whose art crop actually exists — a tile with no picture is not a choice. */
  artOf(card: CardDto): string | null {
    return card.imageUriArtCrop ?? card.imageUriNormal;
  }

  chooseCard(card: CardDto): void {
    const url = this.artOf(card);
    if (url) this.chosen.emit({ url, source: 'card', label: card.name });
  }

  /**
   * Takes a picture off the device.
   *
   * Shrunk here rather than stored as it arrives: a camera-roll photo is several megabytes
   * and thousands of pixels wide, and eight of those would blow past what a browser will
   * keep in localStorage — so the counter would lose every backdrop on the next reload,
   * silently. The same downscale the avatar upload uses does the work.
   */
  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared straight away so choosing the same file twice in a row still fires a change.
    input.value = '';
    if (!file) return;

    this.preparing = true;
    this.error = null;
    this.cdr.markForCheck();

    try {
      const prepared = await prepareImage(file, MAX_ART_DIMENSION, MAX_ART_BYTES);
      const url = await toDataUrl(prepared.blob);
      this.chosen.emit({ url, source: 'upload', label: file.name.replace(/\.[^.]+$/, '') });
    } catch (err) {
      // prepareImage rejects with a message written for the person who chose the file.
      this.error = err instanceof Error ? err.message : 'That picture could not be used.';
    } finally {
      this.preparing = false;
      this.cdr.markForCheck();
    }
  }

  clear(): void {
    this.chosen.emit(null);
  }

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
  }
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('That picture could not be read.'));
    reader.readAsDataURL(blob);
  });
}
