// db.js
import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false
});

export async function initDb() {
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

  await pool.query(`
    create table if not exists posts (
      id serial primary key,
      user_address text not null,
      media_url text not null,
      media_type text,
      caption text,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists wallet_nonces (
      address text primary key,
      nonce text not null,
      updated_at timestamptz default now()
    );
  `);
}

