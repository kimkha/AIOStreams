import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { createInterface } from 'readline';
import { createGunzip } from 'zlib';
import { createLogger, getDataFolder, makeRequest } from '../utils/index.js';
import { config as appConfig } from '../config/index.js';
import { BaseDataset } from '../builtins/base/dataset.js';
import type { TitleRating } from './rating-filter.js';

const logger = createLogger('imdb-ratings');

function imdbNumber(imdbId: string): number | undefined {
  const match = /^tt(\d+)$/.exec(imdbId);
  return match ? Number(match[1]) : undefined;
}

export class ImdbRatingTable {
  static readonly empty = new ImdbRatingTable(
    new Uint32Array(0),
    new Uint8Array(0),
    new Uint32Array(0)
  );

  private constructor(
    private readonly ids: Uint32Array,
    private readonly tenths: Uint8Array,
    private readonly votes: Uint32Array
  ) {}

  static async fromLines(
    lines: AsyncIterable<string> | Iterable<string>
  ): Promise<ImdbRatingTable> {
    const ids: number[] = [];
    const tenths: number[] = [];
    const votes: number[] = [];
    for await (const line of lines) {
      const [tconst = '', average, count] = line.split('\t');
      const id = imdbNumber(tconst);
      const rating = Math.round(Number(average) * 10);
      const voteCount = Number(count);
      if (
        id === undefined ||
        !(rating >= 0 && rating <= 100) ||
        !Number.isInteger(voteCount)
      ) {
        continue;
      }
      ids.push(id);
      tenths.push(rating);
      votes.push(voteCount);
    }

    // The file sorts tconst as text, so tt10000000 lands before tt9999999.
    const order = Uint32Array.from(ids.keys()).sort((a, b) => ids[a] - ids[b]);
    return new ImdbRatingTable(
      Uint32Array.from(order, (row) => ids[row]),
      Uint8Array.from(order, (row) => tenths[row]),
      Uint32Array.from(order, (row) => votes[row])
    );
  }

  get size(): number {
    return this.ids.length;
  }

  ratingFor(imdbId: string): TitleRating | undefined {
    const id = imdbNumber(imdbId);
    if (id === undefined) return undefined;
    let lo = 0;
    let hi = this.ids.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const value = this.ids[mid];
      if (value === id) {
        return { rating: this.tenths[mid] / 10, votes: this.votes[mid] };
      }
      if (value < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return undefined;
  }
}

export class ImdbRatingDataset extends BaseDataset {
  private static instance: ImdbRatingDataset;
  private table = ImdbRatingTable.empty;
  protected logger = logger;

  private constructor() {
    super({
      dataPath: path.join(
        getDataFolder(),
        'imdb-ratings',
        'title.ratings.tsv.gz'
      ),
      refreshIntervalSeconds: appConfig.metadata.imdbRatings.refreshInterval,
      logger,
      taskId: 'imdb-ratings-refresh',
      taskLabel: 'IMDb ratings refresh',
      taskDescription: 'Re-download the IMDb title ratings dataset.',
    });
  }

  public static getInstance(): ImdbRatingDataset {
    if (!ImdbRatingDataset.instance) {
      ImdbRatingDataset.instance = new ImdbRatingDataset();
    }
    return ImdbRatingDataset.instance;
  }

  protected async reloadDataFromFile(): Promise<void> {
    const gunzip = createGunzip();
    const file = createReadStream(this.DATA_PATH);
    // pipe() does not forward a read error, which would otherwise go unhandled.
    file.on('error', (error) => gunzip.destroy(error));
    this.table = await ImdbRatingTable.fromLines(
      createInterface({ input: file.pipe(gunzip), crlfDelay: Infinity })
    );
    logger.info({ titles: this.table.size }, 'loaded imdb ratings');
  }

  protected async performSync(): Promise<void> {
    const { url } = appConfig.metadata.imdbRatings;
    const response = await makeRequest(url, {
      method: 'GET',
      timeout: 120000,
      headers: { 'User-Agent': appConfig.http.defaultUserAgent },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    const tempPath = `${this.DATA_PATH}.tmp`;
    await fs.mkdir(path.dirname(tempPath), { recursive: true });
    await fs.writeFile(tempPath, Buffer.from(await response.arrayBuffer()));
    await fs.rename(tempPath, this.DATA_PATH);
  }

  public ratingFor(imdbId: string): TitleRating | undefined {
    return this.table.ratingFor(imdbId);
  }
}
