import { BehaviorSubject, Subject, of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { CommanderDetailComponent } from './commander-detail.component';
describe('CommanderDetailComponent route ordering', () => {
  it('cancels previous commander responses and resets tag filters on reused routes', () => {
    const params = new BehaviorSubject(convertToParamMap({ oracleId: 'old' }));
    const first = new Subject<any>(),
      second = new Subject<any>();
    const api = {
      getCommanderProfile: jasmine.createSpy().and.returnValues(first, second),
      getCommanderCards: () => of({ cards: [], totalDecks: 0 }),
      getCommanderDecks: () => of([]),
    };
    const page = new CommanderDetailComponent(
      { paramMap: params } as any,
      api as any,
      {} as any,
      { markForCheck: () => undefined } as any,
    );
    page.ngOnInit();
    page.deckTag = 'old-tag';
    params.next(convertToParamMap({ oracleId: 'new' }));
    second.next({ name: 'new' });
    first.next({ name: 'old' });
    expect((page.profile as any).name).toBe('new');
    expect(page.deckTag).toBe('');
    page.ngOnDestroy();
    expect(second.observed).toBeFalse();
  });
});
