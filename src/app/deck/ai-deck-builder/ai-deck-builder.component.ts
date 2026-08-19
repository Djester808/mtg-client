import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  SelectMenuComponent,
  SelectMenuOption,
} from '../../components/select-menu/select-menu.component';
import { HttpClient } from '@angular/common/http';
import { AiBuilderApiService } from '../../services/ai-builder-api.service';
import { CardModalComponent } from '../../components/card-modal/card-modal.component';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
import { PrintingsService } from '../../services/printings.service';
import { CardDto, PrintingDto } from '../../models/game.models';
import { DeckApiService } from '../../services/deck-api.service';
import { ToastService } from '../../services/toast.service';
import { AiBuildPlan, CommanderSuggestion, PlannedCard } from '../../models/ai-builder.models';
import { describeHttpError } from '../../utils/http-error.utils';

type Step = 'brief' | 'commanders' | 'plan';

/** The brackets, as the shared select wants them: value strings with labels. */
const BRACKETS: SelectMenuOption[] = [
  { value: '1', label: '1 — Exhibition' },
  { value: '2', label: '2 — Core' },
  { value: '3', label: '3 — Upgraded' },
  { value: '4', label: '4 — Optimised' },
  { value: '5', label: '5 — cEDH' },
];

/** WUBRG, in the order the game writes them. */
const COLORS = [
  { letter: 'W', label: 'White' },
  { letter: 'U', label: 'Blue' },
  { letter: 'B', label: 'Black' },
  { letter: 'R', label: 'Red' },
  { letter: 'G', label: 'Green' },
];

/** The order roles are shown in, matching how the doctrine talks about a deck. */
const ROLE_ORDER = ['Lands', 'Creatures', 'Spells'];

/**
 * A card in the review list, with how many copies the plan holds.
 *
 * A 99-card deck is mostly basics, and printing each one on its own row made the Lands tab
 * thirty-six identical lines of "Forest" — a list you cannot read and cannot check. The
 * counts stay honest: the tab still says 36, the row says Forest ×36.
 */
interface StackedCard {
  card: PlannedCard;
  count: number;
}

/**
 * Collapses repeats, keeping the order the plan produced.
 *
 * Keyed on oracle id rather than name so two printings of one card stack and two cards
 * that happen to share a name do not.
 */
function stackCards(cards: PlannedCard[]): StackedCard[] {
  const rows: StackedCard[] = [];
  const seen = new Map<string, StackedCard>();

  for (const card of cards) {
    const key = card.oracleId || card.name;
    const copies = Math.max(1, card.quantity ?? 1);
    const existing = seen.get(key);
    if (existing) {
      existing.count += copies;
      continue;
    }
    const row: StackedCard = { card, count: copies };
    seen.set(key, row);
    rows.push(row);
  }

  return rows;
}

/**
 * Build a Commander deck from a description: say what you want, pick from the commanders
 * the model proposes, then review all 99 cards before any of it is written.
 *
 * The review step is the point. The build endpoint has always been able to insert a whole
 * deck in one call, which makes a bad build something you undo by hand, card by card. This
 * stops one step earlier and asks.
 */
@Component({
  selector: 'app-ai-deck-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    SelectMenuComponent,
    CardModalComponent,
    ManaCostComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-deck-builder.component.html',
  styleUrls: ['./ai-deck-builder.component.scss'],
})
export class AiDeckBuilderComponent implements OnDestroy {
  readonly colors = COLORS;
  readonly brackets = BRACKETS;
  readonly maxBrief = 600;

  step: Step = 'brief';

  // ---- Step 1: the brief ----
  brief = '';
  chosenColors = new Set<string>();
  bracket = 3;
  ownedOnly = false;

  // ---- Step 2: commanders ----
  suggestions: CommanderSuggestion[] = [];
  discarded = 0;
  picked: CommanderSuggestion | null = null;

  // ---- Step 3: the plan ----
  plan: AiBuildPlan | null = null;
  deckId: string | null = null;

  /**
   * The deck this screen created and has not yet committed to.
   *
   * The build needs somewhere to write before the player has agreed to anything, so a deck
   * is created up front and the plan is streamed against it. That deck is this screen's
   * responsibility until the player accepts it: discarding, or leaving the page, has to
   * take it away again.
   *
   * Left alone, it did not. Every abandoned build put an empty deck named after a commander
   * in the player's list, permanently — 47 of one account's 69 decks were these. Null once
   * the plan is committed, because from that point the deck is the player's.
   */
  private createdDeckId: string | null = null;

  suggesting = false;
  planning = false;

