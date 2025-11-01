// db.js
import pkg from "pg";

const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;
const useSSL =
  process.env.DATABASE_SSL === "true" ||
  process.env.DATABASE_SSL === "1" ||
  process.env.DATABASE_SSL === "yes";

export const pool = new Pool({
  connectionString,
  ssl: useSSL
    ? {
        rejectUnauthorized: false
      }
    : false
});

export async function initDb() {
  // users
  await pool.query(`
    create table if not exists users (
      id serial primary key,
      address text unique not null,
      username text,
      bio text,
      avatar_url text,
      created_at timestamptz default now()
    );
  `);

  // nonces login
  await pool.query(`
    create table if not exists wallet_nonces (
      address text primary key,
      nonce text not null,
      updated_at timestamptz default now()
    );
  `);

  // posts
  await pool.query(`
    create table if not exists posts (
      id serial primary key,
      user_address text not null,
      media_url text not null,
      media_type text,
      caption text,
      likes_count int default 0,
      comments_count int default 0,
      created_at timestamptz default now()
    );
  `);
}

