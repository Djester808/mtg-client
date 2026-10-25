import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

/** Detail editors own local selection, drag, modal and request state for one saved resource. */
@Injectable()
export class DetailRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    current: ActivatedRouteSnapshot,
  ): boolean {
    const path = future.routeConfig?.path;
    if (
      (path === 'deck/:id' || path === 'collection/:id') &&
      future.params['id'] !== current.params['id']
    )
      return false;
    return super.shouldReuseRoute(future, current);
  }
}
