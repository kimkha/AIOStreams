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
});
