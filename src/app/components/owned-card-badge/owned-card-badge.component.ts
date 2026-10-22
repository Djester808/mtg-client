import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { CollectionOwnershipService } from '../../services/collection-ownership.service';
@Component({
  selector: 'app-owned-card-badge',
  standalone: true,
  imports: [CommonModule],
  template:
    '<span *ngIf="ownership.count(oracleId,printing) as count">Owned across collections: {{count.normal+count.foil+count.etched}} <small>({{count.normal}} normal, {{count.foil}} foil, {{count.etched}} etched)</small></span>',
  styles: [
    ':host{display:block;color:var(--text-secondary);font-size:calc(11px * var(--text-scale,1));overflow-wrap:anywhere;}small{font:inherit;}',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnedCardBadgeComponent {
  @Input({ required: true }) oracleId = '';
  @Input() printing?: string | null;
  readonly ownership = inject(CollectionOwnershipService);
  ngOnChanges(): void {
    this.ownership.ensure();
  }
}
