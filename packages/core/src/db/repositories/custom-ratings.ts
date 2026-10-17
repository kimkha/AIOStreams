import type {
  CustomRating,
  RatedTitleType,
} from '../../metadata/rating-filter.js';
import { getDb } from '../db.js';
import { sql, join } from '../sql.js';

const LOOKUP_CHUNK_SIZE = 500;
const INSERT_CHUNK_ROWS = 400;

type RatingRow = { imdb_id: string; rating: number | string };
type TitleRow = RatingRow & {
  media_type: RatedTitleType | null;
  name: string | null;
  year: string | null;
};

export interface RatedCatalogTitle {
  imdbId: string;
  name?: string;
  year?: string;
}

function toCustomRating(row: TitleRow): CustomRating {
  return {
    rating: Number(row.rating),
    type: row.media_type ?? undefined,
    name: row.name ?? undefined,
    year: row.year ?? undefined,
  };
}

export class CustomRatingRepository {
  static async replaceAll(
    uuid: string,
    titles: ReadonlyMap<string, CustomRating>
  ): Promise<void> {
    const entries = [...titles];
    await getDb().tx(async (tx) => {
      await tx.exec(sql`DELETE FROM custom_ratings WHERE uuid = ${uuid}`);
      for (let i = 0; i < entries.length; i += INSERT_CHUNK_ROWS) {
        const values = join(
          entries
            .slice(i, i + INSERT_CHUNK_ROWS)
            .map(
              ([imdbId, title]) =>
                sql`(${uuid}, ${imdbId}, ${title.rating}, ${title.type ?? null}, ${title.name ?? null}, ${title.year ?? null})`
            )
        );
        await tx.exec(
          sql`INSERT INTO custom_ratings (uuid, imdb_id, rating, media_type, name, year) VALUES ${values}`
        );
      }
    });
  }

  static async getRatings(
    uuid: string,
    imdbIds: readonly string[]
  ): Promise<Map<string, number>> {
    const unique = [...new Set(imdbIds)];
    const ratings = new Map<string, number>();
    for (let i = 0; i < unique.length; i += LOOKUP_CHUNK_SIZE) {
      const placeholders = join(
        unique.slice(i, i + LOOKUP_CHUNK_SIZE).map((id) => sql`${id}`)
      );
      const rows = await getDb().query<RatingRow>(
        sql`SELECT imdb_id, rating FROM custom_ratings
            WHERE uuid = ${uuid} AND imdb_id IN (${placeholders})`
      );
      for (const row of rows) ratings.set(row.imdb_id, Number(row.rating));
    }
    return ratings;
  }

  static async getAll(uuid: string): Promise<Map<string, CustomRating>> {
    const rows = await getDb().query<TitleRow>(
      sql`SELECT imdb_id, rating, media_type, name, year FROM custom_ratings
          WHERE uuid = ${uuid} ORDER BY imdb_id`
    );
    return new Map(rows.map((row) => [row.imdb_id, toCustomRating(row)]));
  }

  static async getCatalogTitles(
    uuid: string,
    type: RatedTitleType
  ): Promise<RatedCatalogTitle[]> {
    const rows = await getDb().query<TitleRow>(
      sql`SELECT imdb_id, rating, media_type, name, year FROM custom_ratings
          WHERE uuid = ${uuid} AND media_type = ${type}
          ORDER BY rating, name, imdb_id`
    );
    return rows.map((row) => ({
      imdbId: row.imdb_id,
      name: row.name ?? undefined,
      year: row.year ?? undefined,
    }));
  }
}
