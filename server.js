import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import multer from "multer";
import { fileURLToPath } from "url";
import path from "path";
import { initDb, query } from "./db.js";
import { create as storachaCreate } from "@storacha/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const JWT_SECRET = process.env.JWT_SECRET || "hextagram_secret";
const PORT = process.env.PORT || 3000;

const STORACHA_KEY = process.env.STORACHA_KEY || "";
const STORACHA_PROOF = process.env.STORACHA_PROOF || "";
const STORACHA_SPACE_DID = process.env.STORACHA_SPACE_DID || "";

let storachaClient = null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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
    if (!storachaClient) return res.status(500).json({ error: "storacha not ready" });

    const file = new File([req.file.buffer], req.file.originalname, {
      type: req.file.mimetype
    });

    const cid = await storachaClient.uploadFile(file);
    const url = `https://${cid}.ipfs.storacha.link/${req.file.originalname}`;
    return res.json({ success: true, media_url: url });
  } catch (err) {
    console.error("storacha upload error", err);
    return res.status(500).json({ error: "upload failed", detail: err.message });
  }
});

app.post("/api/posts", auth, async (req, res) => {
  const { address } = req.user;
  const { media_url, caption } = req.body;
  if (!media_url) return res.status(400).json({ error: "media_url required" });

  const r = await query(
    `INSERT INTO posts (user_address, media_url, caption)
     VALUES ($1, $2, $3)
     RETURNING id, user_address AS address, media_url, caption, created_at`,
    [address, media_url, caption || null]
  );
  res.status(201).json(r.rows[0]);
});

app.get("/api/posts", async (req, res) => {
  const r = await query(
    `SELECT id, user_address AS address, media_url, caption, created_at
     FROM posts
     ORDER BY created_at DESC
     LIMIT 200`
  );
  res.json(r.rows);
});

app.get("/api/profile/me", auth, async (req, res) => {
  const r = await query(
    `SELECT address, username, bio, avatar_url, created_at
     FROM users WHERE address = $1`,
    [req.user.address]
  );
  if (r.rows.length === 0) return res.json({ address: req.user.address });
  res.json(r.rows[0]);
});

async function start() {
  await initDb();

  if (STORACHA_KEY && STORACHA_PROOF && STORACHA_SPACE_DID) {
    storachaClient = await storachaCreate({
      principal: STORACHA_KEY,
      proof: STORACHA_PROOF,
      space: STORACHA_SPACE_DID
    });
    console.log("Storacha conectado ao space", STORACHA_SPACE_DID);
  } else {
    console.warn("Storacha vars faltando, configure no Railway");
  }

  app.listen(PORT, () => {
    console.log("Hextagram na porta", PORT);
  });
}

start();

