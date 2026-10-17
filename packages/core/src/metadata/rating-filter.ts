import { z } from 'zod';
import type { UserData } from '../db/schemas.js';
import { RATING_SCALES, type RatingSource } from '../utils/constants.js';

export interface TitleRating {
  rating: number;
  votes?: number;
}

export type RatingLookup = (imdbId: string) => TitleRating | undefined;

export interface RatingFilterSettings {
  source: RatingSource;
  range: readonly [number, number];
  minVotes: number;
}

export class CustomRatingsPayloadError extends Error {
  readonly code = 'invalid_payload';

  constructor(message: string) {
    super(message);
    this.name = 'CustomRatingsPayloadError';
  }
}

export const RATED_TITLE_TYPES = ['movie', 'series'] as const;
export type RatedTitleType = (typeof RATED_TITLE_TYPES)[number];

type SourceProvider = 'tmdb' | 'tvdb';

export type ImdbIdResolver = (
  mediaType: RatedTitleType,
  provider: SourceProvider,
  id: number
) => string | undefined;

const ImdbIdSchema = z.string().regex(/^tt\d+$/i);

const CustomRatingSchema = z.object({
  rating: z.number().min(0).max(RATING_SCALES.custom.max),
  type: z.enum(RATED_TITLE_TYPES).optional(),
  name: z.string().min(1).max(500).optional(),
  year: z.string().min(1).max(32).optional(),
});

export type CustomRating = z.infer<typeof CustomRatingSchema>;

const CustomRatingsPayloadSchema = z.object({
  titles: z.record(ImdbIdSchema, CustomRatingSchema),
});

export function parseCustomRatings(json: unknown): Map<string, CustomRating> {
  const payload = CustomRatingsPayloadSchema.safeParse(json);
  if (!payload.success) {
    throw new CustomRatingsPayloadError(
      `custom ratings must look like { "titles": { "tt0111161": { "rating": 12, "type": "movie", "name": "The Shawshank Redemption", "year": "1994" } } } with ratings from 0 to 100: ${z.prettifyError(payload.error)}`
    );
  }

  return new Map(
    Object.entries(payload.data.titles).map(([imdbId, title]) => [
      imdbId.toLowerCase(),
      title,
    ])
  );
}

export function parseCustomRatingsJson(
  text: string
): Map<string, CustomRating> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new CustomRatingsPayloadError(
      `custom ratings are not JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return parseCustomRatings(json);
}

export function toCustomRatingsPayload(
  titles: ReadonlyMap<string, CustomRating>
) {
  return { titles: Object.fromEntries(titles) };
}

export function getRatingFilterSettings(
  userData: Pick<UserData, 'ratingFilter'>
): RatingFilterSettings | undefined {
  const filter = userData.ratingFilter;
  if (!filter?.enabled) return undefined;
  const source = filter.source ?? 'custom';
  return {
    source,
    range: filter.range ?? [0, RATING_SCALES[source].max],
    minVotes: filter.minVotes ?? 0,
  };
}

function isRatingAllowed(
  { rating, votes }: TitleRating,
  { range: [min, max], minVotes }: RatingFilterSettings
): boolean {
  if (votes !== undefined && votes < minVotes) return false;
  return rating >= min && rating <= max;
}

const EMBEDDED_IMDB_ID = /tt\d{7,}/;
const SOURCE_ID =
  /^(?:the)?(tmdb|tvdb)(?:id)?[:-](?:(movie|series|tv|show)[:-])?(\d+)/;
const MOVIE_TYPES = new Set(['movie', 'movies', 'film', 'films']);
const SERIES_TYPES = new Set(['series', 'tv', 'show', 'shows']);

interface SourceId {
  provider: SourceProvider;
  id: number;
  mediaTypes: readonly RatedTitleType[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as Record<string, unknown>;
}

function mediaTypesFor(type: unknown): readonly RatedTitleType[] {
  const value = String(type ?? '').toLowerCase();
  if (MOVIE_TYPES.has(value)) return ['movie'];
  if (SERIES_TYPES.has(value)) return ['series'];
  return RATED_TITLE_TYPES;
}

function positiveInt(value: unknown): number | undefined {
  const id =
    typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value)
      : value;
  return typeof id === 'number' && Number.isInteger(id) && id > 0
    ? id
    : undefined;
}

function imdbIdsIn(value: unknown): string[] {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  const ids = /^tt\d+$/.test(raw) ? [raw] : [];
  const embedded = EMBEDDED_IMDB_ID.exec(raw)?.[0];
  return embedded ? [...ids, embedded] : ids;
}

function sourceIds(title: Record<string, unknown>): SourceId[] {
  const ids = asRecord(title.ids);
  const fallback = mediaTypesFor(title.type);
  const found = new Map<string, SourceId>();
  const add = (
    provider: SourceProvider,
    id: number | undefined,
    mediaTypes = fallback
  ) => {
    const key = `${provider}:${id}`;
    if (id && !found.has(key)) found.set(key, { provider, id, mediaTypes });
  };

  for (const value of [
    title.id,
    ids?.tmdb,
    ids?.tmdb_id,
    ids?.tvdb,
    ids?.tvdb_id,
  ]) {
    const match = SOURCE_ID.exec(
      String(value ?? '')
        .trim()
        .toLowerCase()
    );
    if (!match) continue;
    add(
      match[1] === 'tvdb' ? 'tvdb' : 'tmdb',
      positiveInt(match[3]),
      match[2] ? mediaTypesFor(match[2]) : fallback
    );
  }
  add('tmdb', positiveInt(ids?.tmdb) ?? positiveInt(ids?.tmdb_id));
  add('tvdb', positiveInt(ids?.tvdb) ?? positiveInt(ids?.tvdb_id));
  return [...found.values()];
}

export function titleImdbIds(
  title: unknown,
  resolveImdb?: ImdbIdResolver
): string[] {
  const rec = asRecord(title);
  if (!rec) return [];
  const direct = [rec.id, rec.imdb_id, asRecord(rec.ids)?.imdb].flatMap(
    imdbIdsIn
  );
  const resolved = resolveImdb
    ? sourceIds(rec).flatMap(({ provider, id, mediaTypes }) =>
        mediaTypes.flatMap((mediaType) =>
          imdbIdsIn(resolveImdb(mediaType, provider, id))
        )
      )
    : [];
  return [...new Set([...direct, ...resolved])];
}

export function isTitleAllowedByRating(
  title: unknown,
  ratingFor: RatingLookup,
  settings: RatingFilterSettings,
  resolveImdb?: ImdbIdResolver
): boolean {
  return titleImdbIds(title, resolveImdb).every((imdbId) => {
    const rating = ratingFor(imdbId);
    return rating === undefined || isRatingAllowed(rating, settings);
  });
}
