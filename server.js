import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import pkg from 'pg';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hextagram'
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

const uploadDir = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.png';
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

const JWT_SECRET = process.env.JWT_SECRET || 'hextagram-secret';

function makeToken(address) {
  return jwt.sign({ address }, JWT_SECRET, { expiresIn: '30d' });
}

function getAddressFromReq(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length !== 2) return null;
  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.address;
  } catch (e) {
    return null;
  }
}

function verifySignature(address, message, signature) {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch (e) {
    return false;
  }
}

const indexPath = path.join(__dirname, 'index.html');
app.use('/uploads', express.static(uploadDir));
app.use(express.static(__dirname));

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      address text PRIMARY KEY,
      username text,
      bio text,
      avatar_url text,
      created_at timestamp default now()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS posts (
      id serial PRIMARY KEY,
      user_address text NOT NULL,
      media_url text,
      media_type text,
      caption text,
      created_at timestamp default now()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS post_likes (
      id serial PRIMARY KEY,
      post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_address text NOT NULL,
      created_at timestamp default now(),
      UNIQUE (post_id, user_address)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS post_comments (
      id serial PRIMARY KEY,
      post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_address text NOT NULL,
      content text NOT NULL,
      created_at timestamp default now()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS follows (
      id serial PRIMARY KEY,
      follower_address text NOT NULL,
      following_address text NOT NULL,
      created_at timestamp default now(),
      UNIQUE (follower_address, following_address)
    );
  `);
  await query(`UPDATE posts SET media_type = 'image' WHERE media_type IS NULL;`);
}

// AUTH
app.post('/api/auth', async (req, res) => {
  const { address, message, signature } = req.body;
  if (!address || !message || !signature) return res.status(400).json({ error: 'Missing auth data' });

  const ok = verifySignature(address, message, signature);
  if (!ok) return res.status(401).json({ error: 'Invalid signature' });

  const addr = address.toLowerCase();
  await query(`INSERT INTO users (address) VALUES ($1) ON CONFLICT (address) DO NOTHING`, [addr]);

  const token = makeToken(addr);
  res.json({ token, address: addr });
});

// upload mídia de post
app.post('/api/upload-media', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ ok: true, url: '/uploads/' + req.file.filename });
});

// upload avatar
app.post('/api/profile/avatar', upload.single('avatar'), async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No avatar' });
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
  const r = await query(
    `INSERT INTO posts (user_address, media_url, media_type, caption)
     VALUES ($1, $2, 'image', $3)
     RETURNING *`,
    [address, media_url, caption || null]
  );
  res.json(r.rows[0]);
});

// feed
app.get('/api/posts', async (req, res) => {
  const viewer = getAddressFromReq(req);
  const r = await query(`
    SELECT
      p.id,
      p.user_address AS address,
      p.media_url,
      p.caption,
      p.created_at,
      u.username,
      u.avatar_url,
      COALESCE(l.cnt, 0) AS like_count,
      COALESCE(c.cnt, 0) AS comment_count
    FROM posts p
    LEFT JOIN users u ON u.address = p.user_address
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM post_likes pl WHERE pl.post_id = p.id) l ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM post_comments pc WHERE pc.post_id = p.id) c ON TRUE
    ORDER BY p.created_at DESC
    LIMIT 200
  `);

  let posts = r.rows;
  if (viewer) {
    const liked = await query(`SELECT post_id FROM post_likes WHERE user_address = $1`, [viewer]);
    const likedSet = new Set(liked.rows.map(x => String(x.post_id)));
    posts = posts.map(p => ({ ...p, liked: likedSet.has(String(p.id)) }));
  }

  res.json(posts);
});

// like
app.post('/api/posts/:id/like', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });
  const id = Number(req.params.id);
  const exists = await query(
    `SELECT id FROM post_likes WHERE post_id = $1 AND user_address = $2`,
    [id, address]
  );
  if (exists.rowCount) {
    await query(`DELETE FROM post_likes WHERE post_id = $1 AND user_address = $2`, [id, address]);
  } else {
    await query(
      `INSERT INTO post_likes (post_id, user_address) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, address]
    );
  }
  const count = await query(`SELECT COUNT(*) FROM post_likes WHERE post_id = $1`, [id]);
  res.json({ ok: true, likes: Number(count.rows[0].count), liked: !exists.rowCount });
});

