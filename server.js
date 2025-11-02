import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pkg from "pg";

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// pasta de uploads
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
app.use("/uploads", express.static(uploadDir));

// servir arquivos estáticos (index.html, app.js, styles.css)
app.use(express.static(__dirname));

// pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false
});

// multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || "") || ".jpg";
    cb(null, unique + ext);
  }
});
const upload = multer({ storage });

async function getOrCreateUser(wallet) {
  if (!wallet) return null;
  const found = await pool.query("SELECT * FROM users WHERE wallet_address = $1", [wallet]);
  if (found.rows.length) return found.rows[0];
  const inserted = await pool.query(
    "INSERT INTO users (wallet_address) VALUES ($1) RETURNING *",
    [wallet]
  );
  return inserted.rows[0];
}

// rotas

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/posts", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.*, u.username, u.bio, u.avatar_url
      FROM posts p
      LEFT JOIN users u ON u.wallet_address = p.wallet_address
      ORDER BY p.created_at DESC
      LIMIT 100
    `);
    res.json(r.rows);
  } catch (err) {
    console.error("get posts error:", err);
    res.status(500).json({ error: "failed to load posts" });
  }
});

app.get("/api/explore", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.*, u.username, u.avatar_url
      FROM posts p
      LEFT JOIN users u ON u.wallet_address = p.wallet_address
      ORDER BY p.likes DESC, p.comments DESC, p.created_at DESC
      LIMIT 120
    `);
    res.json(r.rows);
  } catch (err) {
    console.error("explore error:", err);
    res.status(500).json({ error: "failed to load explore" });
  }
});

app.get("/api/users/:wallet", async (req, res) => {
  const { wallet } = req.params;
  try {
    const user = await getOrCreateUser(wallet);
    const posts = await pool.query(
      "SELECT * FROM posts WHERE wallet_address = $1 ORDER BY created_at DESC",
      [wallet]
    );
    const followers = await pool.query(
      "SELECT COUNT(*) FROM follows WHERE followed = $1",
      [wallet]
    );
    const following = await pool.query(
      "SELECT COUNT(*) FROM follows WHERE follower = $1",
      [wallet]
    );
    res.json({
      user,
      posts: posts.rows,
      followers: Number(followers.rows[0].count || 0),
      following: Number(following.rows[0].count || 0)
    });
  } catch (err) {
    console.error("get user error:", err);
    res.status(500).json({ error: "failed to load user" });
  }
});

const avatarUpload = multer({ storage });
app.post("/api/users/:wallet", avatarUpload.single("avatar"), async (req, res) => {
  const { wallet } = req.params;
  const { username, bio, avatar_url } = req.body;
  let finalAvatar = avatar_url || null;
  if (req.file) {
    finalAvatar = "/uploads/" + req.file.filename;
  }
  try {
    await getOrCreateUser(wallet);
    const u = await pool.query(
      `
      UPDATE users
      SET username = COALESCE($1, username),
          bio = COALESCE($2, bio),
          avatar_url = COALESCE($3, avatar_url)
      WHERE wallet_address = $4
      RETURNING *
      `,
      [username || null, bio || null, finalAvatar, wallet]
    );
    res.json(u.rows[0]);
  } catch (err) {
    console.error("update profile error:", err);
    res.status(500).json({ error: "failed to update profile" });
  }
});

