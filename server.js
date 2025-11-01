// server.js
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { query, initDb } from "./db.js";
import multer from "multer";
import { Web3Storage, File } from "web3.storage";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "hextagram_secret_key_2024";
const W3S_TOKEN = process.env.W3S_TOKEN;
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// serve tudo que estiver em public
app.use(express.static(path.join(__dirname, "public")));
// e também o diretório raiz caso o Railway coloque arquivos na raiz
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage() });

let w3sClient = null;

async function bootstrap() {
  await initDb();

  if (W3S_TOKEN) {
    w3sClient = new Web3Storage({ token: W3S_TOKEN });
    console.log("web3.storage ok");
  } else {
    console.warn("W3S_TOKEN não definido");
  }

  app.listen(PORT, () => {
    console.log("Hextagram na porta", PORT);
  });
}

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "missing auth header" });
  const token = auth.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
}

app.post("/api/auth", async (req, res) => {
  try {
    const { address, message, signature } = req.body;
    if (!address || !message || !signature) {
      return res.status(400).json({ error: "missing fields" });
    }

    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: "invalid signature" });
    }

    await query(
      `INSERT INTO users (address) VALUES ($1::text)
       ON CONFLICT (address) DO NOTHING`,
      [address.toLowerCase()]
    );

    const token = jwt.sign(
      { address: address.toLowerCase() },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ success: true, token, address: address.toLowerCase() });
  } catch (err) {
    console.error("auth error:", err);
    res.status(500).json({ error: "auth failed" });
  }
});

app.post("/api/upload-media", authenticate, upload.single("media"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no file" });
    if (!w3sClient) return res.status(500).json({ error: "web3.storage client not ready" });

    const file = new File([req.file.buffer], req.file.originalname, {
      type: req.file.mimetype
    });

    const cid = await w3sClient.put([file], { wrapWithDirectory: false });
    const mediaUrl = `https://${cid}.ipfs.dweb.link`;

    return res.json({ success: true, media_url: mediaUrl });
  } catch (err) {
    console.error("upload error:", err);
    return res.status(500).json({ error: "ipfs upload failed" });
  }
});

app.get("/api/posts", async (req, res) => {
  try {
    const result = await query(
      `SELECT p.id,
              p.user_address AS address,
              p.media_url,
              p.caption,
              p.created_at,
              u.username,
              u.avatar_url
       FROM posts p
       LEFT JOIN users u ON u.address = p.user_address
       ORDER BY p.created_at DESC
       LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("get posts:", err);
    res.status(500).json({ error: "failed to fetch posts" });
  }
});

app.post("/api/posts", authenticate, async (req, res) => {
  try {
    const { address } = req.user;
    const { media_url, caption } = req.body;
    if (!media_url) {
      return res.status(400).json({ error: "media_url is required" });
    }
    const result = await query(
      `INSERT INTO posts (user_address, media_url, caption)
       VALUES ($1::text, $2::text, $3::text)
       RETURNING id, user_address AS address, media_url, caption, created_at`,
      [address, media_url, caption || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("create post error:", err);
    res.status(500).json({ error: "failed to create post" });
  }
});

app.get("/api/profile/me", authenticate, async (req, res) => {
  try {
    const { address } = req.user;
    const result = await query(
      `SELECT address, username, bio, avatar_url, created_at
       FROM users WHERE address = $1::text`,
      [address]
    );
    if (result.rows.length === 0) {
      return res.json({ address });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("profile:", err);
    res.status(500).json({ error: "failed to fetch profile" });
  }
});

app.put("/api/profile", authenticate, async (req, res) => {
  try {
    const { address } = req.user;
    const { username, bio, avatar_url } = req.body;
    await query(
      `UPDATE users
       SET username = $1::text,
           bio = $2::text,
           avatar_url = $3::text
       WHERE address = $4::text`,
      [username || null, bio || null, avatar_url || null, address]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("update profile:", err);
    res.status(500).json({ error: "failed to update profile" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

bootstrap();

