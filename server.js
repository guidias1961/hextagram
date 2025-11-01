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
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

// login: gera nonce
app.get("/api/auth/nonce/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();
  const nonce = genNonce();
  await query(
    `INSERT INTO users(address, nonce)
     VALUES($1,$2)
     ON CONFLICT(address) DO UPDATE SET nonce = EXCLUDED.nonce`,
    [address, nonce]
  );
  res.json({ nonce });
});

// login: verifica assinatura
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
  const msg = "Hextagram login on PulseChain, nonce: " + nonce;

  let recovered;
  try {
    recovered = ethers.verifyMessage(msg, signature).toLowerCase();
  } catch (e) {
    res.status(400).json({ error: "invalid signature" });
    return;
  }

  if (recovered !== address) {
    res.status(400).json({ error: "address mismatch" });
    return;
  }

  const token = createJwt(address);
  res.json({ token });
});

// perfil do usuário logado
app.get("/api/me", authMiddleware, async (req, res) => {
  const address = req.user.address.toLowerCase();
  const r = await query(
    "SELECT address, username, bio, avatar_url FROM users WHERE address = $1",
    [address]
  );
  res.json(r.rows[0]);
});

// atualizar perfil do logado
app.post("/api/me", authMiddleware, async (req, res) => {
  const address = req.user.address.toLowerCase();
  const username = (req.body.username || "").trim();
  const bio = (req.body.bio || "").trim();
  const avatar_url = (req.body.avatar_url || "").trim();
  const r = await query(
    `UPDATE users
     SET username = $2, bio = $3, avatar_url = $4
     WHERE address = $1
     RETURNING address, username, bio, avatar_url`,
    [address, username, bio, avatar_url]
  );
  res.json(r.rows[0]);
});

// perfil público
app.get("/api/profile/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();
  const r = await query(
    "SELECT address, username, bio, avatar_url FROM users WHERE address = $1",
    [address]
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(r.rows[0]);
});

// pegar config do Cloudflare
app.get("/api/cf/config", (req, res) => {
  res.json({
    deliveryUrl: process.env.CF_IMAGES_DELIVERY_URL || ""
  });
});

// pedir upload URL no Cloudflare
app.post("/api/cf/image-url", authMiddleware, async (req, res) => {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) {
    res.status(500).json({ error: "cloudflare not configured" });
    return;
  }
  const r = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" +
      accountId +
      "/images/v2/direct_upload",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiToken
      }
    }
  );
  const data = await r.json();
  if (!data.success) {
    res.status(500).json({ error: "cloudflare error", details: data });
    return;
  }
  res.json({
    uploadURL: data.result.uploadURL,
    id: data.result.id
  });
});

// criar post
app.post("/api/posts", authMiddleware, async (req, res) => {
  const media_url = req.body.media_url;
  const media_type = req.body.media_type;
  const caption = req.body.caption || "";
  if (!media_url || !media_type) {
    res.status(400).json({ error: "missing fields" });
    return;
  }
  const user_address = req.user.address.toLowerCase();
  const result = await query(
    `INSERT INTO posts(user_address, media_url, media_type, caption)
     VALUES($1,$2,$3,$4)
     RETURNING *`,
    [user_address, media_url, media_type, caption]
  );
  res.json(result.rows[0]);
});

// feed
app.get("/api/posts", async (req, res) => {
  const result = await query(`
    SELECT
      p.*,
      COALESCE(l.likes_count,0) AS likes_count,
      COALESCE(c.comments_count,0) AS comments_count,
      u.username,
      u.avatar_url
    FROM posts p
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS likes_count
      FROM post_likes
      GROUP BY post_id
    ) l ON l.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS comments_count
      FROM post_comments
      GROUP BY post_id
    ) c ON c.post_id = p.id
    LEFT JOIN users u ON u.address = p.user_address
    ORDER BY p.created_at DESC
    LIMIT 100
  `);
  res.json(result.rows);
});

// like
app.post("/api/posts/:id/like", authMiddleware, async (req, res) => {
  const postId = Number(req.params.id);
  const user_address = req.user.address.toLowerCase();
  await query(
    "INSERT INTO post_likes(post_id, user_address) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [postId, user_address]
  );
  res.json({ ok: true });
});

// comentar
app.post("/api/posts/:id/comment", authMiddleware, async (req, res) => {
  const postId = Number(req.params.id);
  const user_address = req.user.address.toLowerCase();
  const content = req.body.content;
  if (!content) {
    res.status(400).json({ error: "no content" });
    return;
  }
  const result = await query(
    "INSERT INTO post_comments(post_id, user_address, content) VALUES($1,$2,$3) RETURNING *",
    [postId, user_address, content]
  );
  res.json(result.rows[0]);
});

// pegar comentários
app.get("/api/posts/:id/comments", async (req, res) => {
  const postId = Number(req.params.id);
  const result = await query(
    "SELECT * FROM post_comments WHERE post_id = $1 ORDER BY created_at ASC",
    [postId]
  );
  res.json(result.rows);
});

// SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

await initDb();
app.listen(PORT, () => {
  console.log("Hextagram running on port " + PORT);
});

