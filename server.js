import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { query, initDb } from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function genNonce() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function createJwt(address) {
  return jwt.sign({ address }, JWT_SECRET, { expiresIn: "7d" });
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "no token" });
  const token = auth.replace("Bearer ", "");
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
}

app.get("/api/auth/nonce/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();
  const nonce = genNonce();
  const sql =
    "INSERT INTO users(address, nonce) VALUES($1, $2) ON CONFLICT(address) DO UPDATE SET nonce = EXCLUDED.nonce";
  await query(sql, [address, nonce]);
  res.json({ nonce });
});

app.post("/api/auth/verify", async (req, res) => {
  const { address, signature } = req.body;
  if (!address || !signature) {
    return res.status(400).json({ error: "missing params" });
  }
  const addr = address.toLowerCase();
  const { rows } = await query("SELECT nonce FROM users WHERE address = $1", [addr]);
  if (!rows.length) {
    return res.status(400).json({ error: "user not found" });
  }
  const nonce = rows[0].nonce;
  const message = "Hextagram login on PulseChain, nonce: " + nonce;
  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature).toLowerCase();
  } catch (e) {
    return res.status(400).json({ error: "invalid signature" });
  }
  if (recovered !== addr) {
    return res.status(400).json({ error: "address mismatch" });
  }
  const token = createJwt(addr);
  res.json({ token });
});

app.post("/api/posts", authMiddleware, async (req, res) => {
  const { media_url, media_type, caption } = req.body;
  if (!media_url || !media_type) {
    return res.status(400).json({ error: "missing fields" });
  }
  const user_address = req.user.address;
  const { rows } = await query(
    "INSERT INTO posts(user_address, media_url, media_type, caption) VALUES($1,$2,$3,$4) RETURNING *",
    [user_address, media_url, media_type, caption || ""]
  );
  res.json(rows[0]);
});

app.get("/api/posts", async (req, res) => {
  const sql =
    "SELECT p.*, " +
    "COALESCE(l.likes_count,0) AS likes_count, " +
    "COALESCE(c.comments_count,0) AS comments_count " +
    "FROM posts p " +
    "LEFT JOIN (SELECT post_id, COUNT(*) AS likes_count FROM post_likes GROUP BY post_id) l ON l.post_id = p.id " +
    "LEFT JOIN (SELECT post_id, COUNT(*) AS comments_count FROM post_comments GROUP BY post_id) c ON c.post_id = p.id " +
    "ORDER BY p.created_at DESC " +
    "LIMIT 100";
  const { rows } = await query(sql);
  res.json(rows);
});

app.post("/api/posts/:id/like", authMiddleware, async (req, res) => {
  const postId = Number(req.params.id);
  const user_address = req.user.address;
  await query(
    "INSERT INTO post_likes(post_id, user_address) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [postId, user_address]
  );
  res.json({ ok: true });
});

app.post("/api/posts/:id/comment", authMiddleware, async (req, res) => {
  const postId = Number(req.params.id);
  const user_address = req.user.address;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "no content" });
  const { rows } = await query(
    "INSERT INTO post_comments(post_id, user_address, content) VALUES($1,$2,$3) RETURNING *",
    [postId, user_address, content]
  );
  res.json(rows[0]);
});

app.get("/api/posts/:id/comments", async (req, res) => {
  const postId = Number(req.params.id);
  const { rows } = await query(
    "SELECT * FROM post_comments WHERE post_id = $1 ORDER BY created_at ASC",
    [postId]
  );
  res.json(rows);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log("Hextagram running on port " + PORT);
  });
});

