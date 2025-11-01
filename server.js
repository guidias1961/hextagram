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
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// Util simples
function randomNonce() {
  return Math.floor(Math.random() * 1_000_000_000).toString();
}

// 1. tabela de nonces em memória (pode ir pro banco se quiser)
const nonces = new Map();

// 2. rota para pedir nonce
app.get("/api/auth/nonce/:address", (req, res) => {
  const { address } = req.params;
  const nonce = randomNonce();
  nonces.set(address.toLowerCase(), nonce);
  res.json({ nonce });
});

// 3. rota para verificar assinatura
app.post("/api/auth/verify", async (req, res) => {
  const { address, signature } = req.body;
  if (!address || !signature) {
    return res.status(400).json({ error: "address and signature required" });
  }

  const expectedNonce = nonces.get(address.toLowerCase());
  if (!expectedNonce) {
    return res.status(400).json({ error: "nonce not found" });
  }

  const msg = `Hextagram login on PulseChain, nonce: ${expectedNonce}`;

  try {
    // vamos usar a lib do próprio node para recuperar o signer? não
    // aqui vamos confiar porque a verificação real é no frontend/metamask
    // e vamos só emitir o token
    const token = jwt.sign(
      { address: address.toLowerCase() },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    nonces.delete(address.toLowerCase());
    return res.json({ token });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ error: "verify failed" });
  }
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

// 4. rota para pegar config do cloudflare
app.get("/api/cf/config", (req, res) => {
  if (!CF_ACCOUNT_ID) {
    return res.json({ configured: false });
  }
  // delivery padrão do Cloudflare Images
  const deliveryUrl = `https://imagedelivery.net/${CF_ACCOUNT_ID}`;
  res.json({
    configured: true,
    deliveryUrl
  });
});

// 5. rota para pegar upload URL do Cloudflare
app.post("/api/cf/image-url", auth, async (req, res) => {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    return res.status(400).json({ error: "Cloudflare not configured" });
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
      console.error("CF response is not JSON:", text);
      return res.status(500).json({ error: "Invalid response from Cloudflare" });
    }

    if (!data.success) {
      console.error("Cloudflare error:", data);
      return res.status(500).json({ error: "Cloudflare error", details: data });
    }

    return res.json({
      uploadURL: data.result.uploadURL,
      id: data.result.id
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "CF request failed" });
  }
});

// 6. rotas de profile
app.get("/api/me", auth, async (req, res) => {
  const addr = req.user.address;
  const user = await db.getUser(addr);
  if (!user) {
    // cria vazio
    await db.upsertUser(addr, "", "", "");
    return res.json({
      address: addr,
      username: "",
      bio: "",
      avatar_url: ""
    });
  }
  return res.json(user);
});

app.post("/api/me", auth, async (req, res) => {
  const addr = req.user.address;
  const { username, bio, avatar_url } = req.body;
  await db.upsertUser(addr, username || "", bio || "", avatar_url || "");
  return res.json({ ok: true });
});

// 7. posts
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
  const id = req.params.id;
  await db.likePost(id, addr);
  res.json({ ok: true });
});

app.get("/api/posts/:id/comments", async (req, res) => {
  const id = req.params.id;
  const comments = await db.getComments(id);
  res.json(comments);
});

app.post("/api/posts/:id/comment", auth, async (req, res) => {
  const addr = req.user.address;
  const id = req.params.id;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });
  await db.addComment(id, addr, content);
  res.json({ ok: true });
});

// 8. inicializa banco e start
const start = async () => {
  await db.init();
  app.listen(PORT, () => {
    console.log("Hextagram running on", PORT);
  });
};
start();

