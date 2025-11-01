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
  // users
  await pool.query(`
    create table if not exists users (
      address text primary key,
      username text,
      bio text,
      avatar_url text,
      created_at timestamptz default now()
    );
  `);

  // posts (primeira versão que tu tinha)
  await pool.query(`
    create table if not exists posts (
      id serial primary key,
      media_url text not null,
      caption text,
      created_at timestamptz default now()
    );
  `);

  // garante que exista a coluna address mesmo que a tabela já estivesse criada
  await pool.query(`
    alter table posts
    add column if not exists address text;
  `);

  // opcional para index
  await pool.query(`
    create index if not exists posts_created_at_idx on posts(created_at desc);
  `);
}

export async function query(q, params) {
  const res = await pool.query(q, params);
  return res;
}

