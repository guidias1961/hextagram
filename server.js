import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Web3Storage, File } from 'web3.storage';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { query } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// make sure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
// this was missing, so old posts could not load
app.use('/uploads', express.static(uploadsDir));

const JWT_SECRET = process.env.JWT_SECRET || 'hextagram-secret';
const W3S_TOKEN = process.env.W3S_TOKEN || '';

const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || '');
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  }
});
const upload = multer({ storage: diskStorage });

// helpers
function verifySignature(address, message, signature) {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch (err) {
    return false;
  }
}

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
  } catch (err) {
    return null;
  }
}

// create missing tables
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

  // backfill
  await query(`UPDATE posts SET media_type = 'image' WHERE media_type IS NULL;`);
}

// AUTH
app.post('/api/auth', async (req, res) => {
  const { address, message, signature } = req.body;
  if (!address || !message || !signature) {
    return res.status(400).json({ error: 'Missing auth fields' });
  }
  const ok = verifySignature(address, message, signature);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  await query(
    `INSERT INTO users (address) VALUES ($1) ON CONFLICT (address) DO NOTHING`,
    [address.toLowerCase()]
  );
  const token = makeToken(address.toLowerCase());
  return res.json({ token, address: address.toLowerCase() });
});

// MEDIA UPLOAD (post)
app.post('/api/upload-media', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // default: local file
    let finalUrl = '/uploads/' + req.file.filename;

    // if token is real web3.storage, try to send there too
    const isRealWeb3Token = W3S_TOKEN && !W3S_TOKEN.startsWith('did:key:');

    if (isRealWeb3Token) {
      try {
        const client = new Web3Storage({ token: W3S_TOKEN });
        const buffer = fs.readFileSync(path.join(uploadsDir, req.file.filename));
        const web3File = new File([buffer], req.file.filename, { type: req.file.mimetype });
        const cid = await client.put([web3File], { wrapWithDirectory: false });
        finalUrl = `https://${cid}.ipfs.w3s.link`;
      } catch (err) {
        console.warn('web3.storage upload failed, using local file instead', err.message);
      }
    }

    return res.json({ ok: true, url: finalUrl, name: req.file.filename });
  } catch (err) {
    console.error('upload-media error', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// AVATAR UPLOAD
app.post('/api/profile/avatar', upload.single('avatar'), async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No avatar uploaded' });

  const avatarUrl = '/uploads/' + req.file.filename;
  await query(
    `UPDATE users SET avatar_url = $1 WHERE address = $2`,
    [avatarUrl, address]
  );
  return res.json({ ok: true, avatar_url: avatarUrl });
});

// CREATE POST
app.post('/api/posts', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });

  const { media_url, caption } = req.body;
  if (!media_url) {
    return res.status(400).json({ error: 'media_url required' });
  }

  const result = await query(
    `INSERT INTO posts (user_address, media_url, media_type, caption)
     VALUES ($1, $2, 'image', $3)
     RETURNING *`,
    [address, media_url, caption || null]
  );

  return res.json(result.rows[0]);
});

// LIST POSTS (feed, explore)
app.get('/api/posts', async (req, res) => {
  const viewer = getAddressFromReq(req);

  const result = await query(`
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
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM post_likes pl WHERE pl.post_id = p.id
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM post_comments pc WHERE pc.post_id = p.id
    ) c ON TRUE
    ORDER BY p.created_at DESC
    LIMIT 200
  `);

  let posts = result.rows;

  if (viewer) {
    const liked = await query(
      `SELECT post_id FROM post_likes WHERE user_address = $1`,
      [viewer]
    );
    const likedSet = new Set(liked.rows.map(r => String(r.post_id)));
    posts = posts.map(p => ({
      ...p,
      liked: likedSet.has(String(p.id))
    }));
  }

  return res.json(posts);
});

