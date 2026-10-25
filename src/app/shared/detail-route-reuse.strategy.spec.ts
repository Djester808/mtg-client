import { ActivatedRouteSnapshot, Route } from '@angular/router';
import { DetailRouteReuseStrategy } from './detail-route-reuse.strategy';

describe('DetailRouteReuseStrategy', () => {
  const strategy = new DetailRouteReuseStrategy();
  const snapshot = (routeConfig: Route, id: string) =>
    ({ routeConfig, params: { id } }) as unknown as ActivatedRouteSnapshot;
  for (const path of ['deck/:id', 'collection/:id']) {
    it(`recreates ${path} when the resource changes, but keeps same-resource navigation`, () => {
      const route = { path };
      expect(
        strategy.shouldReuseRoute(snapshot(route, 'next'), snapshot(route, 'old')),
      ).toBeFalse();
      expect(
        strategy.shouldReuseRoute(snapshot(route, 'same'), snapshot(route, 'same')),
      ).toBeTrue();
    });
  }
  it('preserves normal router reuse for every other route', () => {
    const route = { path: 'community/:id' };
    expect(strategy.shouldReuseRoute(snapshot(route, 'next'), snapshot(route, 'old'))).toBeTrue();
    expect(
      strategy.shouldReuseRoute(snapshot(route, 'next'), snapshot({ path: 'different' }, 'old')),
    ).toBeFalse();
  });
});
