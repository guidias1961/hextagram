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

const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));

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
  const lower = url.split("?")[0].toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov")) return "video";
  return "image";
}

app.post("/api/auth/simple", async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "address required" });
  await query(
    "INSERT INTO users (address) VALUES ($1) ON CONFLICT (address) DO NOTHING",
    [address.toLowerCase()]
  );
  const token = jwt.sign({ address: address.toLowerCase() }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, address: address.toLowerCase() });
});

app.post("/api/upload-media", auth, upload.single("media"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no file" });

    const filename =
      Date.now() + "-" + req.file.originalname.replace(/\s+/g, "_").toLowerCase();
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, req.file.buffer);
    const mediaUrl = `/uploads/${filename}`;

    return res.json({
      success: true,
      media_url: mediaUrl,
      media_type: guessMediaType(mediaUrl)
    });
  } catch (err) {
    console.error("upload error", err);
    return res.status(500).json({ error: "upload failed" });
  }
});

app.post("/api/posts", auth, async (req, res) => {
  try {
    const { address } = req.user;
    const { media_url, caption, media_type } = req.body;

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
  const r = await query(
    `SELECT id, user_address AS address, media_url, caption, media_type, created_at
     FROM posts
     ORDER BY created_at DESC
     LIMIT 200`
  );
  res.json(r.rows);
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log("Hextagram na porta", PORT);
  });
}
start();

