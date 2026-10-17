import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ImdbRatingTable } from './imdb-ratings.js';

const tsv = [
  'tconst\taverageRating\tnumVotes',
  'tt0000001\t5.7\t2100',
  'tt10000000\t6.4\t52',
  'tt0111161\t9.3\t3100000',
  'tt9999999\t7.0\t812',
  'tt0000002\tbroken\t9',
];

describe('ImdbRatingTable', () => {
  it('finds a rating and its vote count', async () => {
    const table = await ImdbRatingTable.fromLines(tsv);

    assert.deepEqual(table.ratingFor('tt0111161'), {
      rating: 9.3,
      votes: 3100000,
    });
  });

  it('finds every row whatever order the file lists them in', async () => {
    const table = await ImdbRatingTable.fromLines(tsv);

    assert.deepEqual(
      ['tt0000001', 'tt9999999', 'tt10000000'].map(
        (imdbId) => table.ratingFor(imdbId)?.rating
      ),
      [5.7, 7, 6.4]
    );
  });

  it('skips the header and rows it cannot read', async () => {
    const table = await ImdbRatingTable.fromLines(tsv);

    assert.equal(table.size, 4);
    assert.equal(table.ratingFor('tt0000002'), undefined);
  });

  it('has no rating for an unknown title or a non-IMDb id', async () => {
    const table = await ImdbRatingTable.fromLines(tsv);

    assert.equal(table.ratingFor('tt0000003'), undefined);
    assert.equal(table.ratingFor('tmdb:603'), undefined);
  });
});
