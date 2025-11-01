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
  ssl
});

export async function initDb() {
  await pool.query(`
    create table if not exists users (
      address text primary key,
      username text,
      bio text,
      avatar_url text,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists posts (
      id serial primary key,
      user_address text,
      address text,
      media_url text not null,
      caption text,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`alter table posts add column if not exists user_address text;`);
  await pool.query(`alter table posts add column if not exists address text;`);

  await pool.query(`
    update posts
    set address = user_address
    where address is null and user_address is not null;
  `);
}

export async function query(q, params) {
  return pool.query(q, params);
}

