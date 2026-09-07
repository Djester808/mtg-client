import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { throwError } from 'rxjs';
import { AdmissionBadgeComponent } from './admission-badge.component';
import {
  CardImplementation,
  CardImplementationApiService,
  CardImplementationApiStub,
  ImplementationStatus,
  admissionFor,
} from '../../services/card-implementation-api.service';

/**
 * The badge mapping, end to end through the template.
 *
 * The rule is only three lines, and it is still worth driving through the component: the way
 * this goes wrong is not the mapping being wrong, it is the badge never rendering (an OnPush
 * component that fetched and forgot to `markForCheck`), which a test of `admissionFor()` alone
 * would never see.
 */
describe('AdmissionBadgeComponent', () => {
  let fixture: ComponentFixture<AdmissionBadgeComponent>;
  let api: CardImplementationApiStub;

  const impl = (status: ImplementationStatus, extra: Partial<CardImplementation> = {}) => ({
    oracleId: 'o-1',
    status,
    ...extra,
  });

  beforeEach(async () => {
    api = new CardImplementationApiStub();

    await TestBed.configureTestingModule({
      imports: [AdmissionBadgeComponent],
      providers: [{ provide: CardImplementationApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdmissionBadgeComponent);
  });

  /** setInput rather than a plain assignment: the component is OnPush. */
  function badgeFor(status: ImplementationStatus, extra: Partial<CardImplementation> = {}) {
    api.implementations.set('o-1', impl(status, extra));
    fixture.componentRef.setInput('oracleId', 'o-1');
    fixture.detectChanges();
    return fixture.debugElement.query(By.css('.admission-badge'));
  }

  // ---- the rule ---------------------------------------------------------------

  it('enforces a verified card', () => {
    const badge = badgeFor('Verified');
    expect(fixture.componentInstance.admission).toBe('enforced');
    expect(badge.nativeElement.classList).toContain('is-enforced');
  });

  it('puts a translated card on the honour system', () => {
    expect(badgeFor('Translated').nativeElement.classList).toContain('is-honour');
  });

  it('puts a disputed card on the honour system', () => {
    expect(badgeFor('Disputed').nativeElement.classList).toContain('is-honour');
  });

  it('puts an untranslated card on the honour system', () => {
    expect(badgeFor('Untranslated').nativeElement.classList).toContain('is-honour');
  });

  it('refuses an excluded card', () => {
    expect(badgeFor('Excluded').nativeElement.classList).toContain('is-refused');
  });

  it('maps every status to one of the three admissions and nothing else', () => {
    const statuses: ImplementationStatus[] = [
      'Untranslated',
      'Translated',
      'Disputed',
      'Verified',
      'Excluded',
    ];
    expect(statuses.map(admissionFor)).toEqual([
      'honour-system',
      'honour-system',
      'honour-system',
      'enforced',
      'refused',
    ]);
  });

  // ---- what the badge says ----------------------------------------------------

  it('carries the exclusion reason as the refused tooltip', () => {
    const badge = badgeFor('Excluded', { exclusionReason: 'ante (CR 104.3f)' });
    expect(badge.nativeElement.getAttribute('title')).toContain('ante (CR 104.3f)');
  });

  it('still explains a refusal with no reason given', () => {
    const badge = badgeFor('Excluded');
    expect(badge.nativeElement.getAttribute('title')).toContain('Refused');
  });

  it('tells an honour-system card apart from a disputed one in the tooltip', () => {
    const disputed = badgeFor('Disputed').nativeElement.getAttribute('title');
    fixture = TestBed.createComponent(AdmissionBadgeComponent);
    const translated = badgeFor('Translated').nativeElement.getAttribute('title');
    expect(disputed).toContain('disagree');
    expect(translated).not.toContain('disagree');
  });

  it('shows a different glyph per admission, so colour is not the only difference', () => {
    const glyphs = new Set<string>();
    for (const status of ['Verified', 'Translated', 'Excluded'] as ImplementationStatus[]) {
      fixture = TestBed.createComponent(AdmissionBadgeComponent);
      glyphs.add(badgeFor(status).nativeElement.textContent.trim());
    }
    expect(glyphs.size).toBe(3);
  });

  // ---- when there is no answer ------------------------------------------------

  it('renders no badge without an oracle id', () => {
    fixture.componentRef.setInput('oracleId', null);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.admission-badge'))).toBeNull();
  });

  it('renders no badge when the call fails, rather than guessing an admission', () => {
    spyOn(api, 'getImplementation').and.returnValue(throwError(() => new Error('502')));
    fixture.componentRef.setInput('oracleId', 'o-1');
    fixture.detectChanges();
    expect(fixture.componentInstance.admission).toBeNull();
    expect(fixture.debugElement.query(By.css('.admission-badge'))).toBeNull();
  });
});