// LIKE / UNLIKE
app.post('/api/posts/:id/like', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });

  const postId = Number(req.params.id);
  if (!postId) return res.status(400).json({ error: 'Invalid post id' });

  const already = await query(
    `SELECT id FROM post_likes WHERE post_id = $1 AND user_address = $2`,
    [postId, address]
  );

  if (already.rowCount > 0) {
    await query(
      `DELETE FROM post_likes WHERE post_id = $1 AND user_address = $2`,
      [postId, address]
    );
  } else {
    await query(
      `INSERT INTO post_likes (post_id, user_address)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [postId, address]
    );
  }

  const count = await query(
    `SELECT COUNT(*) FROM post_likes WHERE post_id = $1`,
    [postId]
  );

  return res.json({
    ok: true,
    likes: Number(count.rows[0].count),
    liked: already.rowCount === 0
  });
});

// COMMENTS
app.get('/api/posts/:id/comments', async (req, res) => {
  const postId = Number(req.params.id);
  const result = await query(
    `SELECT pc.id,
            pc.post_id,
            pc.user_address,
            pc.content,
            pc.created_at,
            u.username,
            u.avatar_url
     FROM post_comments pc
     LEFT JOIN users u ON u.address = pc.user_address
     WHERE pc.post_id = $1
     ORDER BY pc.created_at ASC`,
    [postId]
  );
  return res.json(result.rows);
});

app.post('/api/posts/:id/comments', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });

  const postId = Number(req.params.id);
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content required' });
  }

  const result = await query(
    `INSERT INTO post_comments (post_id, user_address, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [postId, address, content.trim()]
  );
  return res.json(result.rows[0]);
});

// DELETE POST
app.delete('/api/posts/:id', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });

  const postId = Number(req.params.id);

  const post = await query(`SELECT * FROM posts WHERE id = $1`, [postId]);
  if (post.rowCount === 0) return res.status(404).json({ error: 'Post not found' });

  if (post.rows[0].user_address.toLowerCase() !== address.toLowerCase()) {
    return res.status(403).json({ error: 'Not your post' });
  }

  await query(`DELETE FROM posts WHERE id = $1`, [postId]);
  return res.json({ ok: true });
});

// PROFILE
app.get('/api/profile/me', async (req, res) => {
  const address = getAddressFromReq(req);
  if (!address) return res.status(401).json({ error: 'Unauthorized' });

  const userRes = await query(`SELECT * FROM users WHERE address = $1`, [address]);
  const user = userRes.rowCount > 0 ? userRes.rows[0] : { address };

  const postCountRes = await query(`SELECT COUNT(*) FROM posts WHERE user_address = $1`, [address]);
  const followersRes = await query(`SELECT COUNT(*) FROM follows WHERE following_address = $1`, [address]);
  const followingRes = await query(`SELECT COUNT(*) FROM follows WHERE follower_address = $1`, [address]);

  return res.json({
    address,
    username: user.username,
    bio: user.bio,
    avatar_url: user.avatar_url,
    posts_count: Number(postCountRes.rows[0].count),
    followers_count: Number(followersRes.rows[0].count),
    following_count: Number(followingRes.rows[0].count)
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
  return res.json({ ok: true });
});

// FOLLOW / UNFOLLOW
app.post('/api/follow/:address', async (req, res) => {
  const me = getAddressFromReq(req);
  const other = req.params.address.toLowerCase();
  if (!me) return res.status(401).json({ error: 'Unauthorized' });
  if (me.toLowerCase() === other) return res.status(400).json({ error: 'Cannot follow yourself' });

  await query(
    `INSERT INTO follows (follower_address, following_address)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [me.toLowerCase(), other]
  );
  return res.json({ ok: true });
});

app.delete('/api/follow/:address', async (req, res) => {
  const me = getAddressFromReq(req);
  const other = req.params.address.toLowerCase();
  if (!me) return res.status(401).json({ error: 'Unauthorized' });

  await query(
    `DELETE FROM follows WHERE follower_address = $1 AND following_address = $2`,
    [me.toLowerCase(), other]
  );
  return res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;

ensureTables().then(() => {
  app.listen(PORT, () => {
    console.log('Hextagram API running on port', PORT);
  });
});

