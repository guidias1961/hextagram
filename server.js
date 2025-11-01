// ==================== server.js ====================
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { query, initDb } from "./db.js";
// NOVAS IMPORTAÇÕES PARA UPLOAD
import multer from "multer"; // Para lidar com multipart/form-data
import { create as createW3SClient } from '@web3-storage/w3up';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const JWT_SECRET = process.env.JWT_SECRET || "hextagram_secret_key_2024";
const W3S_TOKEN = process.env.W3S_TOKEN; // Nova variável de ambiente
const PORT = process.env.PORT || 3000;

// Configuração do Multer para armazenar o arquivo em memória
const upload = multer({ storage: multer.memoryStorage() });

// Inicializar banco de dados
await initDb();

// Inicializar cliente W3S (necessário para autenticar a chave)
let w3sClient;
if (W3S_TOKEN) {
    try {
        console.log('Initializing w3up client...');
        w3sClient = await createW3SClient();
        await w3sClient.login(W3S_TOKEN); // Usar o token como email/identificador de login para simplificar
        console.log('✓ w3up client initialized and authenticated');
    } catch (error) {
        console.error('✗ Failed to initialize w3up client:', error);
    }
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

// ============ Rotas de Autenticação ============

// POST /api/auth - Login com assinatura Web3
app.post("/api/auth", async (req, res) => {
  try {
    const { address, message, signature } = req.body;
    
    if (!address || !message || !signature) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Verificar assinatura
    const recoveredAddress = ethers.verifyMessage(message, signature);
    
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: "Invalid signature" });
    }
    
    // Criar ou atualizar usuário
    await query(
      `INSERT INTO users (address) 
       VALUES ($1) 
       ON CONFLICT (address) DO NOTHING`,
      [address.toLowerCase()]
    );
    
    // Gerar token JWT
    const token = jwt.sign(
      { address: address.toLowerCase() },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    
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
// POST /api/upload-media - Upload do arquivo binário para o W3S
app.post("/api/upload-media", authenticate, upload.single('media'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Nenhum arquivo enviado" });
        }
        
        if (!w3sClient) {
            throw new Error("Cliente W3S não inicializado. Verifique W3S_TOKEN.");
        }

        console.log(`📤 Upload de arquivo iniciado: ${req.file.originalname} (${req.file.size} bytes)`);

        // Cria um objeto File para o W3S a partir do buffer
        const file = new File([req.file.buffer], req.file.originalname, { type: req.file.mimetype });
        
        // Faz o upload e a fixação (pinning) no Filecoin/IPFS
        const cid = await w3sClient.uploadFile(file);
        
        console.log(`✓ Upload W3S OK. CID: ${cid}`);

        // Retorna o URL do Gateway para o frontend
        const mediaUrl = `https://${cid}.ipfs.dweb.link/${req.file.originalname}`;

        res.json({ success: true, media_url: mediaUrl });

    } catch (error) {
        console.error("❌ Erro ao fazer upload para W3S:", error);
        res.status(500).json({ error: "Falha ao fazer upload para o IPFS/Filecoin" });
    }
});

// ============ Rotas de Posts ============

// GET /api/posts - Listar todos os posts
app.get("/api/posts", async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        p.id,
        p.user_address as address,
        p.media_url,
        p.caption,
        p.created_at,
        u.username,
        u.avatar_url
       FROM posts p
       LEFT JOIN users u ON u.address = p.user_address
       ORDER BY p.created_at DESC
       LIMIT 100`
    );
    
    res.json(result.rows);
    
  } catch (error) {
    console.error("Get posts error:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// GET /api/posts/:id - Buscar post específico
app.get("/api/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `SELECT 
        p.id,
        p.user_address as address,
        p.media_url,
        p.caption,
        p.created_at,
        u.username,
        u.avatar_url
       FROM posts p
       LEFT JOIN users u ON u.address = p.user_address
       WHERE p.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error("Get post error:", error);
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

// POST /api/posts - Criar novo post (AGORA SÓ RECEBE A URL DO IPFS)
app.post("/api/posts", authenticate, async (req, res) => {
  try {
    const { address } = req.user;
    const { media_url, caption } = req.body;
    
    console.log('📝 Criando post para:', address);
    console.log('   Media URL (IPFS):', media_url);
    console.log('   Caption:', caption);
    
    if (!media_url) {
      return res.status(400).json({ error: "media_url is required" });
    }
    
    const result = await query(
      `INSERT INTO posts (user_address, media_url, caption)
       VALUES ($1, $2, $3)
       RETURNING id, user_address as address, media_url, caption, created_at`,
      [address, media_url, caption || null]
    );
    
    console.log('✓ Post criado com sucesso:', result.rows[0].id);
    
    res.status(201).json(result.rows[0]);
    
  } catch (error) {
    console.error("❌ Erro ao criar post:", error);
    res.status(500).json({ error: "Failed to create post", details: error.message });
  }
});

// DELETE /api/posts/:id - Deletar post (apenas o dono)
app.delete("/api/posts/:id", authenticate, async (req, res) => {
  try {
    const { address } = req.user;
    const { id } = req.params;
    
    // Verificar se o post pertence ao usuário
    const checkResult = await query(
      `SELECT user_address FROM posts WHERE id = $1`,
      [id]
    );
    
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

// ============ Rotas de Perfil ============

// GET /api/profile/me - Buscar perfil do usuário autenticado
app.get("/api/profile/me", authenticate, async (req, res) => {
  try {
    const { address } = req.user;
    
    const result = await query(
      `SELECT address, username, bio, avatar_url, created_at
       FROM users
       WHERE address = $1`,
      [address]
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

// GET /api/profile/:address - Buscar perfil de outro usuário
app.get("/api/profile/:address", async (req, res) => {
  try {
    const { address } = req.params;
    
    const result = await query(
      `SELECT address, username, bio, avatar_url, created_at
       FROM users
       WHERE address = $1`,
      [address.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// PUT /api/profile - Atualizar perfil
app.put("/api/profile", authenticate, async (req, res) => {
  try {
    const { address } = req.user;
    const { username, bio, avatar_url } = req.body;
    
    await query(
      `UPDATE users
       SET username = $1,
           bio = $2,
           avatar_url = $3
       WHERE address = $4`,
      [username || null, bio || null, avatar_url || null, address]
    );
    
    res.json({ ok: true, message: "Profile updated" });
    
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// GET /api/profile/:address/posts - Posts de um usuário específico
app.get("/api/profile/:address/posts", async (req, res) => {
  try {
    const { address } = req.params;
    
    const result = await query(
      `SELECT 
        p.id,
        p.user_address as address,
        p.media_url,
        p.caption,
        p.created_at
       FROM posts p
       WHERE p.user_address = $1
       ORDER BY p.created_at DESC`,
      [address.toLowerCase()]
    );
    
    res.json(result.rows);
    
  } catch (error) {
    console.error("Get user posts error:", error);
    res.status(500).json({ error: "Failed to fetch user posts" });
  }
});

// ============ Rota de Health Check ============
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Hextagram API"
  });
});

// ============ Iniciar Servidor ============
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║      🚀 HEXTAGRAM SERVER RUNNING      ║
╠═══════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(32)}║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(24)}║
║  Database: Connected                  ║
╚═══════════════════════════════════════╝
  `);
});
