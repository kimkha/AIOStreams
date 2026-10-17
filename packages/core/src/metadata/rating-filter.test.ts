import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CustomRatingsPayloadError,
  getRatingFilterSettings,
  isTitleAllowedByRating,
  parseCustomRatings,
  parseCustomRatingsJson,
  titleImdbIds,
  toCustomRatingsPayload,
  type RatingFilterSettings,
  type TitleRating,
} from './rating-filter.js';

const ratings = new Map<string, TitleRating>([
  ['tt0000001', { rating: 20 }],
  ['tt0000002', { rating: 21 }],
  ['tt0000003', { rating: 19 }],
]);
const ratingFor = (imdbId: string) => ratings.get(imdbId.toLowerCase());
const upTo20: RatingFilterSettings = {
  source: 'custom',
  range: [0, 20],
  minVotes: 0,
};
const from20: RatingFilterSettings = {
  source: 'custom',
  range: [20, 100],
  minVotes: 0,
};

const isInvalidPayload = (error: unknown) =>
  error instanceof CustomRatingsPayloadError &&
  error.code === 'invalid_payload';

describe('parseCustomRatingsJson', () => {
  it('reads titles keyed by IMDb id', () => {
    assert.deepEqual(
      parseCustomRatingsJson(
        JSON.stringify({
          titles: {
            tt0111161: {
              rating: 12,
              type: 'movie',
              name: 'The Shawshank Redemption',
              year: '1994',
            },
            TT0133093: { rating: 45 },
          },
        })
      ),
      new Map([
        [
          'tt0111161',
          {
            rating: 12,
            type: 'movie',
            name: 'The Shawshank Redemption',
            year: '1994',
          },
        ],
        ['tt0133093', { rating: 45 }],
      ])
    );
  });

  it('accepts a fractional rating', () => {
    assert.deepEqual(
      parseCustomRatingsJson(
        '{ "titles": { "tt0111161": { "rating": 8.7 } } }'
      ),
      new Map([['tt0111161', { rating: 8.7 }]])
    );
  });

  it('accepts an empty list, which clears the ratings', () => {
    assert.deepEqual(parseCustomRatingsJson('{ "titles": {} }'), new Map());
  });

  it('rejects a body that is not JSON', () => {
    assert.throws(
      () => parseCustomRatingsJson('tt0111161\t12'),
      isInvalidPayload
    );
  });

  for (const [name, body] of [
    ['a bare array', '["tt0111161"]'],
    ['a map of bare numbers', '{ "scores": { "tt0111161": 12 } }'],
    ['a title without a rating', '{ "titles": { "tt0111161": {} } }'],
    [
      'a title rated with score',
      '{ "titles": { "tt0111161": { "score": 12 } } }',
    ],
    [
      'a rating that is not a number',
      '{ "titles": { "tt0111161": { "rating": "12" } } }',
    ],
    ['a rating above 100', '{ "titles": { "tt0111161": { "rating": 101 } } }'],
    ['a negative rating', '{ "titles": { "tt0111161": { "rating": -1 } } }'],
    [
      'a type other than movie or series',
      '{ "titles": { "tt0111161": { "rating": 12, "type": "anime" } } }',
    ],
    [
      'a key that is not an IMDb id',
      '{ "titles": { "tmdb:603": { "rating": 12 } } }',
    ],
  ]) {
    it(`rejects ${name}`, () => {
      assert.throws(() => parseCustomRatingsJson(body), isInvalidPayload);
    });
  }
});

describe('toCustomRatingsPayload', () => {
  it('produces a payload the upload accepts unchanged', () => {
    const titles = new Map([
      ['tt0000001', { rating: 20, type: 'series' as const, name: 'Show' }],
      ['tt0000002', { rating: 21.5 }],
    ]);
    const payload = toCustomRatingsPayload(titles);

    assert.deepEqual(payload, {
      titles: {
        tt0000001: { rating: 20, type: 'series', name: 'Show' },
        tt0000002: { rating: 21.5 },
      },
    });
    assert.deepEqual(parseCustomRatings(payload), titles);
  });
});

describe('getRatingFilterSettings', () => {
  it('is off unless the filter is enabled', () => {
    assert.equal(getRatingFilterSettings({}), undefined);
    assert.equal(
      getRatingFilterSettings({
        ratingFilter: { enabled: false, range: [0, 20] },
      }),
      undefined
    );
  });

  it('keeps every custom rating until a range is set', () => {
    assert.deepEqual(
      getRatingFilterSettings({ ratingFilter: { enabled: true } }),
      { source: 'custom', range: [0, 100], minVotes: 0 }
    );
  });

  it('spans the whole IMDb scale until a range is set', () => {
    assert.deepEqual(
      getRatingFilterSettings({
        ratingFilter: { enabled: true, source: 'imdb' },
      }),
      { source: 'imdb', range: [0, 10], minVotes: 0 }
    );
  });

  it('uses the configured source, range and minimum votes', () => {
    assert.deepEqual(
      getRatingFilterSettings({
        ratingFilter: {
          enabled: true,
          source: 'imdb',
          range: [6.5, 10],
          minVotes: 1000,
        },
      }),
      { source: 'imdb', range: [6.5, 10], minVotes: 1000 }
    );
  });
});

describe('titleImdbIds', () => {
  it('returns each IMDb id once, lower-cased', () => {
    assert.deepEqual(titleImdbIds({ id: 'TT0000002', imdb_id: 'tt0000003' }), [
      'tt0000002',
      'tt0000003',
    ]);
  });
});

