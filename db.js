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
      address text,
      media_url text not null,
      caption text,
      created_at timestamptz default now(),
      foreign key (address) references users(address) on delete set null
    );
  `);
}

export async function query(q, params) {
  const res = await pool.query(q, params);
  return res;
}

