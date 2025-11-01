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
app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname, "public")));

function genNonce() {
  const r1 = Math.random().toString(36).substring(2);
  const r2 = Date.now().toString(36);
  return r1 + r2;
}

function createJwt(address) {
  return jwt.sign({ address }, JWT_SECRET, { expiresIn: "7d" });
}

async function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h) {
    res.status(401).json({ error: "no token" });
    return;
  }
  const token = h.replace("Bearer ", "");
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: "invalid token" });
  }
}

app.get("/api/auth/nonce/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();
  const nonce = genNonce();
  const sql = "INSERT INTO users(address, nonce) VALUES($1,$2) ON CONFLICT(address) DO UPDATE SET nonce = EXCLUDED.nonce";
  await query(sql, [address, nonce]);
  res.json({ nonce: nonce });
});

app.post("/api/auth/verify", async (req, res) => {
  const address = (req.body.address || "").toLowerCase();
  const signature = req.body.signature;
  if (!address || !signature) {
    res.status(400).json({ error: "missing params" });
    return;
  }
  const dbRes = await query("SELECT nonce FROM users WHERE address = $1", [address]);
  if (dbRes.rows.length === 0) {
    res.status(400).json({ error: "user not found" });
    return;
  }
  const nonce = dbRes.rows[0].nonce;
  const message = "Hextagram login on PulseChain, nonce: " + nonce;
  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature).toLowerCase();
  } catch (e) {
    res.status(400).json({ error: "invalid signature" });
    return;
  }
  if (recovered !== address) {
    res.status(400).json({ error: "address mismatch" });
    return;
  }
  const token = createJwt(address);
  res.json({ token: token });
});

app.get("/api/cf/config", (req, res) => {
  res.json({
    deliveryUrl: process.env.CF_IMAGES_DELIVERY_URL || ""
  });
});

app.post("/api/cf/image-url", authMiddleware, async (req, res) => {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) {
    res.status(500).json({ error: "cloudflare not configured" });
    return;
  }
  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + accountId + "/images/v2/direct_upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiToken
      }
    });
    const data = await r.json();
    if (!data.success) {
      res.status(500).json({ error: "cloudflare error", details: data });
      return;
    }
    res.json({
      uploadURL: data.result.uploadURL,
      id: data.result.id
    });
  } catch (err) {
    res.status(500).json({ error: "cloudflare fetch failed", details: err.message });
  }
});

app.post("/api/posts", authMiddleware, async (req, res) => {
  const media_url = req.body.media_url;
  const media_type = req.body.media_type;
  const caption = req.body.caption || "";
  if (!media_url || !media_type) {
    res.status(400).json({ error: "missing fields" });
    return;
  }
  const user_address = req.user.address;
  const sql = "INSERT INTO posts(user_address, media_url, media_type, caption) VALUES($1,$2,$3,$4) RETURNING *";
  const result = await query(sql, [user_address, media_url, media_type, caption]);
  res.json(result.rows[0]);
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
  const result = await query(sql);
  res.json(result.rows);
});

app.post("/api/posts/:id/like", authMiddleware, async (req, res) => {
  const postId = Number(req.params.id);
  const user_address = req.user.address;
  const sql = "INSERT INTO post_likes(post_id, user_address) VALUES($1,$2) ON CONFLICT DO NOTHING";
  await query(sql, [postId, user_address]);
  res.json({ ok: true });
});

app.post("/api/posts/:id/comment", authMiddleware, async (req, res) => {
  const postId = Number(req.params.id);
  const user_address = req.user.address;
  const content = req.body.content;
  if (!content) {
    res.status(400).json({ error: "no content" });
    return;
  }
  const sql = "INSERT INTO post_comments(post_id, user_address, content) VALUES($1,$2,$3) RETURNING *";
  const result = await query(sql, [postId, user_address, content]);
  res.json(result.rows[0]);
});

app.get("/api/posts/:id/comments", async (req, res) => {
  const postId = Number(req.params.id);
  const sql = "SELECT * FROM post_comments WHERE post_id = $1 ORDER BY created_at ASC";
  const result = await query(sql, [postId]);
  res.json(result.rows);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log("Hextagram running on port " + PORT);
  });
});
