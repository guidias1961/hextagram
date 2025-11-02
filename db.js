// db.js
import pg from "pg";

const { Pool } = pg;

// tenta usar o que o provedor der, senão cai no local
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_CONNECTION_STRING ||
  "postgres://postgres:postgres@localhost:5432/postgres";

const ssl =
  process.env.PGSSLMODE === "require"
    ? { rejectUnauthorized: false }
    : false;

const pool = new Pool({
  connectionString,
  ssl
});

export const query = (text, params) => pool.query(text, params);

export { pool };

