import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { AppState } from '../../store';
import { CollectionActions } from '../../store/collection/collection.actions';
import { selectCollections, selectCollectionLoading } from '../../store/collection/collection.selectors';
import { CollectionDto } from '../../models/game.models';

@Component({
  selector: 'app-collection-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './collection-list.component.html',
  styleUrls: ['./collection-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionListComponent implements OnInit {
  collections$: Observable<CollectionDto[]>;
  loading$: Observable<boolean>;

  showCreateForm = false;
  createForm: FormGroup;

  constructor(
    private store: Store<AppState>,
    private router: Router,
    private fb: FormBuilder,
  ) {
    this.collections$ = this.store.select(selectCollections);
    this.loading$ = this.store.select(selectCollectionLoading);
    this.createForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(256)]],
      description: ['', Validators.maxLength(1000)],
    });
  }

  ngOnInit(): void {
    this.store.dispatch(CollectionActions.loadCollections());
  }

  openCollection(id: string): void {
    this.router.navigate(['/collection', id]);
  }

  openCreateForm(): void {
    this.createForm.reset({ name: '', description: '' });
    this.showCreateForm = true;
  }

  closeCreateForm(): void {
    this.showCreateForm = false;
  }

  submitCreate(): void {
    if (this.createForm.invalid) return;
    const { name, description } = this.createForm.value;
    this.store.dispatch(CollectionActions.createCollection({
      request: { name: name.trim(), description: description?.trim() || null },
    }));
    this.showCreateForm = false;
  }

  deleteCollection(event: Event, id: string): void {
    event.stopPropagation();
    this.store.dispatch(CollectionActions.deleteCollection({ id }));
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
