import {
  Component, OnInit, OnDestroy,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AppState } from '../../store';
import { DeckActions } from '../../store/deck/deck.actions';
import { selectDecks, selectDeckLoading } from '../../store/deck/deck.selectors';
import { DeckDto } from '../../services/deck-api.service';
import { CoverPickerModalComponent } from '../../components/cover-picker-modal/cover-picker-modal.component';

@Component({
  selector: 'app-deck-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, CoverPickerModalComponent],
  templateUrl: './deck-list.component.html',
  styleUrls: ['./deck-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckListComponent implements OnInit, OnDestroy {
  decks$: Observable<DeckDto[]>;
  loading$: Observable<boolean>;

  sortedDecks: DeckDto[] = [];

  showCreateForm = false;
  createForm: FormGroup;

  menuDeckId: string | null = null;
  renamingDeckId: string | null = null;
  renameDraft = '';

  coverPickerDeck: DeckDto | null = null;

  dragDeckId: string | null = null;
  dragOverDeckId: string | null = null;

  private readonly ORDER_KEY = 'deck-list-order';
  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private router: Router,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
  ) {
    this.decks$ = this.store.select(selectDecks);
    this.loading$ = this.store.select(selectDeckLoading);
    this.createForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(256)]],
    });
  }

  ngOnInit(): void {
    this.store.dispatch(DeckActions.loadDecks());

    this.store.select(selectDecks).pipe(takeUntil(this.destroy$)).subscribe(decks => {
      this.applySavedOrder(decks);
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private applySavedOrder(decks: DeckDto[]): void {
    const saved = localStorage.getItem(this.ORDER_KEY);
    if (!saved) { this.sortedDecks = [...decks]; return; }
    const order: string[] = JSON.parse(saved);
    const byId = new Map(decks.map(d => [d.id, d]));
    const sorted = order.filter(id => byId.has(id)).map(id => byId.get(id)!);
    const inOrder = new Set(order);
    for (const d of decks) if (!inOrder.has(d.id)) sorted.push(d);
    this.sortedDecks = sorted;
  }

  private saveDeckOrder(): void {
    localStorage.setItem(this.ORDER_KEY, JSON.stringify(this.sortedDecks.map(d => d.id)));
  }

  openDeck(id: string): void {
    this.router.navigate(['/deck', id]);
  }

  openCreateForm(): void {
    this.createForm.reset({ name: '' });
    this.showCreateForm = true;
  }

  closeCreateForm(): void {
    this.showCreateForm = false;
  }

  submitCreate(): void {
    if (this.createForm.invalid) return;
    const { name } = this.createForm.value;
    this.store.dispatch(DeckActions.createDeck({ name: name.trim(), coverUri: null }));
    this.showCreateForm = false;
  }

  deleteDeck(event: Event, id: string): void {
    event.stopPropagation();
    this.store.dispatch(DeckActions.deleteDeck({ id }));
  }

  coverUri(deck: DeckDto): string | null {
    return deck.coverUri ?? null;
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  // ---- 3-dot menu ----------------------------------------

  toggleMenu(event: Event, id: string): void {
    event.stopPropagation();
    this.menuDeckId = this.menuDeckId === id ? null : id;
    this.cdr.markForCheck();
  }

  closeMenu(): void {
    this.menuDeckId = null;
    this.cdr.markForCheck();
  }

  // ---- Inline rename -------------------------------------

  startRename(event: Event, deck: DeckDto): void {
    event.stopPropagation();
    this.menuDeckId = null;
    this.renamingDeckId = deck.id;
    this.renameDraft = deck.name;
    this.cdr.markForCheck();
  }

  commitRename(deck: DeckDto): void {
    const name = this.renameDraft.trim();
    if (name && name !== deck.name) {
      this.store.dispatch(DeckActions.updateDeckMeta({
        id: deck.id,
        name,
        coverUri: deck.coverUri ?? null,
        format: deck.format ?? null,
        commanderOracleId: deck.commanderOracleId ?? null,
      }));
    }
    this.renamingDeckId = null;
    this.cdr.markForCheck();
  }

  cancelRename(): void {
    this.renamingDeckId = null;
    this.cdr.markForCheck();
  }

  // ---- Cover picker ---------------------------------------

  openCoverPicker(event: Event, deck: DeckDto): void {
    event.stopPropagation();
    this.menuDeckId = null;
    this.coverPickerDeck = deck;
    this.cdr.markForCheck();
  }

  closeCoverPicker(): void {
    this.coverPickerDeck = null;
    this.cdr.markForCheck();
  }

  onCoverSelected(deck: DeckDto, uri: string | null): void {
    this.store.dispatch(DeckActions.updateDeckMeta({
      id: deck.id,
      name: deck.name,
      coverUri: uri,
      format: deck.format ?? null,
      commanderOracleId: deck.commanderOracleId ?? null,
    }));
    this.closeCoverPicker();
  }

  // ---- Drag reorder ---------------------------------------

  onDeckDragStart(deck: DeckDto, e: DragEvent): void {
    this.dragDeckId = deck.id;
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', deck.id);
    this.cdr.markForCheck();
  }

  onDeckDragOver(deck: DeckDto, e: DragEvent): void {
    if (!this.dragDeckId || this.dragDeckId === deck.id) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    if (this.dragOverDeckId !== deck.id) {
      this.dragOverDeckId = deck.id;
      this.cdr.markForCheck();
    }
  }

  onDeckDrop(deck: DeckDto, e: DragEvent): void {
    e.preventDefault();
    if (!this.dragDeckId || this.dragDeckId === deck.id) return;
    const fromIdx = this.sortedDecks.findIndex(d => d.id === this.dragDeckId);
    const toIdx   = this.sortedDecks.findIndex(d => d.id === deck.id);
    if (fromIdx < 0 || toIdx < 0) return;
    const updated = [...this.sortedDecks];
    const [removed] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, removed);
    this.sortedDecks = updated;
    this.saveDeckOrder();
    this.dragDeckId    = null;
    this.dragOverDeckId = null;
    this.cdr.markForCheck();
  }

  onDeckDragEnd(): void {
    this.dragDeckId    = null;
    this.dragOverDeckId = null;
    this.cdr.markForCheck();
  }
}
