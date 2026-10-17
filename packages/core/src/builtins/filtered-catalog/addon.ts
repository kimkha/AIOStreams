import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config as appConfig } from '../../config/index.js';
import type { Manifest, MetaPreview } from '../../db/schemas.js';
import { CustomRatingRepository } from '../../db/repositories/custom-ratings.js';
import {
  RATED_TITLE_TYPES,
  type RatedTitleType,
} from '../../metadata/rating-filter.js';
import { CATALOG_RESOURCE } from '../../utils/constants.js';

export const FILTERED_CATALOGS: Record<
  RatedTitleType,
  { id: string; name: string }
> = {
  movie: { id: 'filtered.movies', name: 'Filtered Movies' },
  series: { id: 'filtered.series', name: 'Filtered Series' },
};

const METAHUB_POSTER_URL = 'https://images.metahub.space/poster/small';

const FilteredCatalogConfigSchema = z.object({
  uuid: z.string().min(1).optional(),
  signature: z.string().optional(),
});

export type FilteredCatalogConfig = z.infer<typeof FilteredCatalogConfigSchema>;

export class FilteredCatalogAccessError extends Error {
  readonly code = 'invalid_signature';

  constructor() {
    super('This filtered catalog config was not signed by this instance');
    this.name = 'FilteredCatalogAccessError';
  }
}

function signUuid(uuid: string): string {
  return createHmac('sha256', appConfig.bootstrap.internalSecret)
    .update(uuid)
    .digest('base64url');
}

export function createFilteredCatalogConfig(
  uuid: string | undefined
): FilteredCatalogConfig {
  return uuid ? { uuid, signature: signUuid(uuid) } : {};
}

export function getVerifiedFilteredCatalogUuid(
  config: unknown
): string | undefined {
  const parsed = FilteredCatalogConfigSchema.safeParse(config);
  if (!parsed.success) throw new FilteredCatalogAccessError();

  const { uuid, signature = '' } = parsed.data;
  if (!uuid) return undefined;

  const expected = Buffer.from(signUuid(uuid));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new FilteredCatalogAccessError();
  }
  return uuid;
}

export function getFilteredCatalogManifest(): Manifest {
  return {
    id: 'aiostreams.filtered-catalog',
    name: 'Filtered Catalog',
    description:
      'Movies and series from the custom ratings of this configuration, narrowed by its rating filter.',
    version: '1.0.0',
    types: [...RATED_TITLE_TYPES],
    resources: [CATALOG_RESOURCE],
    catalogs: RATED_TITLE_TYPES.map((type) => ({
      type,
      ...FILTERED_CATALOGS[type],
    })),
  };
}

export async function getFilteredCatalog(
  uuid: string | undefined,
  type: string,
  id: string,
  skip: number
): Promise<MetaPreview[]> {
  const mediaType = RATED_TITLE_TYPES.find(
    (candidate) => candidate === type && FILTERED_CATALOGS[candidate].id === id
  );
  if (!uuid || !mediaType || skip > 0) return [];

  const titles = await CustomRatingRepository.getCatalogTitles(uuid, mediaType);
  return titles.map(({ imdbId, name, year }) => ({
    id: imdbId,
    type: mediaType,
    name,
    poster: `${METAHUB_POSTER_URL}/${imdbId}/img`,
    releaseInfo: year,
  }));
}
