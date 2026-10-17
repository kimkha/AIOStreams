import type { Migration } from './types.js';

export const customRatings: Migration = {
  id: 1002,
  name: 'custom_ratings',
  up: {
    sqlite: `
      CREATE TABLE IF NOT EXISTS custom_ratings (
        uuid       TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
        imdb_id    TEXT NOT NULL,
        rating     REAL NOT NULL,
        media_type TEXT,
        name       TEXT,
        year       TEXT,
        PRIMARY KEY (uuid, imdb_id)
      );
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS custom_ratings (
        uuid       TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
        imdb_id    TEXT NOT NULL,
        rating     DOUBLE PRECISION NOT NULL,
        media_type TEXT,
        name       TEXT,
        year       TEXT,
        PRIMARY KEY (uuid, imdb_id)
      );
    `,
  },
};
