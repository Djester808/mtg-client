import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectMenuComponent, SelectMenuOption } from './select-menu.component';

describe('SelectMenuComponent', () => {
  let fixture: ComponentFixture<SelectMenuComponent>;
  let component: SelectMenuComponent;

  const OPTIONS: SelectMenuOption[] = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta', title: 'Beta set' },
    { value: 'c', label: 'Gamma' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SelectMenuComponent] }).compileComponents();
    fixture = TestBed.createComponent(SelectMenuComponent);
    component = fixture.componentInstance;
    component.options = OPTIONS;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  function button(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.asm-btn');
  }

  function menuItems(): HTMLButtonElement[] {
    // The open menu is re-parented to <body> so a transformed ancestor cannot capture
    // its position: fixed, so it is no longer inside the fixture's host element.
    return Array.from(document.querySelectorAll('.app-menu-item'));
  }

  it('shows the placeholder until a value is selected', () => {
    // setInput, not direct assignment: the component is OnPush and a bare property
    // write would not mark it for check.
    fixture.componentRef.setInput('placeholder', 'SET');
    fixture.detectChanges();
    expect(button().textContent).toContain('SET');

    fixture.componentRef.setInput('value', 'b');
    fixture.detectChanges();
    expect(button().textContent).toContain('Beta');
  });

  it('opens the menu with all options on click and emits opened', () => {
    const opened = jasmine.createSpy('opened');
    component.opened.subscribe(opened);

    button().click();
    fixture.detectChanges();

    expect(component.open).toBeTrue();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(menuItems().map((b) => b.textContent!.trim())).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('marks the current value active in the menu', () => {
    component.value = 'c';
    button().click();
    fixture.detectChanges();

    const active = document.querySelectorAll('.app-menu-item.is-active');
    expect(active.length).toBe(1);
    expect(active[0].textContent!.trim()).toBe('Gamma');
  });

  it('picking an option emits valueChange and closes the menu', () => {
    const changed = jasmine.createSpy('valueChange');
    component.valueChange.subscribe(changed);

    button().click();
    fixture.detectChanges();
    menuItems()[1].click();
    fixture.detectChanges();

    expect(changed).toHaveBeenCalledOnceWith('b');
    expect(component.open).toBeFalse();
    expect(menuItems().length).toBe(0);
  });

  it('re-picking the current value closes without emitting', () => {
    const changed = jasmine.createSpy('valueChange');
    component.valueChange.subscribe(changed);
    component.value = 'a';

    button().click();
    fixture.detectChanges();
    menuItems()[0].click();
    fixture.detectChanges();

    expect(changed).not.toHaveBeenCalled();
    expect(component.open).toBeFalse();
  });

  it('does not open when disabled', () => {
    component.disabled = true;
    fixture.detectChanges();

    button().click();
    fixture.detectChanges();

    expect(component.open).toBeFalse();
  });

  it('closes on a click outside the component', () => {
    button().click();
    fixture.detectChanges();
    expect(component.open).toBeTrue();

    document.body.click();
    fixture.detectChanges();

    expect(component.open).toBeFalse();
  });

  it('closes on Escape', () => {
    button().click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(component.open).toBeFalse();
  });

  it('closes when any scroll happens while open', () => {
    button().click();
    fixture.detectChanges();
    expect(component.open).toBeTrue();

    document.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.open).toBeFalse();
  });

  it('shows the empty label when there are no options yet', () => {
    component.options = [];
    component.emptyLabel = 'Loading…';
    fixture.detectChanges();

    button().click();
    fixture.detectChanges();

    expect(document.querySelector('.app-menu-empty')!.textContent).toContain('Loading…');
  });
});
