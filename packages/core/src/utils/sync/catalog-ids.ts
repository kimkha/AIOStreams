import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { UserData } from '../../db/schemas.js';
import { createLogger } from '../../logging/logger.js';
import { config } from '../../config/index.js';
import { isUnsafeRemoteUrlResolved } from '../url-safety.js';
import {
  addCatalogIds,
  filterCatalogItemsByExcludedIds,
  parseExcludedCatalogIdPayload,
  uniqueCatalogIds,
} from './catalog-ids-parse.js';

const logger = createLogger('core');

export {
  catalogItemCandidateIds,
  parseExcludedCatalogIdPayload,
  uniqueCatalogIds,
} from './catalog-ids-parse.js';

const FETCH_TIMEOUT_MS = 8_000;

let cachedInstanceIds: string[] | undefined;
let cachedInstancePath: string | undefined;
let cachedInstanceMtimeMs: number | undefined;

export async function applyCatalogIdExclusions<T>(
  items: T[],
  userData: UserData
): Promise<T[]> {
  if (items.length === 0) return items;

  const excluded = new Set<string>();
  addCatalogIds(excluded, await loadInstanceExcludedCatalogIds());
  addCatalogIds(excluded, userData.excludedCatalogIds);
  addCatalogIds(
    excluded,
    await fetchExcludedCatalogIdsFromUrls(userData.syncedExcludedCatalogIdUrls)
  );

  return filterCatalogItemsByExcludedIds(items, excluded);
}

function instanceExcludedIdsFile(): string {
  try {
    const fromConfig = config.resources.catalogExclusion.excludedIdsFile;
    if (typeof fromConfig === 'string' && fromConfig.trim()) {
      return fromConfig.trim();
    }
  } catch {
    // settings store may not be initialised in unit tests
  }
  const fromEnv = process.env.CATALOG_EXCLUDED_IDS_FILE;
  return fromEnv?.trim() || '';
}

async function loadInstanceExcludedCatalogIds(): Promise<string[]> {
  const filePath = instanceExcludedIdsFile();
  if (!filePath) return [];

  try {
    const mtimeMs = statSync(filePath).mtimeMs;
    if (
      cachedInstanceIds &&
      cachedInstancePath === filePath &&
      cachedInstanceMtimeMs === mtimeMs
    ) {
      return cachedInstanceIds;
    }
    const ids = parseExcludedCatalogIdPayload(await readFile(filePath, 'utf8'));
    cachedInstanceIds = ids;
    cachedInstancePath = filePath;
    cachedInstanceMtimeMs = mtimeMs;
    return ids;
  } catch (error) {
    logger.debug(
      `catalog ID exclusion: could not read ${filePath}: ${error instanceof Error ? error.message : error}`
    );
    return cachedInstanceIds ?? [];
  }
}

async function fetchExcludedCatalogIdsFromUrls(
  urls: string[] | undefined
): Promise<string[]> {
  if (!urls?.length) return [];

  const batches = await Promise.all(
    urls.map(async (url) => {
      const parsed = parseHttpUrl(url);
      if (!parsed) return [];
      if (await isUnsafeRemoteUrlResolved(parsed.href)) {
        logger.warn(
          `catalog ID exclusion: skipped unsafe URL ${parsed.href}`
        );
        return [];
      }

      try {
        const response = await fetch(parsed.href, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: 'error',
        });
        if (!response.ok) {
          logger.warn(
            `catalog ID exclusion: ${parsed.href} returned ${response.status}`
          );
          return [];
        }
        return parseExcludedCatalogIdPayload(await response.text());
      } catch (error) {
        logger.warn(
          `catalog ID exclusion: failed to fetch ${parsed.href}: ${error instanceof Error ? error.message : error}`
        );
        return [];
      }
    })
  );

  return uniqueCatalogIds(batches.flat());
}

function parseHttpUrl(value: string): URL | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed;
    }
  } catch {
    // invalid URL
  }
  return undefined;
}
