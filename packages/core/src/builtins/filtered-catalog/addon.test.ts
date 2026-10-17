import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FILTERED_CATALOGS,
  FilteredCatalogAccessError,
  createFilteredCatalogConfig,
  getFilteredCatalog,
  getFilteredCatalogManifest,
  getVerifiedFilteredCatalogUuid,
} from './addon.js';

const isAccessError = (error: unknown) =>
  error instanceof FilteredCatalogAccessError &&
  error.code === 'invalid_signature';

describe('getVerifiedFilteredCatalogUuid', () => {
  it('accepts a config this instance signed', () => {
    assert.equal(
      getVerifiedFilteredCatalogUuid(createFilteredCatalogConfig('uuid-a')),
      'uuid-a'
    );
  });

  it("rejects a config carrying another config's signature", () => {
    const forged = {
      uuid: 'uuid-a',
      signature: createFilteredCatalogConfig('uuid-b').signature,
    };
    assert.throws(() => getVerifiedFilteredCatalogUuid(forged), isAccessError);
  });

  it('rejects a config without a signature', () => {
    assert.throws(
      () => getVerifiedFilteredCatalogUuid({ uuid: 'uuid-a' }),
      isAccessError
    );
  });

  it('has no config before the configuration is saved', () => {
    assert.equal(
      getVerifiedFilteredCatalogUuid(createFilteredCatalogConfig(undefined)),
      undefined
    );
  });
});

describe('getFilteredCatalogManifest', () => {
  it('serves Filtered Movies and Filtered Series', () => {
    assert.deepEqual(
      getFilteredCatalogManifest().catalogs.map(({ type, id, name }) => ({
        type,
        id,
        name,
      })),
      [
        { type: 'movie', id: 'filtered.movies', name: 'Filtered Movies' },
        { type: 'series', id: 'filtered.series', name: 'Filtered Series' },
      ]
    );
  });
});

describe('getFilteredCatalog', () => {
  it('is empty for a catalog it does not serve', async () => {
    assert.deepEqual(
      await getFilteredCatalog(
        'uuid-a',
        'series',
        FILTERED_CATALOGS.movie.id,
        0
      ),
      []
    );
  });

  it('puts every title on the first page', async () => {
    assert.deepEqual(
      await getFilteredCatalog(
        'uuid-a',
        'movie',
        FILTERED_CATALOGS.movie.id,
        100
      ),
      []
    );
  });

  it('is empty before the configuration is saved', async () => {
    assert.deepEqual(
      await getFilteredCatalog(
        undefined,
        'movie',
        FILTERED_CATALOGS.movie.id,
        0
      ),
      []
    );
  });
});