describe('isTitleAllowedByRating', () => {
  it('keeps titles rated inside the range, bounds included', () => {
    assert.equal(
      isTitleAllowedByRating({ id: 'tt0000003' }, ratingFor, upTo20),
      true
    );
    assert.equal(
      isTitleAllowedByRating({ id: 'tt0000001' }, ratingFor, upTo20),
      true
    );
    assert.equal(
      isTitleAllowedByRating({ id: 'tt0000001' }, ratingFor, from20),
      true
    );
  });

  it('hides titles rated outside the range', () => {
    assert.equal(
      isTitleAllowedByRating({ id: 'tt0000002' }, ratingFor, upTo20),
      false
    );
    assert.equal(
      isTitleAllowedByRating({ id: 'tt0000003' }, ratingFor, from20),
      false
    );
  });

  it('keeps titles without a rating', () => {
    assert.equal(
      isTitleAllowedByRating({ id: 'tt9999999' }, ratingFor, upTo20),
      true
    );
    assert.equal(
      isTitleAllowedByRating({ id: 'kitsu:1' }, ratingFor, upTo20),
      true
    );
  });

  describe('with a minimum vote count', () => {
    const imdbRatings = new Map<string, TitleRating>([
      ['tt0000001', { rating: 8.1, votes: 50 }],
      ['tt0000002', { rating: 8.1, votes: 5000 }],
    ]);
    const imdbFor = (imdbId: string) => imdbRatings.get(imdbId);
    const goodAndKnown: RatingFilterSettings = {
      source: 'imdb',
      range: [7, 10],
      minVotes: 1000,
    };

    it('hides a title rated by fewer voters', () => {
      assert.equal(
        isTitleAllowedByRating({ id: 'tt0000001' }, imdbFor, goodAndKnown),
        false
      );
    });

    it('keeps a title with enough votes inside the range', () => {
      assert.equal(
        isTitleAllowedByRating({ id: 'tt0000002' }, imdbFor, goodAndKnown),
        true
      );
    });

    it('ignores the minimum for ratings without a vote count', () => {
      assert.equal(
        isTitleAllowedByRating({ id: 'tt0000003' }, ratingFor, {
          ...upTo20,
          minVotes: 1000,
        }),
        true
      );
    });
  });

  it('rates a series episode by its show IMDb id', () => {
    assert.equal(
      isTitleAllowedByRating(
        { id: 'tt0000002:1:2', type: 'series' },
        ratingFor,
        upTo20
      ),
      false
    );
  });

  it('rates the imdb_id an anime entry maps to', () => {
    assert.equal(
      isTitleAllowedByRating(
        { id: 'kitsu:1', type: 'series', imdb_id: 'tt0000002' },
        ratingFor,
        upTo20
      ),
      false
    );
  });

  it('resolves tmdb ids to IMDb before rating', () => {
    const resolveImdb = (
      mediaType: 'movie' | 'series',
      provider: 'tmdb' | 'tvdb',
      id: number
    ) =>
      mediaType === 'movie' && provider === 'tmdb' && id === 603
        ? 'tt0000002'
        : undefined;
    const title = { id: 'tmdb:603', type: 'movie' };

    assert.equal(
      isTitleAllowedByRating(title, ratingFor, upTo20, resolveImdb),
      false
    );
    assert.equal(isTitleAllowedByRating(title, ratingFor, upTo20), true);
  });

  const knownSourceIds = new Map([
    ['movie:tmdb:603', 'tt0000002'],
    ['series:tmdb:1399', 'tt0000002'],
    ['series:tvdb:81189', 'tt0000002'],
  ]);
  const resolveKnownIds = (
    mediaType: 'movie' | 'series',
    provider: 'tmdb' | 'tvdb',
    id: number
  ) => knownSourceIds.get(`${mediaType}:${provider}:${id}`);

  for (const [name, title] of [
    ['an IMDb id inside another id', { id: 'kha:tt0000002' }],
    ['an upper-case IMDb id', { id: 'TT0000002' }],
    ['ids.imdb', { id: 'kitsu:1', ids: { imdb: 'tt0000002' } }],
    ['ids.tmdb', { id: 'kitsu:1', type: 'movie', ids: { tmdb: 603 } }],
    ['ids.tmdb_id', { id: 'kitsu:1', type: 'movie', ids: { tmdb_id: '603' } }],
    ['a tvdb id', { id: 'tvdb:81189', type: 'series' }],
    ['a thetvdb id', { id: 'thetvdb-81189', type: 'series' }],
    ['a tmdb id typed in the id', { id: 'tmdb:tv:1399', type: 'movie' }],
    ['a tmdb id on an untyped title', { id: 'tmdb:1399' }],
  ] as const) {
    it(`rates ${name}`, () => {
      assert.equal(
        isTitleAllowedByRating(title, ratingFor, upTo20, resolveKnownIds),
        false
      );
    });
  }

  for (const [name, title] of [
    ['a tmdb id the mappings do not know', { id: 'tmdb:604', type: 'movie' }],
    ['a tmdb id of the other media type', { id: 'tmdb:603', type: 'series' }],
  ] as const) {
    it(`keeps ${name}`, () => {
      assert.equal(
        isTitleAllowedByRating(title, ratingFor, upTo20, resolveKnownIds),
        true
      );
    });
  }
});
