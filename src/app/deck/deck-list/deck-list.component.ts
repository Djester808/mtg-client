import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { AppState } from '../../store';
import { DeckActions } from '../../store/deck/deck.actions';
import { selectDecks, selectDeckLoading } from '../../store/deck/deck.selectors';
import { CollectionDto } from '../../models/game.models';
import { parseDeckMeta } from '../../models/deck.models';

@Component({
  selector: 'app-deck-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './deck-list.component.html',
  styleUrls: ['./deck-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckListComponent implements OnInit {
  decks$: Observable<CollectionDto[]>;
  loading$: Observable<boolean>;

  showCreateForm = false;
  createForm: FormGroup;

  constructor(
    private store: Store<AppState>,
    private router: Router,
    private fb: FormBuilder,
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

  coverUri(deck: CollectionDto): string | null {
    return parseDeckMeta(deck.description).coverUri ?? null;
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
