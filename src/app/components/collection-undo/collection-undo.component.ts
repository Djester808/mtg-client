import { CommonModule } from '@angular/common';
import {
  Component,
  ChangeDetectionStrategy,
  Input,
  inject,
  DestroyRef,
  OnInit,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CollectionUndoService } from '../../services/collection-undo.service';
import { selectUsername } from '../../store/auth/auth.selectors';
import { selectActiveCollection } from '../../store/collection/collection.selectors';
import { selectActiveDeck } from '../../store/deck/deck.selectors';
import { CollectionActions } from '../../store/collection/collection.actions';
import { DeckActions } from '../../store/deck/deck.actions';
@Component({
  selector: 'app-collection-undo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './collection-undo.component.html',
  styleUrls: ['./collection-undo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionUndoComponent implements OnInit {
  @Input() collectionId: string | null = null;
  readonly undo = inject(CollectionUndoService);
  private readonly store = inject(Store);
  private readonly destroy = inject(DestroyRef);
  readonly username = this.store.selectSignal(selectUsername);
  private readonly collection = this.store.selectSignal(selectActiveCollection);
  private readonly deck = this.store.selectSignal(selectActiveDeck);
  ngOnInit(): void {
    if (this.collectionId) return;
    this.undo.completed.pipe(takeUntilDestroyed(this.destroy)).subscribe((ids) => {
      if (ids.includes(this.collection()?.id ?? ''))
        this.store.dispatch(CollectionActions.refreshCollection({ id: this.collection()!.id }));
      if (ids.includes(this.deck()?.id ?? ''))
        this.store.dispatch(DeckActions.refreshDeck({ id: this.deck()!.id }));
      this.store.dispatch(CollectionActions.loadCollections());
      this.store.dispatch(DeckActions.loadDecks());
    });
  }
}