  /**
   * Seconds spent on the current long call.
   *
   * Shown instead of a percentage for the suggestion step, whose stages the server does
   * not report. A progress bar that invents its own numbers and then sits at 90% is worse
   * than an honest count of how long you have been waiting.
   */
  elapsed = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;

  /** Where the build has got to, from the server's own stages. */
  stageLabel = '';
  stageStep = 0;
  stageTotal = 4;

  /**
   * The card open in the detail modal, or null.
   *
   * The real <app-card-modal>, the same one the deck and collection pages use — not a
   * picture of the card. It carries the printings picker, the rules text, legality and the
   * rest, and opening it here keeps you on the shortlist instead of navigating away.
   */
  modalCard: CardDto | null = null;
  modalPrintings: PrintingDto[] = [];
  modalViewScryfallId: string | null = null;
  modalFlipped = false;
  modalLoading = false;

  /** Cards the model has named so far, reported live from the streamed answer. */
  namedSoFar = 0;
  applying = false;
  error: string | null = null;

  constructor(
    private api: AiBuilderApiService,
    private decks: DeckApiService,
    private toast: ToastService,
    private router: Router,
    private http: HttpClient,
    private printings: PrintingsService,
    private cdr: ChangeDetectorRef,
  ) {}

  get busy(): boolean {
    return this.suggesting || this.planning || this.applying;
  }

  /**
   * The commanders to render: all of them, or only the one being built.
   *
   * Once you commit to a commander the others are no longer choices, and leaving them on
   * screen with dead buttons invites clicking one and wondering why nothing happened.
   */
  get visibleCommanders(): CommanderSuggestion[] {
    return this.picked && (this.planning || this.step === 'plan')
      ? [this.picked]
      : this.suggestions;
  }

  /** The shared select speaks in strings; the request wants a number. */
  setBracket(value: string): void {
    this.bracket = Number(value) || 3;
    this.cdr.markForCheck();
  }

