import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { query } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname || ''))
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
const indexPath = path.join(__dirname, 'index.html');
app.use(express.static(__dirname));

function makeToken(address) {
  return jwt.sign({ address }, JWT_SECRET, { expiresIn: '30d' });
}

function getAddressFromReq(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.address;
  } catch (e) {
    return null;
  }
}

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      address VARCHAR(80) PRIMARY KEY,
      username VARCHAR(80),
      bio TEXT,
      avatar_url TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      address VARCHAR(80) REFERENCES users(address),
      media_url TEXT,
      caption TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS likes (
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      address VARCHAR(80) REFERENCES users(address),
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (post_id, address)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      user_address VARCHAR(80) REFERENCES users(address),
      content TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
}

// autenticação por assinatura
app.post('/api/auth', async (req, res) => {
  const { address, message, signature } = req.body;
  if (!address || !message || !signature) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const addr = address.toLowerCase();
  await query(`INSERT INTO users (address) VALUES ($1) ON CONFLICT (address) DO NOTHING`, [addr]);

  const token = makeToken(addr);
  res.json({ token, address: addr });
});

// upload mídia de post
app.post('/api/upload-media', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const isImage = req.file.mimetype && req.file.mimetype.startsWith('image/');
  if (isImage && req.file.size > 2 * 1024 * 1024) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(413).json({ error: 'Image too large. Max 2MB.' });
  }
  res.json({ ok: true, url: '/uploads/' + req.file.filename });
});

// upload avatar
app.post('/api/profile/avatar', upload.single('avatar'), async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No avatar' });
  if (req.file.mimetype && req.file.mimetype.startsWith('image/') && req.file.size > 2 * 1024 * 1024) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(413).json({ error: 'Avatar too large. Max 2MB.' });
  }
  const url = '/uploads/' + req.file.filename;
  await query(`UPDATE users SET avatar_url = $1 WHERE address = $2`, [url, address]);
  res.json({ ok: true, avatar_url: url });
});

// criar post
app.post('/api/posts', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });

  const { media_url, caption } = req.body;
  if (!media_url) return res.status(400).json({ error: 'media_url required' });

  const result = await query(
    `INSERT INTO posts (address, media_url, caption) VALUES ($1, $2, $3) RETURNING id, created_at`,
    [address, media_url, caption || '']
  );

  res.json({
    ok: true,
    id: result.rows[0].id,
    created_at: result.rows[0].created_at
  });
});

// listar posts
app.get('/api/posts', async (req, res) => {
  const rows = await query(`
    SELECT
      p.*,
      u.username,
      u.avatar_url,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
    FROM posts p
    LEFT JOIN users u ON u.address = p.address
    ORDER BY p.created_at DESC
  `);
  const address = getAddressFromReq(req);
  if (address) {
    const likes = await query(`SELECT post_id FROM likes WHERE address = $1`, [address]);
    const likedIds = new Set(likes.rows.map(r => r.post_id));
    res.json(rows.rows.map(r => ({ ...r, liked: likedIds.has(r.id) })));
  } else {
    res.json(rows.rows);
  }
});

// deletar post (só dono)
app.delete('/api/posts/:id', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });

  const postId = Number(req.params.id);
  const post = await query(`SELECT * FROM posts WHERE id = $1`, [postId]);
  if (post.rows.length === 0) return res.status(404).json({ error: 'Not found' });

  if (post.rows[0].address !== address) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await query(`DELETE FROM posts WHERE id = $1`, [postId]);
  res.json({ ok: true });
});

// like/unlike
app.post('/api/posts/:id/like', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });

  const postId = Number(req.params.id);
  const already = await query(`SELECT 1 FROM likes WHERE post_id = $1 AND address = $2`, [postId, address]);
  if (already.rows.length) {
    await query(`DELETE FROM likes WHERE post_id = $1 AND address = $2`, [postId, address]);
  } else {
    await query(`INSERT INTO likes (post_id, address) VALUES ($1, $2)`, [postId, address]);
  }

  const count = await query(`SELECT COUNT(*) FROM likes WHERE post_id = $1`, [postId]);
  res.json({ ok: true, likes: Number(count.rows[0].count), liked: !already.rows.length });
});

// comments
app.get('/api/posts/:id/comments', async (req, res) => {
  const postId = Number(req.params.id);
  const rows = await query(
    `SELECT c.*, u.username
     FROM comments c
     LEFT JOIN users u ON u.address = c.user_address
     WHERE c.post_id = $1
     ORDER BY c.created_at ASC`,
    [postId]
  );
  res.json(rows.rows);
});

app.post('/api/posts/:id/comments', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });
  const postId = Number(req.params.id);
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });

  await query(
    `INSERT INTO comments (post_id, user_address, content) VALUES ($1, $2, $3)`,
    [postId, address, content]
  );
  res.json({ ok: true });
});

// profile
app.get('/api/profile/me', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });

  const user = await query(`SELECT * FROM users WHERE address = $1`, [address]);
  const posts = await query(`SELECT COUNT(*) FROM posts WHERE address = $1`, [address]);
  res.json({
    address,
    username: user.rows[0].username,
    bio: user.rows[0].bio,
    avatar_url: user.rows[0].avatar_url,
    posts_count: Number(posts.rows[0].count),
    followers_count: 0,
    following_count: 0
  });
});

app.put('/api/profile', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });

  const { username, bio, avatar_url } = req.body;
  await query(
    `UPDATE users SET username = $1, bio = $2, avatar_url = $3 WHERE address = $4`,
    [username || null, bio || null, avatar_url || null, address]
  );
  res.json({ ok: true });
});

// SPA fallback
app.get('/', (req, res) => res.sendFile(indexPath));
app.get('/index.html', (req, res) => res.sendFile(indexPath));
app.get('*', (req, res) => res.sendFile(indexPath));

const PORT = process.env.PORT || 3000;

ensureTables().then(() => {
  app.listen(PORT, () => {
    console.log('Hextagram running on', PORT);
  });
});

