import { APP_INITIALIZER } from '@angular/core';
import { of } from 'rxjs';
import { appConfig, loadKeywordLinks } from './app.config';
import { KeywordLinkService } from './services/keyword-link.service';

describe('appConfig', () => {
  it('loads the keyword link table through the returned factory', () => {
    const keywords = jasmine.createSpyObj<KeywordLinkService>('KeywordLinkService', ['load']);
    keywords.load.and.returnValue(of(true));

    const initializer = loadKeywordLinks(keywords);
    expect(keywords.load).not.toHaveBeenCalled();

    initializer();
    expect(keywords.load).toHaveBeenCalledTimes(1);
  });

  it('registers the keyword loader as an app initializer', () => {
    // Not decoration: `OracleSymbolsPipe` is pure and synchronous, so if the terms are
    // not loaded before the first card renders its rules text stays unlinked until
    // something else happens to change the pipe's input.
    const initializers = appConfig.providers.filter(
      (p: any) => p && p.provide === APP_INITIALIZER,
    ) as any[];

    expect(initializers.some((p) => p.useFactory === loadKeywordLinks)).toBe(true);
    expect(initializers.every((p) => p.multi === true)).toBe(true);
  });
});
