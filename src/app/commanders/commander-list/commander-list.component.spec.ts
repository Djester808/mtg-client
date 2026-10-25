import { Subject } from 'rxjs';
import { CommanderListComponent } from './commander-list.component';
describe('CommanderListComponent request ordering', () => {
  it('cancels an old search when another starts', () => {
    const first = new Subject<any[]>(),
      second = new Subject<any[]>();
    const api = { searchCommanders: jasmine.createSpy().and.returnValues(first, second) };
    const page = new CommanderListComponent(api as any, { markForCheck: () => undefined } as any);
    page.onSearchChanged('old');
    page.onSearchChanged('new');
    second.next([{ oracleId: 'new' }]);
    first.next([{ oracleId: 'old' }]);
    expect(page.commanders[0].oracleId).toBe('new');
    page.ngOnDestroy();
    expect(second.observed).toBeFalse();
  });
});
