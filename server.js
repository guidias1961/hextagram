// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import db from "./db.js";

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_IMAGES_DELIVERY_URL = process.env.CF_IMAGES_DELIVERY_URL; // opcional
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// nonce em memória
const nonces = new Map();
const makeNonce = () => Math.floor(Math.random() * 1_000_000_000).toString();

// pedir nonce
app.get("/api/auth/nonce/:address", (req, res) => {
  const { address } = req.params;
  const nonce = makeNonce();
  nonces.set(address.toLowerCase(), nonce);
  res.json({ nonce });
});

// verificar assinatura (frontend assina, backend só confia)
app.post("/api/auth/verify", (req, res) => {
  const { address, signature } = req.body;
  if (!address || !signature) {
    return res.status(400).json({ error: "address and signature required" });
  }
  const expected = nonces.get(address.toLowerCase());
  if (!expected) {
    return res.status(400).json({ error: "nonce not found" });
  }
  // como a assinatura foi feita na wallet do user, emitimos o token
  const token = jwt.sign(
    { address: address.toLowerCase() },
    JWT_SECRET,
    { expiresIn: "24h" }
  );
  nonces.delete(address.toLowerCase());
  res.json({ token });
});

// middleware de auth
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "no token" });
  const [, token] = header.split(" ");
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "invalid token" });
  }
}

// debug de cloudflare
app.get("/api/cf/debug", (req, res) => {
  res.json({
    hasAccountId: !!CF_ACCOUNT_ID,
    hasApiToken: !!CF_API_TOKEN,
    deliveryUrl: CF_IMAGES_DELIVERY_URL
      ? CF_IMAGES_DELIVERY_URL.replace(/\/+$/, "")
      : CF_ACCOUNT_ID
        ? `https://imagedelivery.net/${CF_ACCOUNT_ID}`
        : null
  });
});

// config para o frontend
app.get("/api/cf/config", (req, res) => {
  if (!CF_ACCOUNT_ID && !CF_IMAGES_DELIVERY_URL) {
    return res.json({ configured: false });
  }
  const deliveryUrl = CF_IMAGES_DELIVERY_URL
    ? CF_IMAGES_DELIVERY_URL.replace(/\/+$/, "")
    : `https://imagedelivery.net/${CF_ACCOUNT_ID}`;
  res.json({
    configured: true,
    deliveryUrl
  });
});

// pedir upload URL do cloudflare
app.post("/api/cf/image-url", auth, async (req, res) => {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    return res.status(400).json({ error: "Cloudflare not configured on server" });
  }

  try {
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v2/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`
        }
      }
    );

    const text = await cfRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("CF non JSON:", text);
      return res.status(500).json({ error: "CF returned non JSON", raw: text });
    }

    if (!data.success) {
      console.error("CF error:", data);
      return res.status(500).json({ error: "CF returned error", details: data });
    }

    return res.json({
      uploadURL: data.result.uploadURL,
      id: data.result.id
    });
  } catch (e) {
    console.error("CF request failed:", e);
    return res.status(500).json({ error: "CF request failed", message: e.message });
  }
});

// profile
app.get("/api/me", auth, async (req, res) => {
  const addr = req.user.address;
  const user = await db.getUser(addr);
  if (!user) {
    await db.upsertUser(addr, "", "", "");
    return res.json({
      address: addr,
      username: "",
      bio: "",
      avatar_url: ""
    });
  }
  res.json(user);
});

app.post("/api/me", auth, async (req, res) => {
  const addr = req.user.address;
  const { username, bio, avatar_url } = req.body;
  await db.upsertUser(addr, username || "", bio || "", avatar_url || "");
  res.json({ ok: true });
});

// posts
app.get("/api/posts", async (req, res) => {
  const posts = await db.getPosts();
  res.json(posts);
});

app.post("/api/posts", auth, async (req, res) => {
  const addr = req.user.address;
  const { media_url, media_type, caption } = req.body;
  if (!media_url) return res.status(400).json({ error: "media_url required" });
  const post = await db.createPost(addr, media_url, media_type || "image", caption || "");
  res.json(post);
});

app.post("/api/posts/:id/like", auth, async (req, res) => {
  const addr = req.user.address;
  const { id } = req.params;
  await db.likePost(id, addr);
  res.json({ ok: true });
});

app.get("/api/posts/:id/comments", async (req, res) => {
  const { id } = req.params;
  const comments = await db.getComments(id);
  res.json(comments);
});

app.post("/api/posts/:id/comment", auth, async (req, res) => {
  const addr = req.user.address;
  const { id } = req.params;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });
  await db.addComment(id, addr, content);
  res.json({ ok: true });
});

// start
const start = async () => {
  await db.init();
  app.listen(PORT, () => {
    console.log("Hextagram listening on", PORT);
  });
};
start();

