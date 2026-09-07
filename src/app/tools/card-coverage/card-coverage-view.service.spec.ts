import { CardCoverage } from '../../services/card-implementation-api.service';
import { CardCoverageViewService, STATUS_ORDER } from './card-coverage-view.service';

/**
 * The arithmetic behind the dashboard.
 *
 * Two things are worth being sure of and neither is visible in a screenshot: the status row is
 * complete even when the server names only some statuses, and the backlog is ranked by this
 * client rather than taken in the order it arrived — the next vocabulary round is chosen off the
 * top of that list.
 */
describe('CardCoverageViewService', () => {
  const service = new CardCoverageViewService();

  function coverage(patch: Partial<CardCoverage> = {}): CardCoverage {
    return { total: 0, byStatus: {}, primitiveBacklog: [], lastVerification: null, ...patch };
  }

  // ---- the count row ----------------------------------------------------------

  it('gives every status a figure in pipeline order, even the ones the server left out', () => {
    const view = service.view(coverage({ total: 10, byStatus: { Verified: 6, Disputed: 4 } }));

    expect(view.figures.map((f) => f.status)).toEqual([...STATUS_ORDER]);
    expect(view.figures.map((f) => f.count)).toEqual([0, 0, 4, 6, 0]);
    expect(view.total).toBe(10);
  });

  it('sizes each bar by the status share of the ledger', () => {
    const view = service.view(coverage({ total: 8, byStatus: { Verified: 2, Untranslated: 6 } }));
    const share = (status: string) => view.figures.find((f) => f.status === status)!.share;

    expect(share('Untranslated')).toBe(75);
    expect(share('Verified')).toBe(25);
    expect(share('Excluded')).toBe(0);
  });

  it('never draws a bar past its track when the total disagrees with the counts', () => {
    // A total the counts overrun would otherwise produce a 300% width, which reads as a broken
    // screen rather than as two numbers that disagree.
    const view = service.view(coverage({ total: 1, byStatus: { Verified: 3 } }));

    expect(view.figures.every((f) => f.share <= 100)).toBe(true);
    expect(view.total).toBe(1);
  });

  it('links only the disputed figure, because it is the only one with a screen behind it', () => {
    const view = service.view(coverage({ total: 2, byStatus: { Disputed: 2 } }));

    expect(view.figures.filter((f) => f.link).map((f) => f.status)).toEqual(['Disputed']);
    expect(view.figures.find((f) => f.status === 'Disputed')!.link).toBe('/tools/card-disputes');
  });

  // ---- the ranking ------------------------------------------------------------

  it('ranks the backlog by cards blocked rather than trusting the order it arrived in', () => {
    const view = service.view(
      coverage({
        total: 30,
        primitiveBacklog: [
          { reason: 'cannot express: replacement effects', cardsBlocked: 4 },
          { reason: 'cannot express: layered pt-setting', cardsBlocked: 21 },
          { reason: 'cannot express: hidden zones', cardsBlocked: 9 },
        ],
      }),
    );

    expect(view.backlog.map((l) => l.cardsBlocked)).toEqual([21, 9, 4]);
    expect(view.backlog[0].reason).toBe('cannot express: layered pt-setting');
    // The top blocker fills its track; everything else reads against it.
    expect(view.backlog[0].share).toBe(100);
    expect(view.backlog[2].share).toBeCloseTo((4 / 21) * 100, 6);
  });

  it('breaks ties on the reason so a reload does not reshuffle the list', () => {
    const backlog = [
      { reason: 'beta', cardsBlocked: 5 },
      { reason: 'alpha', cardsBlocked: 5 },
    ];
    const first = service.view(coverage({ primitiveBacklog: backlog }));
    const second = service.view(coverage({ primitiveBacklog: [...backlog].reverse() }));

    expect(first.backlog.map((l) => l.reason)).toEqual(['alpha', 'beta']);
    expect(second.backlog.map((l) => l.reason)).toEqual(['alpha', 'beta']);
  });

  // ---- the run ----------------------------------------------------------------

  it('derives failures from the run total and leaves the number it has no field for unanswered', () => {
    const view = service.view(
      coverage({
        total: 5,
        byStatus: { Verified: 5 },
        lastVerification: {
          engineHash: 'abc1234',
          runId: 'run-9',
          passed: 12,
          total: 15,
          at: '2026-09-06T18:00:00Z',
        },
      }),
    );

    expect(view.run).toEqual({
      at: '2026-09-06T18:00:00Z',
      runId: 'run-9',
      engineHash: 'abc1234',
      passed: 12,
      failed: 3,
      total: 15,
      withoutScenarios: null,
    });
  });

  it('has no run summary at all when nothing has been run', () => {
    expect(service.view(coverage({ total: 3, byStatus: { Untranslated: 3 } })).run).toBeNull();
  });

  // ---- empty ------------------------------------------------------------------

  it('calls an empty ledger empty, and a full one with an empty backlog not empty', () => {
    expect(service.view(coverage()).empty).toBe(true);
    expect(service.view(coverage({ total: 3, byStatus: { Untranslated: 3 } })).empty).toBe(false);
  });
});
