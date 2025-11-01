// server.js
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { query, initDb } from "./db.js";
import multer from "multer";
import { Web3Storage, File } from "web3.storage";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "hextagram_secret_key_2024";
const RAW_TOKEN = process.env.W3S_TOKEN || "";
const PORT = process.env.PORT || 3000;

// detecta se é token de web3.storage (começa com "ey" pq é JWT)
const isWeb3Token = RAW_TOKEN.startsWith("ey");
const WEB3_TOKEN = isWeb3Token ? RAW_TOKEN : "";

const uploadsDir = path.join(__dirname, "public", "uploads");
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (err) {
  console.warn("não consegui criar pasta de upload, vou usar data url");
}

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));

const upload = multer({ storage: multer.memoryStorage() });

let w3sClient = null;

async function bootstrap() {
  await initDb();

  if (WEB3_TOKEN) {
    w3sClient = new Web3Storage({ token: WEB3_TOKEN });
    console.log("✓ web3.storage ativo");
  } else {
    console.log("web3.storage desativado (token não é do web3.storage)");
  }

  app.listen(PORT, () => console.log("Hextagram na porta", PORT));
}

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "no auth" });
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
}

// login simples
app.post("/api/auth/simple", async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: "address required" });

    await query(
      `INSERT INTO users (address) VALUES ($1::text)
       ON CONFLICT (address) DO NOTHING`,
      [address.toLowerCase()]
    );

    const token = jwt.sign({ address: address.toLowerCase() }, JWT_SECRET, {
      expiresIn: "7d"
    });

    res.json({ success: true, token, address: address.toLowerCase() });
  } catch (err) {
    console.error("auth simple:", err);
    res.status(500).json({ error: "auth failed" });
  }
});

// upload com 3 fallbacks
app.post("/api/upload-media", auth, upload.single("media"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no file" });

    const buf = req.file.buffer;
    const originalName = req.file.originalname || "image.png";
    const mime = req.file.mimetype || "image/png";

    // 1) tenta web3.storage
    if (w3sClient) {
      try {
        const file = new File([buf], originalName, { type: mime });
        const cid = await w3sClient.put([file], { wrapWithDirectory: false });
        const mediaUrl = `https://${cid}.ipfs.dweb.link`;
        return res.json({ success: true, media_url: mediaUrl, storage: "ipfs" });
      } catch (err) {
        console.warn("falha no web3.storage:", err.message);
      }
    }

    // 2) tenta salvar local
    try {
      const filename =
        Date.now() + "-" + originalName.replace(/\s+/g, "_").toLowerCase();
      const fullPath = path.join(uploadsDir, filename);
      fs.writeFileSync(fullPath, buf);
      const mediaUrl = `/uploads/${filename}`;
      return res.json({ success: true, media_url: mediaUrl, storage: "local" });
    } catch (err) {
      console.warn("falha ao escrever local:", err.message);
    }

    // 3) último recurso: data url
    const b64 = buf.toString("base64");
    const dataUrl = `data:${mime};base64,${b64}`;
    return res.json({ success: true, media_url: dataUrl, storage: "dataurl" });
  } catch (err) {
    console.error("upload error final:", err);
    return res.status(500).json({ error: "upload failed" });
  }
});

// criar post
app.post("/api/posts", auth, async (req, res) => {
  try {
    const { address } = req.user;
    const { media_url, caption } = req.body;
    if (!media_url) return res.status(400).json({ error: "media_url required" });

    const result = await query(
      `INSERT INTO posts (user_address, media_url, caption)
       VALUES ($1::text, $2::text, $3::text)
       RETURNING id, user_address AS address, media_url, caption, created_at`,
      [address, media_url, caption || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("create post:", err);
    res.status(500).json({ error: "failed to create post" });
  }
});

// listar posts
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

app.get("/api/profile/me", auth, async (req, res) => {
  try {
    const { address } = req.user;
    const r = await query(
      `SELECT address, username, bio, avatar_url, created_at
       FROM users WHERE address = $1::text`,
      [address]
    );
    if (r.rows.length === 0) return res.json({ address });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("profile:", err);
    res.status(500).json({ error: "failed to fetch profile" });
  }
});

app.put("/api/profile", auth, async (req, res) => {
  try {
    const { address } = req.user;
    const { username, bio, avatar_url } = req.body;
    await query(
      `UPDATE users SET
        username = $1::text,
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
  res.json({ ok: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

bootstrap();