  private startTimer(): void {
    this.stopTimer();
    this.elapsed = 0;
    this.ticker = setInterval(() => {
      this.elapsed++;
      this.cdr.markForCheck();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalCard) this.closeCard();
  }

  ngOnDestroy(): void {
    // Leaving the page mid-build must not leave a timer running against a dead view.
    this.stopTimer();

    // Nor an empty deck. Navigating within the app is the commonest way to abandon a
    // build — commoner than pressing Discard — and it left exactly the same orphan behind.
    this.deleteUncommittedDeck();
  }

  /**
   * The same cleanup, for the one exit Angular never sees.
   *
   * Closing the tab, reloading, or following a link out of the app tears the page down
   * without running ngOnDestroy, and any request started there dies with the context.
   * Measured: discard and in-app navigation both cleaned up, a hard unload left the deck
   * behind every time.
   *
   * `keepalive` is what survives that — the browser finishes the request after the page is
   * gone. sendBeacon cannot be used here because it carries no Authorization header, and
   * this endpoint is owner-only.
   */
  @HostListener('window:pagehide')
  onPageHide(): void {
    const id = this.createdDeckId;
    if (!id) return;

    this.createdDeckId = null;
    const token = localStorage.getItem('auth_token');

    fetch(`/api/decks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      keepalive: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => undefined);
  }

  /**
   * Opens the card detail modal for any oracle id on this page.
   *
   * Serves the commander tiles and the review rows alike: both are just a card the reader
   * wants to look at properly.
   */
  openCard(oracleId: string, event?: Event): void {
    event?.preventDefault();
    if (!oracleId) return;

    this.modalLoading = true;
    this.modalFlipped = false;
    this.modalViewScryfallId = null;
    this.cdr.markForCheck();

    this.http.get<CardDto>(`/api/cards/${encodeURIComponent(oracleId)}`).subscribe({
      next: (card) => {
        this.modalCard = card;
        this.modalLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.modalLoading = false;
        this.toast.error('Could not load that card.');
        this.cdr.markForCheck();
      },
    });

    // Printings arrive separately and are cached by the shared service, so reopening the
    // same card costs nothing.
    this.printings.get(oracleId).subscribe({
      next: (p) => {
        this.modalPrintings = p;
        this.cdr.markForCheck();
      },
      error: () => {
        this.modalPrintings = [];
        this.cdr.markForCheck();
      },
    });
  }

  closeCard(): void {
    this.modalCard = null;
    this.modalPrintings = [];
    this.cdr.markForCheck();
  }

  toggleColor(letter: string): void {
    if (this.chosenColors.has(letter)) this.chosenColors.delete(letter);
    else this.chosenColors.add(letter);
    this.cdr.markForCheck();
  }

  // ---- Step 1 -> 2 --------------------------------------------------------

  suggestCommanders(): void {
    if (this.busy) return;

    this.suggesting = true;
    this.error = null;
    this.startTimer();
    this.cdr.markForCheck();

    this.api
      .suggestCommanders({
        brief: this.brief.trim() || null,
        colors: [...this.chosenColors],
        bracket: this.bracket,
        ownedOnly: this.ownedOnly,
        count: 10,
      })
      .subscribe({
        next: (result) => {
          this.suggestions = result.commanders;
          this.discarded = result.discarded;
          this.suggesting = false;
          this.stopTimer();

          if (result.commanders.length === 0) {
            // Almost always the filters rather than the model: colours plus owned-only can
            // legitimately leave nothing to choose from.
            this.error =
              'No commanders matched. Try widening the colours, or turn off "only cards I own".';
          } else {
            this.step = 'commanders';
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.suggesting = false;
          this.stopTimer();
          this.error = describeHttpError(err, 'Could not suggest commanders.');
          this.cdr.markForCheck();
        },
      });
  }

  // ---- Step 2 -> 3 --------------------------------------------------------

  /**
   * Creates the deck, then plans into it.
   *
   * The plan endpoint works against a deck because it needs to know how many slots are
   * free, so the deck is made first, named after the commander. Abandoning the review
   * leaves an empty deck with its commander already set — a reasonable starting point
   * rather than litter.
   */
  buildAround(commander: CommanderSuggestion): void {
    if (this.busy) return;

    this.picked = commander;
    this.planning = true;
    this.error = null;
    this.startTimer();
    this.cdr.markForCheck();

    this.decks
      .createDeck({
        name: commander.name,
        format: 'commander',
        commanderOracleId: commander.oracleId,
        coverUri: commander.imageUriArtCrop ?? undefined,
      })
      .subscribe({
        next: (deck) => {
          this.deckId = deck.id;
          this.createdDeckId = deck.id;
          this.planInto(deck.id, commander);
        },
        error: (err) => {
          this.planning = false;
          this.error = describeHttpError(err, 'Could not create the deck.');
          this.cdr.markForCheck();
        },
      });
  }

  /**
   * Whether the bar has anything real to measure yet.
   *
   * Measured against the live API: the model emits nothing at all for roughly 160 seconds
   * and then writes every card name in about eight. There are no thinking deltas to count
   * either — the stream is genuinely silent for that whole first phase. So the bar sweeps
   * to show the call is alive, rather than parking at a number it made up, and only becomes
   * a real measure once card names start arriving.
   */
  get indeterminate(): boolean {
    return this.namedSoFar === 0;
  }

  /** Percentage for the track, once there is something honest to report. */
  get progress(): number {
    return this.namedSoFar === 0 ? 0 : Math.min(99, Math.round((this.namedSoFar / 99) * 100));
  }

  /** True while the deck is on screen but the verdict is still being written. */
  get assessing(): boolean {
    return this.planning && !!this.plan;
  }

  private planInto(deckId: string, commander: CommanderSuggestion): void {
    this.stageLabel = 'Starting';
    this.stageStep = 0;
    this.namedSoFar = 0;

    // Same source the suggestions stream uses: this path is fetch-based, so the auth
    // interceptor never runs and the header has to be attached by hand.
    const token = localStorage.getItem('auth_token');

    this.api
      .planBuildStream(
        deckId,
        commander.oracleId,
        this.bracket,
        'any',
        token,
        this.brief.trim() || null,
      )
      .subscribe({
        next: (event) => {
          if (event.type === 'stage') {
            this.stageLabel = event.label;
            this.stageStep = event.step;
            this.stageTotal = event.total;
            // The count the server streams off the model's answer. Without reading it the
            // bar has nothing to measure and never leaves its starting position, which is
            // exactly how a working stream looked like a dead one.
            if (event.named !== undefined) this.namedSoFar = event.named;
          } else if (event.type === 'plan') {
            // The deck exists; show it while the assessment is still running.
            this.plan = event.plan;
            this.step = 'plan';
          } else if (event.type === 'final') {
            this.plan = event.plan;
            this.step = 'plan';
            this.planning = false;
          } else {
            this.planning = false;
            this.error = event.message;
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.planning = false;
          this.error = describeHttpError(err, 'Could not build a deck for that commander.');
          this.cdr.markForCheck();
        },
        complete: () => {
          // A stream that ends without a final event still has to release the UI.
          this.planning = false;
          this.stopTimer();
          this.cdr.markForCheck();
        },
      });
  }

  // ---- Step 3: accept or discard ------------------------------------------

  acceptPlan(): void {
    if (!this.plan || !this.deckId || this.busy) return;

    this.applying = true;
    this.cdr.markForCheck();

    const deckId = this.deckId;

    // Handed over before the write, not after. Leaving the page while the apply is in
    // flight would otherwise run the cleanup against a deck that is mid-write; if the
    // apply fails, the claim is taken back below so Discard can still tidy up.
    this.createdDeckId = null;

    this.api
      .applyPlan(deckId, {
        commanderOracleId: this.plan.commanderOracleId,
        bracket: this.bracket,
        cards: this.plan.cards,
      })
      .subscribe({
        next: (result) => {
          this.applying = false;
          this.toast.show(`Added ${result.cardsAdded} cards`, 'success');
          this.router.navigate(['/deck', deckId]);
        },
        error: (err) => {
          this.applying = false;
          // The write failed, so the deck is this screen's responsibility again and
          // Discard can still take it away.
          this.createdDeckId = deckId;
          this.toast.error(describeHttpError(err, 'Could not save the deck.'));
          this.cdr.markForCheck();
        },
      });
  }

  /**
   * Throws the proposal away, and the empty deck it was written against with it.
   *
   * No cards were written, but the deck itself was — created before planning so the stream
   * had somewhere to go. Discarding has to undo that too, or the player is left holding a
   * deck they never agreed to.
   */
  discardPlan(): void {
    this.plan = null;
    this.picked = null;
    this.step = 'commanders';
    this.deleteUncommittedDeck();
    this.cdr.markForCheck();
  }

  /**
   * Removes the deck this screen created, if the player never committed to it.
   *
   * Deliberately silent. It is tidying up after something the player did not ask for in the
   * first place, so a failure is not theirs to act on — the worst case is the empty deck
   * that used to be left behind every time.
   */
  private deleteUncommittedDeck(): void {
    const id = this.createdDeckId;
    if (!id) return;

    this.createdDeckId = null;
    this.deckId = null;
    this.decks.deleteDeck(id).subscribe({ error: () => undefined });
  }

  backToBrief(): void {
    this.step = 'brief';
    this.cdr.markForCheck();
  }

  // ---- Plan presentation ---------------------------------------------------

  /** Memo for the grouped plan, which the template binds. */
  private grouped: {
    cards: PlannedCard[];
    result: { role: string; cards: PlannedCard[]; rows: StackedCard[] }[];
  } | null = null;

  /**
   * The plan split into the groups a player reads a decklist in.
   *
   * Memoized on the card array's identity: a template-bound getter runs on every
   * change-detection pass, and this one buckets ninety-nine cards.
   */
  get planByRole(): { role: string; cards: PlannedCard[]; rows: StackedCard[] }[] {
    const cards = this.plan?.cards ?? [];
    if (this.grouped && this.grouped.cards === cards) return this.grouped.result;

    const buckets = new Map<string, PlannedCard[]>(ROLE_ORDER.map((r) => [r, []]));
    for (const card of cards) {
      const type = (card.typeLine ?? '').toLowerCase();
      const role = type.includes('land')
        ? 'Lands'
        : type.includes('creature')
          ? 'Creatures'
          : 'Spells';
      buckets.get(role)!.push(card);
    }

    // Both shapes are kept: `cards` is every copy, which is what the deck actually holds
    // and what the tab counts; `rows` is what the list draws.
    const result = ROLE_ORDER.map((role) => ({
      role,
      cards: buckets.get(role)!,
      rows: stackCards(buckets.get(role)!),
    })).filter((g) => g.cards.length > 0);

    this.grouped = { cards, result };
    return result;
  }

  /**
   * Whether the assessment's findings are expanded.
   *
   * Closed by default. Measured at 375px: a 925-character verdict and eleven findings ran
   * about 2,200px, so the deck the player asked for sat below the critique of it. The
   * verdict is always visible; the detail is one tap away.
   */
  findingsOpen = false;

  toggleFindings(): void {
    this.findingsOpen = !this.findingsOpen;
    this.cdr.markForCheck();
  }

  /** Which review tab is open. */
  reviewTab = 'Lands';

  setReviewTab(role: string): void {
    this.reviewTab = role;
    this.cdr.markForCheck();
  }

  /** Cards in the open tab only — the list is ninety-nine long unsplit. */
  get reviewRows(): StackedCard[] {
    return this.planByRole.find((g) => g.role === this.reviewTab)?.rows ?? [];
  }

  manaClass(color: string): string {
    return `ms-${color.toLowerCase()}`;
  }

  /** Rejections are surfaced rather than hidden — see the DTO's remarks for why. */
  get skippedSummary(): string {
    const reasons = this.plan?.skippedByReason ?? {};
    const parts = Object.entries(reasons).map(([reason, count]) => `${reason} ×${count}`);
    return parts.join(', ');
  }
}
