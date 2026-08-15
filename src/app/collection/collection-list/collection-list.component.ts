import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Subject, take } from 'rxjs';
import { AppState } from '../../store';
import { CollectionActions } from '../../store/collection/collection.actions';
import {
  selectCollections,
  selectCollectionLoading,
} from '../../store/collection/collection.selectors';
import { CollectionDto } from '../../models/game.models';
import { CoverPickerModalComponent } from '../../components/cover-picker-modal/cover-picker-modal.component';
import { CollectionPickerDialogComponent } from '../../components/collection-picker-dialog/collection-picker-dialog.component';
import { flyCardGhost } from '../../shared/fly-card';

@Component({
  selector: 'app-collection-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CoverPickerModalComponent,
    CollectionPickerDialogComponent,
  ],
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

  /** The collection being merged away, or null when the merge dialog is closed. */
  mergeSource: CollectionDto | null = null;
  mergeTargetId: string | null = null;
  mergeDeleteSource = false;
  /** Target id whose tile is playing the landing bump. */
  mergedIntoId: string | null = null;
  private bumpTimer: ReturnType<typeof setTimeout> | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private router: Router,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>,
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
    if (this.bumpTimer) clearTimeout(this.bumpTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Stable identity so the grid animates only the tiles that actually changed. */
  trackById = (_: number, col: CollectionDto): string => col.id;

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
    this.store.dispatch(
      CollectionActions.createCollection({
        request: { name: name.trim(), description: description?.trim() || null },
      }),
    );
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
      this.store.dispatch(
        CollectionActions.updateCollectionMeta({
          id: col.id,
          name,
          description: col.description ?? null,
          coverUri: col.coverUri ?? null,
        }),
      );
    }
    this.renamingColId = null;
    this.cdr.markForCheck();
  }

  cancelRename(): void {
    this.renamingColId = null;
    this.cdr.markForCheck();
  }

  // ---- Merge ----------------------------------------------

  openMerge(event: Event, col: CollectionDto): void {
    event.stopPropagation();
    this.menuColId = null;
    this.mergeSource = col;
    this.mergeTargetId = null;
    this.mergeDeleteSource = false;
    this.cdr.markForCheck();
  }

  closeMerge(): void {
    this.mergeSource = null;
    this.mergeTargetId = null;
    this.cdr.markForCheck();
  }

  /** Everything except the collection being merged away — you cannot merge into itself. */
  mergeTargets(all: CollectionDto[] | null): CollectionDto[] {
    const sourceId = this.mergeSource?.id;
    return (all ?? []).filter((c) => c.id !== sourceId);
  }

  confirmMerge(choice: { targetId: string; checked: boolean }): void {
    const source = this.mergeSource;
    if (!source) return;

    this.collections$.pipe(take(1)).subscribe((all) => {
      const target = all.find((c) => c.id === choice.targetId);
      if (!target) return;

      // Capture both rects before the dialog closes and the grid reflows.
      const from = this.tileRect(source.id);
      const to = this.tileRect(target.id);

      this.store.dispatch(
        CollectionActions.mergeCollections({
          targetCollectionId: target.id,
          sourceCollectionId: source.id,
          deleteSource: choice.checked,
          targetName: target.name,
        }),
      );
      this.closeMerge();

      // The cover art flies from the source tile into the target, which then bumps —
      // the same flight-then-acknowledge pattern the deck board tabs use.
      const land = (): void => this.bumpTarget(target.id);
      if (!from || !to) {
        land();
        return;
      }
      void flyCardGhost({ from, to, imageUrl: source.coverUri ?? null }).then(land);
    });
  }

  private tileRect(collectionId: string): DOMRect | null {
    const el = this.host.nativeElement.querySelector(
      `.collection-card[data-col-id="${collectionId}"] .col-cover`,
    );
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // A collapsed or off-screen tile keeps a degenerate rect; flying to it looks broken.
    return rect.width > 4 && rect.height > 4 ? rect : null;
  }

  private bumpTarget(id: string): void {
    // Null first so a repeat merge into the same collection retriggers the animation.
    this.mergedIntoId = null;
    this.cdr.markForCheck();
    if (this.bumpTimer) clearTimeout(this.bumpTimer);
    setTimeout(() => {
      this.mergedIntoId = id;
      this.cdr.markForCheck();
      // Outlast the 450ms CSS animation so it always finishes.
      this.bumpTimer = setTimeout(() => {
        this.mergedIntoId = null;
        this.cdr.markForCheck();
      }, 500);
    });
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
    this.store.dispatch(
      CollectionActions.updateCollectionMeta({
        id: col.id,
        name: col.name,
        description: col.description ?? null,
        coverUri: uri,
      }),
    );
    this.closeCoverPicker();
  }
}
