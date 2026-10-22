import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { StackComponent } from './stack.component';
import { StackObjectDto, StackObjectType } from '../../models/game.models';
import { UIActions } from '../../store';
describe('StackComponent inspection', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ imports: [StackComponent], providers: [provideMockStore()] }),
  );
  it('opens card options without targeting or acting on the spell', () => {
    const fixture = TestBed.createComponent(StackComponent),
      dispatch = spyOn(TestBed.inject(MockStore), 'dispatch');
    const spell: StackObjectDto = {
      stackObjectId: 'o7',
      type: StackObjectType.Spell,
      controllerId: 'p0',
      sourceCardName: 'Spell',
      description: '',
      targets: [],
    };
    const event = new MouseEvent('contextmenu', { cancelable: true });
    fixture.componentInstance.options(event, spell);
    expect(event.defaultPrevented).toBeTrue();
    expect(dispatch).not.toHaveBeenCalled();
    fixture.componentInstance.inspect();
    expect(dispatch).toHaveBeenCalledOnceWith(UIActions.selectCard({ cardId: 'o7' }));
    fixture.destroy();
  });
});
