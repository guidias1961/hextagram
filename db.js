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
  connectionTimeoutMillis: 20000
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      address TEXT PRIMARY KEY,
      username TEXT,
      avatar_url TEXT,
      bio TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_address TEXT REFERENCES users(address) ON DELETE CASCADE,
      media_url TEXT NOT NULL,
      caption TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

