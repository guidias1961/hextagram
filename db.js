// ==================== db.js ====================
import pkg from "pg";
const { Pool } = pkg;

// Configuração do banco de dados
const connectionString = process.env.DATABASE_URL;
const ssl = process.env.DATABASE_SSL === "true" 
  ? { rejectUnauthorized: false } 
  : false;

// Criar pool de conexões
export const pool = new Pool({
  connectionString,
  ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Teste de conexão
pool.on('connect', () => {
  console.log('✓ Database connected');
});

pool.on('error', (err) => {
  console.error('✗ Database error:', err);
});

// Inicializar banco de dados
export async function initDb() {
  try {
    console.log('Initializing database...');
    
    // Criar tabela de usuários
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        address TEXT PRIMARY KEY,
        username TEXT,
        bio TEXT,
        avatar_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    console.log('✓ Users table ready');
    
    // Criar tabela de posts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_address TEXT NOT NULL,
        media_url TEXT NOT NULL,
        caption TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        FOREIGN KEY (user_address) REFERENCES users(address) ON DELETE CASCADE
      );
    `);
    
    console.log('✓ Posts table ready');
    
    // Criar índices para performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_user_address 
      ON posts(user_address);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_created_at 
      ON posts(created_at DESC);
    `);
    
    console.log('✓ Indexes created');
    
    // Verificar se há posts
    const countResult = await pool.query('SELECT COUNT(*) FROM posts');
    const postCount = parseInt(countResult.rows[0].count);
    
    console.log(`✓ Database initialized (${postCount} posts)`);
    
  } catch (error) {
    console.error('✗ Database initialization failed:', error);
    throw error;
  }
}

// Função helper para queries
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      console.warn(`Slow query (${duration}ms):`, text.substring(0, 100));
    }
    
    return result;
  } catch (error) {
    console.error('Query error:', error);
    console.error('Query:', text);
    console.error('Params:', params);
    throw error;
  }
}

// Função para fechar pool (útil em testes)
export async function closePool() {
  await pool.end();
  console.log('Database connection closed');
}
