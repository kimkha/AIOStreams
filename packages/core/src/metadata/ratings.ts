import { config as appConfig } from '../config/index.js';
import type { UserData } from '../db/schemas.js';
import { CustomRatingRepository } from '../db/repositories/custom-ratings.js';
import { IdMappingDataset } from './id-mappings.js';
import { ImdbRatingDataset } from './imdb-ratings.js';
import {
  getRatingFilterSettings,
  isTitleAllowedByRating,
  titleImdbIds,
  type ImdbIdResolver,
  type RatingFilterSettings,
  type RatingLookup,
} from './rating-filter.js';

const resolveImdb: ImdbIdResolver = (mediaType, provider, id) =>
  appConfig.metadata.idMappings.enabled
    ? IdMappingDataset.getInstance().imdbIdFor(mediaType, provider, id)
    : undefined;

async function getRatingLookup(
  uuid: string | undefined,
  source: RatingFilterSettings['source'],
  imdbIds: string[]
): Promise<RatingLookup | undefined> {
  switch (source) {
    case 'custom': {
      if (!uuid) return undefined;
      const ratings = await CustomRatingRepository.getRatings(uuid, imdbIds);
      if (ratings.size === 0) return undefined;
      return (imdbId) => {
        const rating = ratings.get(imdbId);
        return rating === undefined ? undefined : { rating };
      };
    }
    case 'imdb':
      if (!appConfig.metadata.imdbRatings.enabled) return undefined;
      return (imdbId) => ImdbRatingDataset.getInstance().ratingFor(imdbId);
  }
}

async function filterByRating<T>(
  uuid: string | undefined,
  titles: T[],
  settings: RatingFilterSettings
): Promise<T[]> {
  const ratingFor = await getRatingLookup(
    uuid,
    settings.source,
    titles.flatMap((title) => titleImdbIds(title, resolveImdb))
  );
  if (!ratingFor) return titles;

  return titles.filter((title) =>
    isTitleAllowedByRating(title, ratingFor, settings, resolveImdb)
  );
}

export async function applyRatingCatalogFilter<T>(
  items: T[],
  userData: UserData
): Promise<T[]> {
  const settings = getRatingFilterSettings(userData);
  if (!settings) return items;
  return filterByRating(userData.uuid, items, settings);
}

export async function isTitleBlockedByRatingFilter(
  userData: UserData,
  title: { id: string; type: string; imdbId?: string | null }
): Promise<boolean> {
  const settings = getRatingFilterSettings(userData);
  if (!settings) return false;

  const allowed = await filterByRating(
    userData.uuid,
    [{ id: title.id, type: title.type, imdb_id: title.imdbId }],
    settings
  );
  return allowed.length === 0;
}
