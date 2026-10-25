import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SecondaryCommanderComponent } from './secondary-commander.component';
import { SelectMenuComponent } from '../../components/select-menu/select-menu.component';
import { DeckDetailDto } from '../../services/deck-api.service';
import { CollectionCardDto } from '../../models/game.models';
import { makeCard } from '../../testing/test-factories';
import { DeckCommanders } from '../deck-commanders';

function card(id: string, legendary = true, board = 'main'): CollectionCardDto {
  return {
    id,
    oracleId: id,
    board,
    quantity: 1,
    quantityFoil: 0,
    cardDetails: makeCard({ name: id, supertypes: legendary ? ['Legendary'] : [] }),
  } as CollectionCardDto;
}

describe('SecondaryCommanderComponent', () => {
  it('offers unique main-deck legendary cards other than the primary commander', () => {
    const component = new SecondaryCommanderComponent();
    component.deck = {
      commanderOracleId: 'first',
      cards: [
        card('first'),
        card('second'),
        card('second'),
        card('ordinary', false),
        card('side', true, 'side'),
      ],
    } as DeckDetailDto;
    expect(component.options.map((option) => option.value)).toEqual(['', 'second']);
    expect(component.card).toBeUndefined();
  });

  it('emits selection, removal and card details through the shared controls', () => {
    const fixture = TestBed.createComponent(SecondaryCommanderComponent);
    const second = card('second');
    fixture.componentRef.setInput('deck', {
      secondaryCommanderOracleId: 'second',
      cards: [second],
    });
    fixture.detectChanges();
    const selected = spyOn(fixture.componentInstance.selected, 'emit');
    const details = spyOn(fixture.componentInstance.details, 'emit');
    const menu = fixture.debugElement.query(By.directive(SelectMenuComponent))
      .componentInstance as SelectMenuComponent;
    menu.valueChange.emit('second');
    expect(selected).toHaveBeenCalledWith('second');
    menu.valueChange.emit('');
    expect(selected).toHaveBeenCalledWith(null);
    fixture.debugElement.query(By.css('button:not(.asm-btn)')).nativeElement.click();
    expect(details).toHaveBeenCalledWith(second);
  });

  it('shares commander membership across views and excludes sideboard matches', () => {
    const first = card('first'),
      second = card('second'),
      other = card('other');
    const deck = {
      commanderOracleId: 'first',
      secondaryCommanderOracleId: 'second',
      cards: [first, second, other, card('first', true, 'side')],
    } as DeckDetailDto;
    expect(DeckCommanders.cards(deck)).toEqual([first, second]);
    expect(DeckCommanders.isSelected(deck, other)).toBeFalse();
  });
});
