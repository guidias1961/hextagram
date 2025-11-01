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

  // posts
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

  // garante as duas colunas
  await pool.query(`alter table posts add column if not exists user_address text;`);
  await pool.query(`alter table posts add column if not exists address text;`);

  // se tiver NOT NULL antigo, solta
  await pool.query(`
    do $$
    begin
      if exists (
        select 1
        from information_schema.columns
        where table_name = 'posts'
          and column_name = 'user_address'
          and is_nullable = 'NO'
      ) then
        alter table posts alter column user_address drop not null;
      end if;
    end $$;
  `);

  // sincroniza dados antigos
  await pool.query(`
    update posts
    set address = user_address
    where address is null and user_address is not null;
  `);

  await pool.query(`
    create index if not exists posts_created_at_idx
    on posts (created_at desc);
  `);
}

export async function query(q, params) {
  return pool.query(q, params);
}

