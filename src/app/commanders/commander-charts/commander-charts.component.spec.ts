import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { makeCard } from '../../testing/test-factories';
import { CommanderChartsComponent } from './commander-charts.component';

describe('Commander charts — Compleat branding', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommanderChartsComponent, HttpClientTestingModule, RouterTestingModule],
    });
  });

  it('uses the same purple in the distribution chart and its legend', () => {
    const fixture = TestBed.createComponent(CommanderChartsComponent);
    fixture.componentRef.setInput('cards', [
      {
        card: makeCard(),
        deckCount: 1,
        totalDecks: 1,
        inclusionPercent: 100,
        isGameChanger: false,
      },
    ]);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.typeDistData = [
      { name: 'Creature', value: 30 },
      { name: 'Land', value: 70 },
    ];
    component.setTypeMode('ring');
    fixture.detectChanges();
    expect(component.ringGradient).toContain('#b800e0 0.0% 30.0%');
    const dot: HTMLElement = fixture.nativeElement.querySelector('.ring-dot');
    const ring: HTMLElement = fixture.nativeElement.querySelector('.ring');
    expect(dot.style.background).toBe('rgb(184, 0, 224)');
    expect(ring.style.background).toContain('rgb(184, 0, 224)');
    fixture.destroy();
  });

  it('does not invent a chart when no cards are available', () => {
    const fixture = TestBed.createComponent(CommanderChartsComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.ringGradient).toBe('');
    fixture.destroy();
  });
});
