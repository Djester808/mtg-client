import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MatchApiService } from './match-api.service';

describe('MatchApiService', () => {
  let sut: MatchApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    sut = TestBed.inject(MatchApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts a finished game with its seats', () => {
    const request = {
      startingLife: 40,
      startedAt: '2026-08-22T10:00:00.000Z',
      seats: [
        {
          seat: 0,
          displayName: 'Nissa',
          token: 'jwt',
          won: true,
          lossReason: 'Unspecified' as const,
          finalLife: 12,
        },
        {
          seat: 1,
          displayName: 'A guest',
          won: false,
          lossReason: 'LifeTotal' as const,
          finalLife: -2,
        },
      ],
    };

    sut.record(request).subscribe();

    const req = http.expectOne('/api/matches');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ matchId: 'm1', attributedUsernames: ['Nissa'] });
  });

  it('reads the caller’s own record', () => {
    let record: number | undefined;
    sut.myRecord().subscribe((r) => (record = r.wins));

    http.expectOne('/api/matches/me').flush({
      played: 3,
      wins: 2,
      losses: 1,
      winRate: 0.667,
      recent: [],
    });

    expect(record).toBe(2);
  });
});
