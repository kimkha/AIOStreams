const IMDB_ID = /tt\d{7,}/i;

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

export function catalogItemCandidateIds(item: unknown): string[] {
  const rec = catalogItemRecord(item);
  if (!rec) return [];
  const nestedIds = catalogItemRecord(rec.ids);
  return uniqueCatalogIds([rec.id, rec.imdb_id, nestedIds?.imdb]);
}

export function filterCatalogItemsByExcludedIds<T>(
  items: T[],
  excluded: ReadonlySet<string>
): T[] {
  if (items.length === 0 || excluded.size === 0) return items;
  return items.filter((item) => {
    for (const candidate of catalogItemCandidateIds(item)) {
      if (excluded.has(candidate)) return false;
    }
    return true;
  });
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
