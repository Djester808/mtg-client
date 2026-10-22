import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { Router } from '@angular/router';
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

  it('keeps the app inert until the Compleat intro completes', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.app-shell').hasAttribute('inert')).toBeTrue();
    fixture.nativeElement.querySelector('.intro-skip').click();
    tick(320);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-brand-intro')).toBeNull();
    expect(fixture.nativeElement.querySelector('.app-shell').hasAttribute('inert')).toBeFalse();
    fixture.destroy();
  }));

  it('keeps the shell chrome it already had', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-navbar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-toast-container')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('gives the real game route the full screen without navigation overlapping the table', () => {
    spyOnProperty(TestBed.inject(Router), 'url', 'get').and.returnValue('/game/game-1');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.fullScreen()).toBeTrue();
    expect(fixture.nativeElement.querySelector('app-navbar')).toBeNull();
    expect(fixture.nativeElement.querySelector('.app-content.is-full-screen')).not.toBeNull();
  });
});
