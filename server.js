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

// caminho absoluto da pasta public
const publicPath = path.join(__dirname, "public");

// garante uploads
const uploadsDir = path.join(publicPath, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// multer local
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// estáticos
app.use(express.static(publicPath));
app.use("/uploads", express.static(uploadsDir));

// helper
async function getOrCreateUser(address) {
  if (!address) return null;
  const addr = address.toLowerCase();
  const client = await pool.connect();
  try {
    const found = await client.query("SELECT * FROM users WHERE address = $1", [addr]);
    if (found.rows.length) return found.rows[0];

    const inserted = await client.query(
      "INSERT INTO users (address, username, bio, avatar_url, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING *",
      [addr, addr.slice(0, 6) + "..." + addr.slice(-4), "", ""]
    );
    return inserted.rows[0];
  } finally {
    client.release();
  }
}

app.get("/api/posts", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
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
      ORDER BY p.created_at DESC
    `);
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to fetch posts" });
  }
});

app.post("/api/posts", upload.single("media"), async (req, res) => {
  const { user_address, caption } = req.body;
  if (!user_address) return res.status(400).json({ error: "user_address required" });

  const file = req.file;
  const media_url = file ? `/uploads/${file.filename}` : null;
  const media_type = file ? (file.mimetype.startsWith("video") ? "video" : "image") : null;

  try {
    await getOrCreateUser(user_address);
    const r = await pool.query(
      `INSERT INTO posts (user_address, media_url, media_type, caption, created_at, likes_count, comments_count)
       VALUES ($1,$2,$3,$4,NOW(),0,0) RETURNING *`,
      [user_address.toLowerCase(), media_url, media_type, caption || ""]
    );
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to create post" });
  }
});

app.post("/api/posts/:id/like", async (req, res) => {
  const { id } = req.params;
  const { user_address } = req.body;
  if (!user_address) return res.status(400).json({ error: "user_address required" });

  try {
    await pool.query(
      "INSERT INTO post_likes (post_id, user_address, created_at) VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING",
      [id, user_address.toLowerCase()]
    );
    await pool.query("UPDATE posts SET likes_count = COALESCE(likes_count,0)+1 WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to like" });
  }
});

app.post("/api/posts/:id/comment", async (req, res) => {
  const { id } = req.params;
  const { user_address, content } = req.body;
  if (!user_address || !content) return res.status(400).json({ error: "user_address and content required" });
  try {
    await pool.query(
      "INSERT INTO post_comments (post_id, user_address, content, created_at) VALUES ($1,$2,$3,NOW())",
      [id, user_address.toLowerCase(), content]
    );
    await pool.query("UPDATE posts SET comments_count = COALESCE(comments_count,0)+1 WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to comment" });
  }
});

app.get("/api/users/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();
  try {
    const user = await getOrCreateUser(address);
    const posts = await pool.query(
      "SELECT * FROM posts WHERE LOWER(user_address) = $1 ORDER BY created_at DESC",
      [address]
    );
    res.json({ user, posts: posts.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to get user" });
  }
});

app.post("/api/users/:address", upload.single("avatar"), async (req, res) => {
  const address = req.params.address.toLowerCase();
  const { username, bio } = req.body;
  const avatarFile = req.file;
  const avatar_url = avatarFile ? `/uploads/${avatarFile.filename}` : null;

  try {
    const current = await getOrCreateUser(address);
    const r = await pool.query(
      `UPDATE users
         SET username = $1,
             bio = $2,
             avatar_url = COALESCE($3, avatar_url)
       WHERE address = $4
       RETURNING *`,
      [username || current.username, bio || current.bio, avatar_url, address]
    );
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to update profile" });
  }
});

// fallback SPA certo
app.get("*", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.listen(PORT, () => {
  console.log("Hextagram on", PORT);
});

