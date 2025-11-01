// server.js
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, query } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const JWT_SECRET = process.env.JWT_SECRET || "hextagram_secret";
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(publicDir, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const HAS_STORACHA =
  process.env.STORACHA_KEY &&
  process.env.STORACHA_PROOF &&
  process.env.STORACHA_SPACE_DID;

let storachaClient = null;

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: "no token" });
  const token = h.split(" ")[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "invalid token" });
  }
}

function guessMediaType(url) {
  const u = url.split("?")[0].toLowerCase();
  if (u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov")) return "video";
  return "image";
}

app.post("/api/auth/simple", async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "address required" });

  await query(
    "INSERT INTO users (address) VALUES ($1) ON CONFLICT (address) DO NOTHING",
    [address.toLowerCase()]
  );

  const token = jwt.sign({ address: address.toLowerCase() }, JWT_SECRET, {
    expiresIn: "7d"
  });

  res.json({ token, address: address.toLowerCase() });
});

app.post("/api/upload-media", auth, upload.single("media"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no file" });

    if (HAS_STORACHA && storachaClient) {
      const file = new File([req.file.buffer], req.file.originalname, {
        type: req.file.mimetype
      });
      const cid = await storachaClient.uploadFile(file);
      const mediaUrl = `https://${cid}.ipfs.storacha.link/${req.file.originalname}`;
      return res.json({
        success: true,
        media_url: mediaUrl,
        media_type: guessMediaType(mediaUrl),
        storage: "storacha"
      });
    }

    const filename =
      Date.now() + "-" + req.file.originalname.replace(/\s+/g, "_").toLowerCase();
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, req.file.buffer);
    const mediaUrl = `/uploads/${filename}`;
    return res.json({
      success: true,
      media_url: mediaUrl,
      media_type: guessMediaType(mediaUrl),
      storage: "local"
    });
  } catch (err) {
    console.error("upload error", err);
    return res.status(500).json({ error: "upload failed", detail: err.message });
  }
});

// upload de avatar
app.post("/api/profile/avatar", auth, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no file" });

    if (HAS_STORACHA && storachaClient) {
      const file = new File([req.file.buffer], req.file.originalname, {
        type: req.file.mimetype
      });
      const cid = await storachaClient.uploadFile(file);
      const avatarUrl = `https://${cid}.ipfs.storacha.link/${req.file.originalname}`;
      return res.json({ success: true, avatar_url: avatarUrl, storage: "storacha" });
    }

    const filename =
      "avatar-" +
      Date.now() +
      "-" +
      req.file.originalname.replace(/\s+/g, "_").toLowerCase();
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, req.file.buffer);
    const avatarUrl = `/uploads/${filename}`;
    return res.json({ success: true, avatar_url: avatarUrl, storage: "local" });
  } catch (err) {
    console.error("upload avatar error", err);
    return res.status(500).json({ error: "upload avatar failed" });
  }
});

app.post("/api/posts", auth, async (req, res) => {
  try {
    const { media_url, caption, media_type } = req.body;
    const address = req.user.address;
    if (!media_url) return res.status(400).json({ error: "media_url required" });

    const mt = media_type || guessMediaType(media_url);

    const r = await query(
      `INSERT INTO posts (user_address, media_url, caption, media_type)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_address AS address, media_url, caption, media_type, created_at`,
      [address, media_url, caption || null, mt]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("create post:", err);
    res.status(500).json({ error: "failed to create post" });
  }
});

app.get("/api/posts", async (req, res) => {
  try {
    const r = await query(
      `SELECT id,
              user_address AS address,
              media_url,
              caption,
              media_type,
              created_at
         FROM posts
         ORDER BY created_at DESC
         LIMIT 200`
    );
    res.json(r.rows);
  } catch (err) {
    console.error("get posts:", err);
    res.status(500).json({ error: "failed to fetch posts" });
  }
});

app.get("/api/profile/me", auth, async (req, res) => {
  const r = await query(
    `SELECT address, username, bio, avatar_url, created_at
       FROM users
      WHERE address = $1`,
    [req.user.address]
  );
  if (r.rows.length === 0) {
    return res.json({ address: req.user.address, username: null, bio: null, avatar_url: null });
  }
  res.json(r.rows[0]);
});

app.put("/api/profile", auth, async (req, res) => {
  const { username, bio, avatar_url } = req.body;
  await query(
    `UPDATE users
        SET username = $1,
            bio = $2,
            avatar_url = $3
      WHERE address = $4`,
    [username || null, bio || null, avatar_url || null, req.user.address]
  );
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use(express.static(publicDir));
app.use("/uploads", express.static(uploadsDir));

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

async function start() {
  await initDb();
  await query(`UPDATE posts SET media_type = 'image' WHERE media_type IS NULL`, []);

  if (HAS_STORACHA) {
    try {
      const { create } = await import("@storacha/client");
      storachaClient = await create({
        principal: process.env.STORACHA_KEY,
        proof: process.env.STORACHA_PROOF,
        space: process.env.STORACHA_SPACE_DID
      });
      console.log("Storacha conectado");
    } catch (err) {
      console.warn("Falha ao iniciar Storacha:", err.message);
    }
  } else {
    console.log("Storacha não configurado, usando local");
  }

  app.listen(PORT, () => console.log("Hextagram na porta", PORT));
}

start();

