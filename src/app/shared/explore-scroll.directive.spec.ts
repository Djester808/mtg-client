import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, NavigationStart } from '@angular/router';
import { Subject } from 'rxjs';
import { ExploreScrollDirective } from './explore-scroll.directive';
import { ExploreScrollStateService } from '../services/explore-scroll-state.service';
@Component({
  standalone: true,
  imports: [ExploreScrollDirective],
  template:
    '<div class="app-content" style="height:100px;overflow:auto"><main [appExploreScroll]="true"><details><summary>Insights</summary><div style="height:300px">Chart</div></details><div style="height:1200px">Cards</div></main></div>',
})
class ReadingHostComponent {}
describe('Explore reading position', () => {
  it('restores scroll and open panels when returning to the same filtered URL', fakeAsync(() => {
    const events = new Subject<unknown>();
    const router = {
      url: '/explore/commanders/a?sort=mv',
      events,
      getCurrentNavigation: () => null,
    };
    TestBed.configureTestingModule({
      imports: [ReadingHostComponent],
      providers: [{ provide: Router, useValue: router }],
    });
    let f = TestBed.createComponent(ReadingHostComponent);
    f.detectChanges();
    tick(50);
    let host = f.nativeElement.querySelector('.app-content') as HTMLElement;
    const panel = f.nativeElement.querySelector('details') as HTMLDetailsElement;
    panel.open = true;
    host.scrollTop = 300;
    host.dispatchEvent(new Event('scroll'));
    events.next(new NavigationStart(1, '/explore/cards/b'));
    f.destroy();
    expect(TestBed.inject(ExploreScrollStateService).read(router.url)?.top).toBe(300);
    f = TestBed.createComponent(ReadingHostComponent);
    f.detectChanges();
    tick(50);
    host = f.nativeElement.querySelector('.app-content');
    expect(host.scrollTop).toBe(300);
    expect(f.nativeElement.querySelector('details').open).toBeTrue();
    f.destroy();
  }));
});