app.post("/api/follow", async (req, res) => {
  const { follower, followed } = req.body;
  if (!follower || !followed) return res.status(400).json({ error: "wallets required" });
  try {
    await getOrCreateUser(follower);
    await getOrCreateUser(followed);
    const check = await pool.query(
      "SELECT id FROM follows WHERE follower = $1 AND followed = $2",
      [follower, followed]
    );
    if (check.rows.length) {
      await pool.query("DELETE FROM follows WHERE follower = $1 AND followed = $2", [
        follower,
        followed
      ]);
    } else {
      await pool.query(
        "INSERT INTO follows (follower, followed, created_at) VALUES ($1, $2, NOW())",
        [follower, followed]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("follow error:", err);
    res.status(500).json({ error: "failed to follow" });
  }
});

app.post("/api/posts", upload.single("image"), async (req, res) => {
  const { wallet_address, caption } = req.body;
  const file = req.file;
  if (!wallet_address) return res.status(400).json({ error: "wallet_address required" });
  if (!file) return res.status(400).json({ error: "image required" });

  const mediaUrl = "/uploads/" + file.filename;
  const mediaType = file.mimetype || "image/jpeg";

  try {
    await getOrCreateUser(wallet_address);
    const inserted = await pool.query(
      `
      INSERT INTO posts (wallet_address, media_url, media_type, caption, created_at, likes, comments)
      VALUES ($1, $2, $3, $4, NOW(), 0, 0)
      RETURNING *
      `,
      [wallet_address, mediaUrl, mediaType, caption || null]
    );
    res.json(inserted.rows[0]);
  } catch (err) {
    console.error("create post error:", err);
    res.status(500).json({ error: "failed to create post" });
  }
});

app.post("/api/posts/:id/like", async (req, res) => {
  const { id } = req.params;
  const { wallet_address } = req.body;
  if (!wallet_address) return res.status(400).json({ error: "wallet_address required" });

  try {
    await getOrCreateUser(wallet_address);
    const liked = await pool.query(
      "SELECT id FROM post_likes WHERE post_id = $1 AND wallet_address = $2",
      [id, wallet_address]
    );
    if (liked.rows.length) {
      await pool.query("DELETE FROM post_likes WHERE post_id = $1 AND wallet_address = $2", [
        id,
        wallet_address
      ]);
    } else {
      await pool.query(
        "INSERT INTO post_likes (post_id, wallet_address, created_at) VALUES ($1, $2, NOW())",
        [id, wallet_address]
      );
    }
    const count = await pool.query("SELECT COUNT(*) FROM post_likes WHERE post_id = $1", [id]);
    const likes = Number(count.rows[0].count || 0);
    await pool.query("UPDATE posts SET likes = $1 WHERE id = $2", [likes, id]);
    res.json({ likes });
  } catch (err) {
    console.error("like error:", err);
    res.status(500).json({ error: "failed to like" });
  }
});

app.get("/api/posts/:id/comments", async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query(
      `
      SELECT c.*, u.username, u.avatar_url
      FROM post_comments c
      LEFT JOIN users u ON u.wallet_address = c.wallet_address
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
      `,
      [id]
    );
    res.json(r.rows);
  } catch (err) {
    console.error("get comments error:", err);
    res.status(500).json({ error: "failed to load comments" });
  }
});

app.post("/api/posts/:id/comment", async (req, res) => {
  const { id } = req.params;
  const { wallet_address, text } = req.body;
  if (!wallet_address) return res.status(400).json({ error: "wallet_address required" });
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    await getOrCreateUser(wallet_address);
    await pool.query(
      "INSERT INTO post_comments (post_id, wallet_address, text, created_at) VALUES ($1, $2, $3, NOW())",
      [id, wallet_address, text]
    );
    const count = await pool.query("SELECT COUNT(*) FROM post_comments WHERE post_id = $1", [id]);
    const comments = Number(count.rows[0].count || 0);
    await pool.query("UPDATE posts SET comments = $1 WHERE id = $2", [comments, id]);
    res.json({ comments });
  } catch (err) {
    console.error("comment error:", err);
    res.status(500).json({ error: "failed to comment" });
  }
});

app.delete("/api/posts/:id", async (req, res) => {
  const { id } = req.params;
  const { wallet_address } = req.body;
  if (!wallet_address) return res.status(400).json({ error: "wallet_address required" });
  try {
    const p = await pool.query("SELECT * FROM posts WHERE id = $1", [id]);
    if (!p.rows.length) return res.status(404).json({ error: "not found" });
    if (p.rows[0].wallet_address.toLowerCase() !== wallet_address.toLowerCase()) {
      return res.status(403).json({ error: "not owner" });
    }
    await pool.query("DELETE FROM post_comments WHERE post_id = $1", [id]);
    await pool.query("DELETE FROM post_likes WHERE post_id = $1", [id]);
    await pool.query("DELETE FROM posts WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("delete error:", err);
    res.status(500).json({ error: "failed to delete" });
  }
});

app.listen(port, () => {
  console.log("Hextagram on", port);
});

