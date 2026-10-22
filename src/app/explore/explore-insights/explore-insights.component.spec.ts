import { TestBed } from '@angular/core/testing';
import { ExploreInsightsComponent } from './explore-insights.component';
import { ExplorePage, ExploreEntry } from '../../services/explore-api.service';
import { makeCard } from '../../testing/test-factories';
describe('Explore insights screen', () => {
  it('renders real chart values and lets a scatter point open its card', () => {
    const f = TestBed.createComponent(ExploreInsightsComponent);
    const card = makeCard({ oracleId: 'o', name: 'Card' });
    const preview = spyOn(f.componentInstance.preview, 'emit');
    f.componentRef.setInput('page', {
      charts: [{ title: 'Rank over time', points: [{ label: '2026-01', value: 5 }] }],
      sections: [
        {
          tag: 'a',
          title: 'A',
          cards: [{ name: 'Card', card, inclusion: 0.5, synergy: 0.1 } as ExploreEntry],
        },
      ],
    } as ExplorePage);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Rank over time');
    expect(f.nativeElement.querySelector('polyline')).not.toBeNull();
    const point = f.nativeElement.querySelector('.scatter-card');
    expect(point).not.toBeNull();
    point.dispatchEvent(new MouseEvent('click'));
    expect(preview).toHaveBeenCalledWith(card);
    f.componentRef.setInput('page', { charts: [], sections: [] } as unknown as ExplorePage);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.community-charts')).toBeNull();
    f.destroy();
  });
});
