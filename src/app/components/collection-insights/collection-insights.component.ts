import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { CollectionCardDto } from '../../models/game.models';
import {
  CollectionInsight,
  CollectionInsightsService,
} from '../../services/collection-insights.service';
import { UiPreferencesService } from '../../services/ui-preferences.service';
@Component({
  selector: 'app-collection-insights',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './collection-insights.component.html',
  styleUrls: ['./collection-insights.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionInsightsComponent {
  @Input({ required: true }) cards: CollectionCardDto[] = [];
  @Input() summary: CollectionInsight[] | null = null;
  readonly insights = inject(CollectionInsightsService);
  readonly preferences = inject(UiPreferencesService);
}
