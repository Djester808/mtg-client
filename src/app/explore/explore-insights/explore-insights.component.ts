import {
  ChangeDetectionStrategy,
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExplorePage } from '../../services/explore-api.service';
import { ExploreInsightsService, ExploreInsights } from '../../services/explore-insights.service';
import { CardDto } from '../../models/game.models';
import { ManaCostComponent } from '../../components/mana-cost/mana-cost.component';
@Component({
  selector: 'app-explore-insights',
  standalone: true,
  imports: [CommonModule, ManaCostComponent],
  templateUrl: './explore-insights.component.html',
  styleUrls: ['./explore-insights.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreInsightsComponent {
  private readonly service = inject(ExploreInsightsService);
  model: ExploreInsights = { charts: [], scatter: [] };
  @Input({ required: true }) set page(value: ExplorePage) {
    this.model = this.service.model(value);
  }
  @Output() preview = new EventEmitter<CardDto>();
}
