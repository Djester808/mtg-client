import {
  Component, OnInit, OnDestroy,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Subject } from 'rxjs';
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

  showCreateForm = false;
  createForm: FormGroup;

  menuDeckId: string | null = null;
  renamingDeckId: string | null = null;
  renameDraft = '';

  coverPickerDeck: DeckDto | null = null;

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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
    }));
    this.closeCoverPicker();
  }
}
