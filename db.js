// db.js
import pkg from "pg";
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;
const ssl =
  process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: false }
    : false;

export const pool = new Pool({
  connectionString,
  ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      address text PRIMARY KEY,
      username text,
      bio text,
      avatar_url text,
      created_at timestamptz DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id serial PRIMARY KEY,
      user_address text NOT NULL,
      media_url text NOT NULL,
      caption text,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT fk_user FOREIGN KEY (user_address)
        REFERENCES users(address) ON DELETE CASCADE
    );
  `);
}

export async function query(text, params) {
  return pool.query(text, params);
}

