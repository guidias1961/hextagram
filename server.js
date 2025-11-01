// server.js
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { query } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const JWT_SECRET = process.env.JWT_SECRET || "ermano";

// garante estrutura mesmo se a tabela já existia antiga
await query(`CREATE TABLE IF NOT EXISTS users (address text primary key);`);
await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;`);
await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text;`);
await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;`);
await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();`);

await query(`
  CREATE TABLE IF NOT EXISTS posts (
    id serial primary key,
    user_address text not null references users(address),
    media_url text not null,
    caption text,
    cloud_provider text,
    address text,
    created_at timestamptz default now()
  );
`);
await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS cloud_provider text;`);
await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS address text;`);
await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();`);

// middleware auth
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: "no auth" });
  const token = h.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: "invalid token" });
  }
}

// login assinado
app.post("/api/auth", async (req, res) => {
  try {
    const { address, message, signature } = req.body;
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(400).json({ error: "bad sig" });
    }

    await query(
      `INSERT INTO users(address) VALUES($1)
       ON CONFLICT (address) DO NOTHING`,
      [address]
    );

    const token = jwt.sign({ address }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, address });
  } catch (e) {
    console.error("auth error", e);
    res.status(500).json({ error: "auth fail" });
  }
});

// feed
app.get("/api/posts", async (req, res) => {
  try {
    const r = await query(
      `SELECT p.id,
              p.media_url,
              p.caption,
              p.created_at,
              p.user_address as address,
              u.username,
              u.avatar_url
         FROM posts p
         LEFT JOIN users u ON u.address = p.user_address
         ORDER BY p.created_at DESC
         LIMIT 200`
    );
    res.json(r.rows);
  } catch (e) {
    console.error("get posts error", e);
    res.status(500).json({ error: "get posts error" });
  }
});

// criar post
app.post("/api/posts", auth, async (req, res) => {
  try {
    const address = req.user.address;
    const { media_url, caption } = req.body;
    if (!media_url) return res.status(400).json({ error: "media_url required" });

    const r = await query(
      `INSERT INTO posts
         (user_address, media_url, caption, cloud_provider, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_address as address, media_url, caption, created_at`,
      [address, media_url, caption || null, "cloudinary", address]
    );

    res.json(r.rows[0]);
  } catch (e) {
    console.error("create post error", e);
    res.status(500).json({ error: "create post error" });
  }
});

// meu perfil
app.get("/api/profile/me", auth, async (req, res) => {
  const address = req.user.address;
  const r = await query(
    `SELECT address, username, bio, avatar_url FROM users WHERE address = $1`,
    [address]
  );
  res.json(r.rows[0] || { address });
});

// atualizar perfil
app.put("/api/profile", auth, async (req, res) => {
  const address = req.user.address;
  const { username, bio, avatar_url } = req.body;
  await query(
    `UPDATE users
        SET username = $1,
            bio = $2,
            avatar_url = $3
      WHERE address = $4`,
    [username || null, bio || null, avatar_url || null, address]
  );
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Hextagram on", PORT);
});

