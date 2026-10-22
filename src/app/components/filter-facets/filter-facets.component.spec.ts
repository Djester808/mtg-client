import { TestBed } from '@angular/core/testing';
import { FilterFacetsComponent } from './filter-facets.component';
describe('FilterFacetsComponent disclosure', () => {
  it('starts compact and lets users reveal filters without clearing selections', () => {
    const fixture = TestBed.createComponent(FilterFacetsComponent);
    const component = fixture.componentInstance;
    component.activeColors = new Set(['W']);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.fx-toggle') as HTMLButtonElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.classList.contains('has-active')).toBeTrue();
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(component.activeColors.has('W')).toBeTrue();
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
