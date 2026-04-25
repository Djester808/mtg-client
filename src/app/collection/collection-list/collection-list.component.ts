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
import { CollectionActions } from '../../store/collection/collection.actions';
import { selectCollections, selectCollectionLoading } from '../../store/collection/collection.selectors';
import { CollectionDto } from '../../models/game.models';
import { CoverPickerModalComponent } from '../../components/cover-picker-modal/cover-picker-modal.component';

@Component({
  selector: 'app-collection-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, CoverPickerModalComponent],
  templateUrl: './collection-list.component.html',
  styleUrls: ['./collection-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionListComponent implements OnInit, OnDestroy {
  collections$: Observable<CollectionDto[]>;
  loading$: Observable<boolean>;

  showCreateForm = false;
  createForm: FormGroup;

  menuColId: string | null = null;
  renamingColId: string | null = null;
  renameDraft = '';

  coverPickerCol: CollectionDto | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private router: Router,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  coverUri(col: CollectionDto): string | null {
    return col.coverUri ?? null;
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  // ---- 3-dot menu ----------------------------------------

  toggleMenu(event: Event, id: string): void {
    event.stopPropagation();
    this.menuColId = this.menuColId === id ? null : id;
    this.cdr.markForCheck();
  }

  closeMenu(): void {
    this.menuColId = null;
    this.cdr.markForCheck();
  }

  // ---- Inline rename -------------------------------------

  startRename(event: Event, col: CollectionDto): void {
    event.stopPropagation();
    this.menuColId = null;
    this.renamingColId = col.id;
    this.renameDraft = col.name;
    this.cdr.markForCheck();
  }

  commitRename(col: CollectionDto): void {
    const name = this.renameDraft.trim();
    if (name && name !== col.name) {
      this.store.dispatch(CollectionActions.updateCollectionMeta({
        id: col.id,
        name,
        description: col.description ?? null,
        coverUri: col.coverUri ?? null,
      }));
    }
    this.renamingColId = null;
    this.cdr.markForCheck();
  }

  cancelRename(): void {
    this.renamingColId = null;
    this.cdr.markForCheck();
  }

  // ---- Cover picker ---------------------------------------

  openCoverPicker(event: Event, col: CollectionDto): void {
    event.stopPropagation();
    this.menuColId = null;
    this.coverPickerCol = col;
    this.cdr.markForCheck();
  }

  closeCoverPicker(): void {
    this.coverPickerCol = null;
    this.cdr.markForCheck();
  }

  onCoverSelected(col: CollectionDto, uri: string | null): void {
    this.store.dispatch(CollectionActions.updateCollectionMeta({
      id: col.id,
      name: col.name,
      description: col.description ?? null,
      coverUri: uri,
    }));
    this.closeCoverPicker();
  }
}
