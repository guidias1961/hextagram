// ==================== server.js (Versão Final de Arquitetura) ====================
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { query, initDb } from "./db.js";
import multer from "multer"; 
import { Web3Storage } from 'web3.storage';

const app = express();

// Definições Globais
const JWT_SECRET = process.env.JWT_SECRET || "hextagram_secret_key_2024";
const W3S_TOKEN = process.env.W3S_TOKEN; 
const PORT = process.env.PORT || 3000;

// Configuração do Multer (memória)
const upload = multer({ storage: multer.memoryStorage() });

// =========================================================
// 1. MIDDLEWARES PRIMÁRIOS (DEVE FICAR NO TOPO)
// =========================================================
app.use(cors());
app.use(express.json());

// SERVIR ARQUIVOS ESTÁTICOS (HTML, CSS, JS, IMAGES)
app.use(express.static("public"));

// =========================================================
// 2. INICIALIZAÇÃO E CLIENTES ASSÍNCRONOS (Função main)
// =========================================================
let w3sClient = null;

async function main() {
    try {
        // Inicializar banco de dados
        await initDb();
        
        // Inicializar cliente W3S (só se o token existir)
        if (W3S_TOKEN) {
            console.log('Initializing Web3Storage client...');
            w3sClient = new Web3Storage({ token: W3S_TOKEN });
            console.log('✓ Web3Storage client initialized');
        }
    } catch (error) {
        console.error('❌ Falha na Inicialização (DB/W3S). O servidor continuará rodando, mas funcionalidades podem falhar.', error);
    }
    
    // Iniciar o servidor Express após a inicialização (Se não houver erro)
    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════╗
║      🚀 HEXTAGRAM SERVER RUNNING      ║
╠═══════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(32)}║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(24)}║
║  Database: Ready/Checked              ║
╚═══════════════════════════════════════╝
      `);
    });
}

// ============ Middleware de Autenticação ============
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header missing" });
  }
  
  const token = authHeader.split(" ")[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ============ Rotas de Autenticação e API (Rotas de Usuário) ============
// POST /api/auth - Login com assinatura Web3
app.post("/api/auth", async (req, res) => {
  try {
    // ... (Lógica de autenticação)
    const { address, message, signature } = req.body;
    
    if (!address || !message || !signature) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const recoveredAddress = ethers.verifyMessage(message, signature);
    
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: "Invalid signature" });
    }
    
    await query(
      `INSERT INTO users (address) VALUES ($1) ON CONFLICT (address) DO NOTHING`,
      [address.toLowerCase()]
    );
    
    const token = jwt.sign({ address: address.toLowerCase() }, JWT_SECRET, { expiresIn: "7d" });
    
    res.json({
      success: true,
      token,
      address: address.toLowerCase()
    });
    
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// ============ NOVA ROTA: Upload de Mídia para IPFS ============
app.post("/api/upload-media", authenticate, upload.single('media'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Nenhum arquivo enviado" });
        }
        
        if (!w3sClient) {
            return res.status(500).json({ error: "Cliente Web3Storage não inicializado. Verifique W3S_TOKEN." });
        }

        console.log(`📤 Upload de arquivo iniciado: ${req.file.originalname} (${req.file.size} bytes)`);
        const files = [new File([req.file.buffer], req.file.originalname, { type: req.file.mimetype })];
        const cid = await w3sClient.put(files);
        
        console.log(`✓ Upload W3S OK. CID: ${cid}`);

        const mediaUrl = `https://${cid}.ipfs.dweb.link/${req.file.originalname}`;

        res.json({ success: true, media_url: mediaUrl });

    } catch (error) {
        console.error("❌ Erro ao fazer upload para W3S:", error);
        res.status(500).json({ error: "Falha ao fazer upload para o IPFS/Filecoin" });
    }
});


// ============ Rotas de Posts (GET, POST, DELETE) ============
// GET /api/posts - Listar todos os posts
app.get("/api/posts", async (req, res) => {
  try {
    const result = await query(
      `SELECT p.id, p.user_address as address, p.media_url, p.caption, p.created_at, u.username, u.avatar_url
       FROM posts p LEFT JOIN users u ON u.address = p.user_address
       ORDER BY p.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get posts error:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// POST /api/posts - Criar novo post 
app.post("/api/posts", authenticate, async (req, res) => {
  try {
    const { address } = req.user;
    const { media_url, caption } = req.body;
    
    if (!media_url) {
      return res.status(400).json({ error: "media_url is required" });
    }
    
    const result = await query(
      `INSERT INTO posts (user_address, media_url, caption)
       VALUES ($1, $2, $3)
       RETURNING id, user_address as address, media_url, caption, created_at`,
      [address, media_url, caption || null]
    );
    
    res.status(201).json(result.rows[0]);
    
  } catch (error) {
    console.error("❌ Erro ao criar post:", error);
    res.status(500).json({ error: "Failed to create post", details: error.message });
  }
});

// DELETE /api/posts/:id - Deletar post (apenas o dono)
app.delete("/api/posts/:id", authenticate, async (req, res) => {
    // ... (Lógica de exclusão)
  try {
    const { address } = req.user;
    const { id } = req.params;
    
    const checkResult = await query(`SELECT user_address FROM posts WHERE id = $1`, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }
    
    if (checkResult.rows[0].user_address !== address) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    
    await query(`DELETE FROM posts WHERE id = $1`, [id]);
    
    res.json({ success: true, message: "Post deleted" });
    
  } catch (error) {
    console.error("Delete post error:", error);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// ============ Rotas de Perfil (GET, PUT) ============
// GET /api/profile/me - Buscar perfil do usuário autenticado
app.get("/api/profile/me", authenticate, async (req, res) => {
    // ... (Lógica de perfil)
  try {
    const { address } = req.user;
    const result = await query(
      `SELECT address, username, bio, avatar_url, created_at FROM users WHERE address = $1`, [address]
    );
    
    if (result.rows.length === 0) {
      return res.json({ address });
    }
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// PUT /api/profile - Atualizar perfil
app.put("/api/profile", authenticate, async (req, res) => {
    // ... (Lógica de atualização)
  try {
    const { address } = req.user;
    const { username, bio, avatar_url } = req.body;
    
    await query(
      `UPDATE users SET username = $1, bio = $2, avatar_url = $3 WHERE address = $4`,
      [username || null, bio || null, avatar_url || null, address]
    );
    
    res.json({ ok: true, message: "Profile updated" });
    
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Rota de Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Executa a função principal para iniciar o servidor
main();
