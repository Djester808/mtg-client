import { Actions } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import { Subject, of } from 'rxjs';
import { DeckEffects } from './deck/deck.effects';
import { CollectionEffects } from './collection/collection.effects';
import { DeckActions } from './deck/deck.actions';
import { CollectionActions } from './collection/collection.actions';
import { AuthActions } from './auth/auth.actions';

for (const kind of ['deck', 'collection'] as const) {
  describe(`${kind} request ordering and session isolation`, () => {
    let actions: Subject<Action>;
    let api: any;
    let effects: any;
    let streams: Subject<any>[];
    beforeEach(() => {
      actions = new Subject<Action>();
      streams = [];
      const request = () => {
        const response = new Subject<any>();
        streams.push(response);
        return response;
      };
      api = jasmine.createSpyObj('api', [
        'createDeck',
        'createCollection',
        'updateDeck',
        'updateCollection',
        'addCard',
      ]);
      for (const name of Object.keys(api)) api[name].and.callFake(request);
      const store: any = { select: () => of(null) };
      const toast: any = { error: jasmine.createSpy(), show: jasmine.createSpy() };
      effects =
        kind === 'deck'
          ? new DeckEffects(new Actions(actions), api, toast, store)
          : new CollectionEffects(new Actions(actions), api, toast, store);
    });
    const create = () =>
      kind === 'deck'
        ? DeckActions.createDeck({ name: 'New', coverUri: null, format: null })
        : CollectionActions.createCollection({ request: { name: 'New' } });
    const metadata = (name: string) =>
      kind === 'deck'
        ? DeckActions.updateDeckMeta({
            id: 'a',
            name,
            coverUri: null,
            format: null,
            commanderOracleId: null,
          })
        : CollectionActions.updateCollectionMeta({
            id: 'a',
            name,
            description: null,
            coverUri: null,
          });

    it('preserves both create responses instead of cancelling the first write', () => {
      const results: Action[] = [];
      const subscription = effects[kind === 'deck' ? 'createDeck$' : 'createCollection$'].subscribe(
        (a: Action) => results.push(a),
      );
      actions.next(create());
      actions.next(create());
      expect(streams.length).toBe(1);
      streams[0].next({ id: 'one' });
      streams[0].complete();
      expect(streams.length).toBe(2);
      streams[1].next({ id: 'two' });
      streams[1].complete();
      expect(results.length).toBe(2);
      subscription.unsubscribe();
    });
    it('serializes metadata saves so the latest edit reaches the server last', () => {
      const subscription =
        effects[kind === 'deck' ? 'updateDeckMeta$' : 'updateCollectionMeta$'].subscribe();
      actions.next(metadata('first'));
      actions.next(metadata('second'));
      expect(streams.length).toBe(1);
      streams[0].complete();
      expect(streams.length).toBe(2);
      subscription.unsubscribe();
    });
    it('drops active and queued writes on logout but accepts the next session', () => {
      const results: Action[] = [];
      const subscription = effects[kind === 'deck' ? 'createDeck$' : 'createCollection$'].subscribe(
        (a: Action) => results.push(a),
      );
      actions.next(create());
      actions.next(create());
      actions.next(AuthActions.logout());
      streams[0].next({ id: 'old' });
      streams[0].complete();
      expect(results.length).toBe(0);
      expect(streams.length).toBe(1);
      actions.next(create());
      expect(streams.length).toBe(2);
      streams[1].next({ id: 'new' });
      expect(results.length).toBe(1);
      subscription.unsubscribe();
    });
    it('carries the destination through a delayed card response', () => {
      let result: any;
      const subscription = effects.addCard$.subscribe((a: Action) => (result = a));
      const request = { oracleId: 'oracle', quantity: 1, quantityFoil: 0 };
      actions.next(
        kind === 'deck'
          ? DeckActions.addCard({ deckId: 'a', request })
          : CollectionActions.addCard({ collectionId: 'a', request }),
      );
      streams[0].next({ id: 'card' });
      expect(result[kind === 'deck' ? 'deckId' : 'collectionId']).toBe('a');
      subscription.unsubscribe();
    });
  });
}
