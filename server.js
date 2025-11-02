import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";
import pool from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// cria pasta de uploads se não existir
const uploadsDir = path.join(__dirname, "public", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// storage local simples
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const name = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// arquivos estáticos
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));

// health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// pega ou cria user pela wallet
async function getOrCreateUser(address) {
  if (!address) return null;
  const addr = address.toLowerCase();
  const client = await pool.connect();
  try {
    const found = await client.query(
      "SELECT * FROM users WHERE address = $1",
      [addr]
    );
    if (found.rows.length > 0) return found.rows[0];

    const inserted = await client.query(
      "INSERT INTO users (address, username, bio, avatar_url, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
      [addr, addr.slice(0, 6) + "..." + addr.slice(-4), "", ""]
    );
    return inserted.rows[0];
  } finally {
    client.release();
  }
}

// lista posts (feed e explore usam isso)
app.get("/api/posts", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         p.id,
         p.user_address,
         p.media_url,
         p.media_type,
         p.caption,
         p.created_at,
         COALESCE(u.username, p.user_address) AS username,
         COALESCE(u.bio, '') AS bio,
         COALESCE(u.avatar_url, '') AS avatar_url,
         COALESCE(p.likes_count, 0) AS likes_count,
         COALESCE(p.comments_count, 0) AS comments_count
       FROM posts p
       LEFT JOIN users u ON u.address = LOWER(p.user_address)
       ORDER BY p.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/posts error", err);
    res.status(500).json({ error: "failed to fetch posts" });
  }
});

// cria post
app.post("/api/posts", upload.single("media"), async (req, res) => {
  const { user_address, caption } = req.body;
  const file = req.file;

  if (!user_address) {
    return res.status(400).json({ error: "user_address required" });
  }

  const media_url = file ? `/uploads/${file.filename}` : null;
  const media_type = file ? (file.mimetype.startsWith("video") ? "video" : "image") : null;

  try {
    await getOrCreateUser(user_address);
    const insert = await pool.query(
      `INSERT INTO posts (user_address, media_url, media_type, caption, created_at, likes_count, comments_count)
       VALUES ($1, $2, $3, $4, NOW(), 0, 0)
       RETURNING *`,
      [user_address.toLowerCase(), media_url, media_type, caption || ""]
    );
    res.json(insert.rows[0]);
  } catch (err) {
    console.error("POST /api/posts error", err);
    res.status(500).json({ error: "failed to create post" });
  }
});

// like
app.post("/api/posts/:id/like", async (req, res) => {
  const { id } = req.params;
  const { user_address } = req.body;
  if (!user_address) return res.status(400).json({ error: "user_address required" });
  try {
    // salva like (tabela já existe no teu banco: post_likes)
    await pool.query(
      "INSERT INTO post_likes (post_id, user_address, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING",
      [id, user_address.toLowerCase()]
    );
    // atualiza contador
    await pool.query(
      "UPDATE posts SET likes_count = COALESCE(likes_count,0) + 1 WHERE id = $1",
      [id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/posts/:id/like", err);
    res.status(500).json({ error: "failed to like" });
  }
});

// comment
app.post("/api/posts/:id/comment", async (req, res) => {
  const { id } = req.params;
  const { user_address, content } = req.body;
  if (!user_address || !content) {
    return res.status(400).json({ error: "user_address and content required" });
  }
  try {
    await pool.query(
      "INSERT INTO post_comments (post_id, user_address, content, created_at) VALUES ($1, $2, $3, NOW())",
      [id, user_address.toLowerCase(), content]
    );
    await pool.query(
      "UPDATE posts SET comments_count = COALESCE(comments_count,0) + 1 WHERE id = $1",
      [id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/posts/:id/comment", err);
    res.status(500).json({ error: "failed to comment" });
  }
});

// pega perfil
app.get("/api/users/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();
  try {
    const user = await getOrCreateUser(address);
    // posts do cara
    const posts = await pool.query(
      "SELECT * FROM posts WHERE LOWER(user_address) = $1 ORDER BY created_at DESC",
      [address]
    );
    res.json({ user, posts: posts.rows });
  } catch (err) {
    console.error("GET /api/users/:address", err);
    res.status(500).json({ error: "failed to get user" });
  }
});

// atualiza perfil
app.post("/api/users/:address", upload.single("avatar"), async (req, res) => {
  const address = req.params.address.toLowerCase();
  const { username, bio } = req.body;
  const avatarFile = req.file;
  const avatar_url = avatarFile ? `/uploads/${avatarFile.filename}` : null;
  try {
    const user = await getOrCreateUser(address);
    const updated = await pool.query(
      `UPDATE users
         SET username = $1,
             bio = $2,
             avatar_url = COALESCE($3, avatar_url)
       WHERE address = $4
       RETURNING *`,
      [username || user.username, bio || user.bio, avatar_url, address]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error("POST /api/users/:address", err);
    res.status(500).json({ error: "failed to update profile" });
  }
});

// fallback SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("Hextagram on", PORT);
});

