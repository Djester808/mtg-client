import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, Subject, startWith, switchMap, combineLatest } from 'rxjs';
import { ExploreApiService, ExploreEntry } from '../../services/explore-api.service';
@Component({
  selector: 'app-commander-directory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './commander-directory.component.html',
  styleUrls: ['./commander-directory.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommanderDirectoryComponent {
  private readonly api = inject(ExploreApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly reload = new Subject<void>();
  readonly state = signal<Partial<Record<string, string>>>({});
  readonly rows = signal<ExploreEntry[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly size = signal(40);
  readonly loading = signal(false);
  readonly failed = signal(false);
  constructor() {
    combineLatest([this.route.queryParamMap, this.reload.pipe(startWith(undefined))])
      .pipe(
        map(([q]) => {
          const p: Record<string, string> = {};
          for (const key of [
            'q',
            'identity',
            'mode',
            'window',
            'sort',
            'dir',
            'page',
            'pageSize',
          ]) {
            const value = q.get('d_' + key);
            if (value != null) p[key] = value;
          }
          return p;
        }),
        switchMap((p) => {
          this.state.set(p);
          this.loading.set(true);
          this.failed.set(false);
          return this.api.directoryPage(p).pipe(
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (result) {
          this.rows.set(result.commanders);
          this.total.set(result.total);
          this.page.set(result.page);
          this.size.set(result.pageSize);
        } else this.rows.set([]);
      });
  }
  change(key: string, value: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ['d_' + key]: value || null, ...(key !== 'page' ? { d_page: null } : {}) },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  retry(): void {
    this.reload.next();
  }
}
