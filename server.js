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
app.use(express.json({ limit: "10mb" }));
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

    await query(
      `insert into users (address) values ($1)
       on conflict (address) do nothing`,
      [address.toLowerCase()]
    );

    const token = jwt.sign(
      { address: address.toLowerCase() },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, address: address.toLowerCase() });
  } catch (err) {
    console.error("auth error", err);
    res.status(500).json({ error: "auth fail" });
  }
});

function auth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "no token" });
  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
}

app.get("/api/profile/me", auth, async (req, res) => {
  const address = req.user.address;
  const r = await query(
    "select address, username, bio, avatar_url from users where address=$1",
    [address]
  );
  res.json(r.rows[0] || null);
});

app.get("/api/profile/:address", async (req, res) => {
  const r = await query(
    "select address, username, bio, avatar_url from users where address=$1",
    [req.params.address.toLowerCase()]
  );
  res.json(r.rows[0] || null);
});

app.put("/api/profile", auth, async (req, res) => {
  const address = req.user.address;
  const { username, bio, avatar_url } = req.body;
  await query(
    `update users set
       username = $1,
       bio = $2,
       avatar_url = $3
     where address = $4`,
    [username || null, bio || null, avatar_url || null, address]
  );
  const r = await query(
    "select address, username, bio, avatar_url from users where address=$1",
    [address]
  );
  res.json(r.rows[0]);
});

app.post("/api/posts", auth, async (req, res) => {
  const address = req.user.address;
  const { media_url, caption } = req.body;
  if (!media_url) return res.status(400).json({ error: "media_url required" });

  const r = await query(
    `insert into posts (address, media_url, caption)
     values ($1, $2, $3)
     returning *`,
    [address, media_url, caption || null]
  );

  res.json(r.rows[0]);
});

app.get("/api/posts", async (req, res) => {
  try {
    const r = await query(
      `select
         p.id,
         p.media_url,
         p.caption,
         p.created_at,
         p.address,
         u.username,
         u.avatar_url
       from posts p
       left join users u on u.address = p.address
       order by p.created_at desc
       limit 100`
    );
    res.json(r.rows);
  } catch (err) {
    // fallback se por algum motivo não deu tempo de alterar a tabela
    console.error("feed query error", err);
    const r2 = await query(
      `select id, media_url, caption, created_at
       from posts
       order by created_at desc
       limit 100`
    );
    res.json(r2.rows);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("Hextagram on", PORT);
});

