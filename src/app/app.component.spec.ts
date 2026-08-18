import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AppComponent, HttpClientTestingModule, RouterTestingModule],
      providers: [provideMockStore({ initialState: { auth: { user: null, token: null } } })],
    });
  });

  it('mounts the keyword sheet once, in the shell', () => {
    // It has to live above the router outlet: it listens at the document for clicks on
    // the keyword links written into card text, and card text is rendered by seven
    // different hosts. Mounted inside any one of them, tapping a keyword anywhere else
    // would go back to navigating away and losing the card.
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const sheets = fixture.nativeElement.querySelectorAll('app-keyword-sheet');
    expect(sheets.length).withContext('exactly one keyword sheet in the shell').toBe(1);
  });

  it('keeps the shell chrome it already had', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-navbar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-toast-container')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });
});