// comments
app.get('/api/posts/:id/comments', async (req, res) => {
  const id = Number(req.params.id);
  const r = await query(
    `SELECT pc.id, pc.post_id, pc.user_address, pc.content, pc.created_at,
            u.username, u.avatar_url
     FROM post_comments pc
     LEFT JOIN users u ON u.address = pc.user_address
     WHERE pc.post_id = $1
     ORDER BY pc.created_at ASC`,
    [id]
  );
  res.json(r.rows);
});

app.post('/api/posts/:id/comments', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });
  const id = Number(req.params.id);
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'content required' });
  const r = await query(
    `INSERT INTO post_comments (post_id, user_address, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, address, content.trim()]
  );
  res.json(r.rows[0]);
});

// delete post apenas do dono
app.delete('/api/posts/:id', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });
  const id = Number(req.params.id);
  const post = await query(`SELECT * FROM posts WHERE id = $1`, [id]);
  if (!post.rowCount) return res.status(404).json({ error: 'not found' });
  if (post.rows[0].user_address.toLowerCase() !== address.toLowerCase())
    return res.status(403).json({ error: 'forbidden' });
  await query(`DELETE FROM posts WHERE id = $1`, [id]);
  res.json({ ok: true });
});

// profile do próprio
app.get('/api/profile/me', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });

  const u = await query(`SELECT * FROM users WHERE address = $1`, [address]);
  const user = u.rowCount ? u.rows[0] : { address };

  const posts = await query(`SELECT COUNT(*) FROM posts WHERE user_address = $1`, [address]);
  const followers = await query(`SELECT COUNT(*) FROM follows WHERE following_address = $1`, [address]);
  const following = await query(`SELECT COUNT(*) FROM follows WHERE follower_address = $1`, [address]);

  res.json({
    address,
    username: user.username,
    bio: user.bio,
    avatar_url: user.avatar_url,
    posts_count: Number(posts.rows[0].count),
    followers_count: Number(followers.rows[0].count),
    following_count: Number(following.rows[0].count)
  });
});

// profile de outro usuário (para seguir)
app.get('/api/profile/:address', async (req, res) => {
  const viewer = getAddressFromReq(req);
  const target = req.params.address.toLowerCase();

  const u = await query(`SELECT * FROM users WHERE address = $1`, [target]);
  const user = u.rowCount ? u.rows[0] : { address: target };

  const posts = await query(`SELECT COUNT(*) FROM posts WHERE user_address = $1`, [target]);
  const followers = await query(`SELECT COUNT(*) FROM follows WHERE following_address = $1`, [target]);
  const following = await query(`SELECT COUNT(*) FROM follows WHERE follower_address = $1`, [target]);

  let is_following = false;
  if (viewer) {
    const f = await query(
      `SELECT 1 FROM follows WHERE follower_address = $1 AND following_address = $2`,
      [viewer, target]
    );
    is_following = f.rowCount > 0;
  }

  res.json({
    address: target,
    username: user.username,
    bio: user.bio,
    avatar_url: user.avatar_url,
    posts_count: Number(posts.rows[0].count),
    followers_count: Number(followers.rows[0].count),
    following_count: Number(following.rows[0].count),
    is_following
  });
});

// seguir
app.post('/api/follow', async (req, res) => {
  const follower = getAddressFromReq(req);
  if (!follower) return res.status(401).json({ error: 'Unauthorized' });
  const { target } = req.body;
  if (!target) return res.status(400).json({ error: 'target required' });
  const t = target.toLowerCase();
  const f = follower.toLowerCase();
  if (t === f) return res.status(400).json({ error: 'cannot follow self' });

  await query(
    `INSERT INTO follows (follower_address, following_address) VALUES ($1, $2)
     ON CONFLICT (follower_address, following_address) DO NOTHING`,
    [f, t]
  );
  res.json({ ok: true });
});

// deixar de seguir
app.delete('/api/follow/:address', async (req, res) => {
  const follower = getAddressFromReq(req);
  if (!follower) return res.status(401).json({ error: 'Unauthorized' });
  const target = req.params.address.toLowerCase();
  await query(
    `DELETE FROM follows WHERE follower_address = $1 AND following_address = $2`,
    [follower.toLowerCase(), target]
  );
  res.json({ ok: true });
});

// update de perfil
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

