// server.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { pool, initDb } from "./db.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "hextagram-secret";

const rawDelivery = process.env.CF_IMAGES_DELIVERY_URL || "";
const CF_IMAGES_DELIVERY_BASE = rawDelivery
  .replace(/\/<image_id>.*$/i, "")
  .replace(/\/+$/, "");
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";

app.use(express.static(path.join(__dirname, "public")));

async function getOrCreateUser(address) {
  const lower = address.toLowerCase();
  const q = await pool.query("select * from users where address = $1", [lower]);
  if (q.rows.length) return q.rows[0];
  const ins = await pool.query(
    "insert into users(address) values($1) returning *",
    [lower]
  );
  return ins.rows[0];
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "no token" });
  const [, token] = auth.split(" ");
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}

// info de config pro front
app.get("/api/cf/config", (req, res) => {
  res.json({
    configured: !!(CF_ACCOUNT_ID && CF_API_TOKEN),
    deliveryBase: CF_IMAGES_DELIVERY_BASE || null
  });
});

// pega upload-url do cloudflare
app.post("/api/cf/image-url", authRequired, async (req, res) => {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    return res.status(500).json({ error: "CF not configured" });
  }
  try {
    // endpoint correto
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v2/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`
        }
      }
    );
    const data = await cfRes.json();
    if (!data.success) {
      console.error("CF upload-url error:", JSON.stringify(data, null, 2));
      return res.status(500).json({
        error: "CF error",
        cf: data
      });
    }
    return res.json({
      uploadURL: data.result.uploadURL,
      id: data.result.id,
      deliveryBase: CF_IMAGES_DELIVERY_BASE
    });
  } catch (e) {
    console.error("CF fetch error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// nonce
app.get("/api/auth/nonce/:address", async (req, res) => {
  const addr = req.params.address.toLowerCase();
  const nonce = "hextagram-" + Math.floor(Math.random() * 1e9);
  await pool.query(
    `insert into wallet_nonces(address, nonce, updated_at)
     values($1,$2,now())
     on conflict(address) do update set nonce = excluded.nonce, updated_at = now()`,
    [addr, nonce]
  );
  res.json({ nonce });
});

// verifica assinatura
app.post("/api/auth/verify", async (req, res) => {
  const { address, signature } = req.body;
  if (!address || !signature) return res.status(400).json({ error: "missing data" });

  const addr = address.toLowerCase();
  const q = await pool.query("select nonce from wallet_nonces where address = $1", [
    addr
  ]);
  if (!q.rows.length) return res.status(400).json({ error: "nonce not found" });

  const nonce = q.rows[0].nonce;
  const message = `Hextagram login on PulseChain, nonce: ${nonce}`;

  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature).toLowerCase();
  } catch {
    return res.status(400).json({ error: "invalid signature" });
  }

  if (recovered !== addr) return res.status(400).json({ error: "address mismatch" });

  await getOrCreateUser(addr);

  const token = jwt.sign({ address: addr }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token });
});

// dados do usuário
app.get("/api/me", authRequired, async (req, res) => {
  const addr = req.user.address;
  const q = await pool.query("select * from users where address = $1", [addr]);
  if (!q.rows.length) {
    const u = await getOrCreateUser(addr);
    return res.json(u);
  }
  res.json(q.rows[0]);
});

// salvar perfil
app.post("/api/me", authRequired, async (req, res) => {
  const addr = req.user.address;
  const { username, bio, avatar_url } = req.body;
  const q = await pool.query(
    `
      update users
      set username = $1, bio = $2, avatar_url = $3
      where address = $4
      returning *
    `,
    [username || null, bio || null, avatar_url || null, addr]
  );
  res.json(q.rows[0]);
});

// posts
app.get("/api/posts", async (req, res) => {
  const q = await pool.query(
    `
    select p.*, u.username, u.avatar_url
    from posts p
    left join users u on u.address = p.user_address
    order by p.created_at desc
    limit 200
    `
  );
  res.json(q.rows);
});

app.post("/api/posts", authRequired, async (req, res) => {
  const addr = req.user.address;
  const { media_url, media_type, caption } = req.body;
  if (!media_url) return res.status(400).json({ error: "media_url required" });
  const ins = await pool.query(
    `
    insert into posts(user_address, media_url, media_type, caption)
    values($1,$2,$3,$4)
    returning *
    `,
    [addr, media_url, media_type || null, caption || null]
  );
  res.json(ins.rows[0]);
});

// front
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log("Hextagram on " + PORT);
    });
  })
  .catch((e) => {
    console.error("DB init error", e);
    process.exit(1);
  });

