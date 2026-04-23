import {
  Component, ElementRef, AfterViewInit,
  ChangeDetectionStrategy, OnDestroy, NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { combineLatest, Subject, takeUntil } from 'rxjs';
import { AppState } from '../../store';
import { selectCombatState, selectBattlefield } from '../../store/selectors';

interface Arrow {
  x1: number; y1: number;
  x2: number; y2: number;
  blocked: boolean;
}

@Component({
  selector: 'app-attack-arrows',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg class="arrows-svg" [attr.width]="width" [attr.height]="height">
      <defs>
        <marker id="arrowhead-attack" markerWidth="8" markerHeight="6"
          refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#e74c3c" opacity="0.9"/>
        </marker>
        <marker id="arrowhead-blocked" markerWidth="8" markerHeight="6"
          refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#9b59b6" opacity="0.7"/>
        </marker>
      </defs>
      <path
        *ngFor="let a of arrows; let i = index"
        [attr.d]="buildPath(a)"
        [attr.stroke]="a.blocked ? '#9b59b6' : '#e74c3c'"
        [attr.marker-end]="a.blocked ? 'url(#arrowhead-blocked)' : 'url(#arrowhead-attack)'"
        stroke-width="2"
        fill="none"
        [attr.stroke-dasharray]="a.blocked ? '4 3' : 'none'"
        stroke-opacity="0.8">
      </path>
    </svg>
  `,
  styles: [`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 100;
    }
    .arrows-svg {
      position: absolute;
      top: 0; left: 0;
      overflow: visible;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttackArrowsComponent implements AfterViewInit, OnDestroy {
  arrows: Arrow[] = [];
  width  = 0;
  height = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private store: Store<AppState>,
    private el: ElementRef<HTMLElement>,
    private zone: NgZone,
  ) {}

  ngAfterViewInit(): void {
    this.updateDimensions();

    combineLatest([
      this.store.select(selectCombatState),
      this.store.select(selectBattlefield),
    ]).pipe(takeUntil(this.destroy$))
      .subscribe(([combat]) => {
        this.zone.run(() => {
          this.arrows = combat ? this.buildArrows(combat) : [];
        });
      });
  }

  private updateDimensions(): void {
    const host = this.el.nativeElement.parentElement;
    if (host) {
      this.width  = host.offsetWidth;
      this.height = host.offsetHeight;
    }
  }

  private buildArrows(combat: any): Arrow[] {
    const arrows: Arrow[] = [];
    const boardEl = document.querySelector('.board');
    if (!boardEl) return arrows;

    for (const [attackerId, blockerIds] of Object.entries(combat.attackersToBlockers as Record<string, string[]>)) {
      const attackerEl = document.querySelector(`[data-permanent-id="${attackerId}"]`);
      if (!attackerEl) continue;

      const attackerRect = attackerEl.getBoundingClientRect();
      const boardRect    = boardEl.getBoundingClientRect();

      const x1 = attackerRect.left + attackerRect.width / 2 - boardRect.left;
      const y1 = attackerRect.top  - boardRect.top;

      if ((blockerIds as string[]).length === 0) {
        // Arrow to the top center of the board (opponent player area)
        arrows.push({ x1, y1, x2: x1, y2: 50, blocked: false });
      } else {
        for (const blockerId of blockerIds as string[]) {
          const blockerEl = document.querySelector(`[data-permanent-id="${blockerId}"]`);
          if (!blockerEl) continue;
          const blockerRect = blockerEl.getBoundingClientRect();
          const x2 = blockerRect.left + blockerRect.width / 2 - boardRect.left;
          const y2 = blockerRect.bottom - boardRect.top;
          arrows.push({ x1, y1, x2, y2, blocked: true });
        }
      }
    }
    return arrows;
  }

  buildPath(a: Arrow): string {
    const mx = (a.x1 + a.x2) / 2;
    const my = (a.y1 + a.y2) / 2 - 40;
    return `M ${a.x1} ${a.y1} Q ${mx} ${my} ${a.x2} ${a.y2}`;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
