import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function initDb() {
  // tabela de usuários
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      address VARCHAR(64) UNIQUE NOT NULL,
      nonce VARCHAR(128) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // garante colunas novas de perfil
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);

  // posts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_address VARCHAR(64) NOT NULL,
      media_url TEXT NOT NULL,
      media_type VARCHAR(20) NOT NULL,
      caption TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // likes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_likes (
      id SERIAL PRIMARY KEY,
      post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_address VARCHAR(64) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(post_id, user_address)
    );
  `);

  // comments
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_comments (
      id SERIAL PRIMARY KEY,
      post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_address VARCHAR(64) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

