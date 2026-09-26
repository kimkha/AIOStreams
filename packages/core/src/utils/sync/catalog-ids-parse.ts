const IMDB_ID = /tt\d{7,}/i;
const SOURCE_ID =
  /^(?:the)?(tmdb|tvdb)(?:id)?[:-](?:(movie|series|tv|show)[:-])?(\d+)/i;

export type CatalogMediaType = 'movie' | 'series';
export type CatalogIdProvider = 'tmdb' | 'tvdb';

export type CatalogImdbResolver = (
  mediaType: CatalogMediaType,
  provider: CatalogIdProvider,
  id: number
) => string | undefined;

export function parseExcludedCatalogIdPayload(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return uniqueCatalogIds(parsed);
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { values?: unknown }).values)
    ) {
      return uniqueCatalogIds((parsed as { values: unknown[] }).values);
    }
  } catch {
    // fall through to line-oriented parsing
  }

  return uniqueCatalogIds(
    trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
  );
}

function catalogItemRecord(item: unknown): Record<string, unknown> | undefined {
  if (!item || typeof item !== 'object') return undefined;
  return item as Record<string, unknown>;
}

export function catalogItemCandidateIds(
  item: unknown,
  resolveImdb?: CatalogImdbResolver
): string[] {
  const rec = catalogItemRecord(item);
  if (!rec) return [];
  const nestedIds = catalogItemRecord(rec.ids);
  const ids = new Set<string>();
  addCatalogIds(ids, [rec.id, rec.imdb_id, nestedIds?.imdb]);
  if (resolveImdb) {
    for (const source of catalogItemSourceIds(item)) {
      for (const mediaType of source.mediaTypes) {
        addCatalogIds(ids, [
          resolveImdb(mediaType, source.provider, source.id),
        ]);
      }
    }
  }
  return [...ids];
}

export function catalogItemSourceIds(item: unknown): Array<{
  provider: CatalogIdProvider;
  id: number;
  mediaTypes: CatalogMediaType[];
}> {
  const rec = catalogItemRecord(item);
  if (!rec) return [];
  const nested = catalogItemRecord(rec.ids);
  const fallbackTypes = mediaTypesFor(rec.type);
  const found: Array<{
    provider: CatalogIdProvider;
    id: number;
    mediaTypes: CatalogMediaType[];
  }> = [];
  const seen = new Set<string>();

  const add = (
    parsed:
      | {
          provider: CatalogIdProvider;
          id: number;
          mediaTypes?: CatalogMediaType[];
        }
      | undefined
  ) => {
    if (!parsed) return;
    const key = `${parsed.provider}:${parsed.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({
      provider: parsed.provider,
      id: parsed.id,
      mediaTypes: parsed.mediaTypes ?? fallbackTypes,
    });
  };

  add(parsePrefixedSourceId(rec.id));
  if (nested) {
    add(parsePrefixedSourceId(nested.tmdb));
    add(parsePrefixedSourceId(nested.tmdb_id));
    add(parsePrefixedSourceId(nested.tvdb));
    add(parsePrefixedSourceId(nested.tvdb_id));
    const tmdb = parseNumericId(nested.tmdb) ?? parseNumericId(nested.tmdb_id);
    if (tmdb) add({ provider: 'tmdb', id: tmdb });
    const tvdb = parseNumericId(nested.tvdb) ?? parseNumericId(nested.tvdb_id);
    if (tvdb) add({ provider: 'tvdb', id: tvdb });
  }
  return found;
}

export function filterCatalogItemsByExcludedIds<T>(
  items: T[],
  excluded: ReadonlySet<string>,
  resolveImdb?: CatalogImdbResolver
): T[] {
  if (items.length === 0 || excluded.size === 0) return items;
  return items.filter((item) => {
    for (const candidate of catalogItemCandidateIds(item, resolveImdb)) {
      if (excluded.has(candidate)) return false;
    }
    return true;
  });
}

function mediaTypesFor(type: unknown): CatalogMediaType[] {
  const value = String(type ?? '').toLowerCase();
  if (
    value === 'movie' ||
    value === 'movies' ||
    value === 'film' ||
    value === 'films'
  ) {
    return ['movie'];
  }
  if (
    value === 'series' ||
    value === 'tv' ||
    value === 'show' ||
    value === 'shows'
  ) {
    return ['series'];
  }
  return ['movie', 'series'];
}

function parsePrefixedSourceId(raw: unknown):
  | {
      provider: CatalogIdProvider;
      id: number;
      mediaTypes?: CatalogMediaType[];
    }
  | undefined {
  if (raw == null) return undefined;
  const match = SOURCE_ID.exec(String(raw).trim());
  if (!match) return undefined;
  const id = Number(match[3]);
  if (!Number.isInteger(id) || id <= 0) return undefined;
  const provider: CatalogIdProvider =
    match[1].toLowerCase() === 'tvdb' ? 'tvdb' : 'tmdb';
  return {
    provider,
    id,
    mediaTypes: match[2] ? mediaTypesFor(match[2]) : undefined,
  };
}

function parseNumericId(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const id = Number(raw.trim());
    if (Number.isInteger(id) && id > 0) return id;
  }
  return undefined;
}

export function uniqueCatalogIds(values: readonly unknown[]): string[] {
  const ids = new Set<string>();
  addCatalogIds(ids, values);
  return [...ids];
}

export function addCatalogIds(
  target: Set<string>,
  values: readonly unknown[] | undefined
): void {
  if (!values) return;
  for (const value of values) {
    if (value == null) continue;
    const raw = String(value).trim();
    if (!raw) continue;
    target.add(raw);
    const lower = raw.toLowerCase();
    if (lower !== raw) target.add(lower);
    const imdb = raw.match(IMDB_ID);
    if (imdb) target.add(imdb[0].toLowerCase());
  }
}
