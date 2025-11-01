// server.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { initDb, query } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "hextagram-secret";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

await initDb();

app.get("/api/config", (req, res) => {
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "dg2xpadhr",
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || "hextagram_unsigned"
  });
});

app.post("/api/auth", async (req, res) => {
  try {
    const { address, message, signature } = req.body;
    if (!address || !message || !signature) {
      return res.status(400).json({ error: "missing params" });
    }

    const recovered = ethers.utils.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: "signature invalid" });
    }

    const addr = address.toLowerCase();

    await query(
      `insert into users (address) values ($1)
       on conflict (address) do nothing`,
      [addr]
    );

    const token = jwt.sign({ address: addr }, JWT_SECRET, {
      expiresIn: "7d"
    });

    res.json({ token, address: addr });
  } catch (err) {
    console.error("auth error", err);
    res.status(500).json({ error: "auth failed" });
  }
});

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: "no token" });
  const token = h.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
}

app.get("/api/profile/me", auth, async (req, res) => {
  const addr = req.user.address;
  const r = await query(
    "select address, username, bio, avatar_url from users where address=$1",
    [addr]
  );
  res.json(r.rows[0] || null);
});

app.put("/api/profile", auth, async (req, res) => {
  const addr = req.user.address;
  const { username, bio, avatar_url } = req.body;

  await query(
    `update users
     set username=$1, bio=$2, avatar_url=$3
     where address=$4`,
    [username || null, bio || null, avatar_url || null, addr]
  );

  const r = await query(
    "select address, username, bio, avatar_url from users where address=$1",
    [addr]
  );
  res.json(r.rows[0]);
});

app.post("/api/posts", auth, async (req, res) => {
  try {
    const addr = req.user.address;
    const { media_url, caption } = req.body;

    if (!media_url) {
      return res.status(400).json({ error: "media_url required" });
    }

    const r = await query(
      `insert into posts (user_address, address, media_url, caption)
       values ($1, $1, $2, $3)
       returning id, user_address, address, media_url, caption, created_at`,
      [addr, media_url, caption || null]
    );

    res.json(r.rows[0]);
  } catch (err) {
    console.error("create post error", err);
    res.status(500).json({ error: "create post failed" });
  }
});

app.get("/api/posts", async (req, res) => {
  const r = await query(
    `select
       p.id,
       coalesce(p.address, p.user_address) as address,
       p.media_url,
       p.caption,
       p.created_at,
       u.username,
       u.avatar_url
     from posts p
     left join users u on u.address = coalesce(p.address, p.user_address)
     order by p.created_at desc
     limit 100`
  );
  res.json(r.rows);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("Hextagram on", PORT);
});

