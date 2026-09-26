import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCatalogIds,
  catalogItemCandidateIds,
  filterCatalogItemsByExcludedIds,
  parseExcludedCatalogIdPayload,
} from './catalog-ids-parse.js';

describe('parseExcludedCatalogIdPayload', () => {
  it('reads a JSON values array', () => {
    assert.deepEqual(
      parseExcludedCatalogIdPayload(
        JSON.stringify({ values: ['tt0111161', 'kha:tt0068646'] })
      ),
      ['tt0111161', 'kha:tt0068646', 'tt0068646']
    );
  });

  it('reads a top-level JSON array', () => {
    assert.deepEqual(parseExcludedCatalogIdPayload('["tt0111161"]'), [
      'tt0111161',
    ]);
  });

  it('reads newline-separated IDs and extracts IMDb ids', () => {
    assert.deepEqual(
      parseExcludedCatalogIdPayload('tt0111161\n# comment\nkha:tt0068646'),
      ['tt0111161', 'kha:tt0068646', 'tt0068646']
    );
  });
});

describe('catalogItemCandidateIds', () => {
  it('collects id, imdb_id, and ids.imdb', () => {
    assert.deepEqual(
      catalogItemCandidateIds({
        id: 'kha:tt0111161',
        imdb_id: 'tt0133093',
        ids: { imdb: 'tt0068646' },
      }).sort(),
      ['kha:tt0111161', 'tt0068646', 'tt0111161', 'tt0133093']
    );
  });
});

describe('filterCatalogItemsByExcludedIds', () => {
  it('returns the same items when the exclusion set is empty', () => {
    const items = [
      { id: 'tt0111161', type: 'movie', name: 'The Shawshank Redemption' },
    ];
    assert.equal(filterCatalogItemsByExcludedIds(items, new Set()), items);
  });

  it('drops items whose id or imdb_id is in the exclusion set', () => {
    const excluded = new Set<string>();
    addCatalogIds(excluded, ['tt0111161', 'tt0068646']);
    const result = filterCatalogItemsByExcludedIds(
      [
        { id: 'tt0111161', type: 'movie', name: 'Keep by id' },
        {
          id: 'kha:other',
          type: 'movie',
          name: 'Drop by imdb',
          imdb_id: 'tt0068646',
        },
        { id: 'tt0133093', type: 'movie', name: 'Keep' },
      ],
      excluded
    );
    assert.deepEqual(
      result.map((item) => item.name),
      ['Keep']
    );
  });

  it('matches IDs case-insensitively', () => {
    const excluded = new Set<string>();
    addCatalogIds(excluded, ['tt0111161']);
    assert.deepEqual(
      filterCatalogItemsByExcludedIds(
        [{ id: 'TT0111161', type: 'movie', name: 'Dropped' }],
        excluded
      ),
      []
    );
  });

  it('drops TMDB-only items whose mapped IMDb id is excluded', () => {
    const excluded = new Set<string>();
    addCatalogIds(excluded, ['tt33764258']);
    const resolveImdb = (
      mediaType: 'movie' | 'series',
      provider: 'tmdb' | 'tvdb',
      id: number
    ) =>
      mediaType === 'movie' && provider === 'tmdb' && id === 1368337
        ? 'tt33764258'
        : undefined;
    const result = filterCatalogItemsByExcludedIds(
      [
        {
          id: 'tmdb:1368337',
          type: 'movie',
          name: 'The Odyssey',
          imdb_id: null,
        },
        {
          id: 'tmdb:1698863',
          type: 'movie',
          name: 'Other Odyssey',
          imdb_id: null,
        },
        { id: 'tt1375666', type: 'movie', name: 'Inception' },
      ],
      excluded,
      resolveImdb
    );
    assert.deepEqual(
      result.map((item) => item.name),
      ['Other Odyssey', 'Inception']
    );
  });

  it('keeps TMDB-only items when the mapper has no IMDb id', () => {
    const excluded = new Set<string>();
    addCatalogIds(excluded, ['tt33764258']);
    const result = filterCatalogItemsByExcludedIds(
      [
        {
          id: 'tmdb:1368337',
          type: 'movie',
          name: 'The Odyssey',
          imdb_id: null,
        },
      ],
      excluded,
      () => undefined
    );
    assert.equal(result.length, 1);
  });
});

describe('catalogItemCandidateIds with mapper', () => {
  it('includes the mapped IMDb id for a prefixed TMDB item', () => {
    const resolveImdb = (
      _mediaType: 'movie' | 'series',
      provider: 'tmdb' | 'tvdb',
      id: number
    ) => (provider === 'tmdb' && id === 1368337 ? 'tt33764258' : undefined);
    assert.deepEqual(
      catalogItemCandidateIds(
        { id: 'tmdb:1368337', type: 'movie', imdb_id: null },
        resolveImdb
      ).sort(),
      ['tmdb:1368337', 'tt33764258']
    );
  });
});
