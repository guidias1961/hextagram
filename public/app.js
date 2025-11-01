// ==================== app.js ====================

// Estado global
let token = null;
let currentAddress = null;
let currentUser = null;
let selectedFile = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  setupNavigation();
  setupWallet();
  setupUpload();
  setupProfile();
  loadFeed();
}

// ============ Navegação ============
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewName = btn.dataset.view;
      switchView(viewName);
      
      // Atualizar botão ativo
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Carregar conteúdo da view
      if (viewName === 'feed') loadFeed();
      if (viewName === 'explore') loadExplore();
      if (viewName === 'profile') loadProfile();
    });
  });
}

function switchView(viewName) {
  const views = document.querySelectorAll('.view');
  views.forEach(v => v.classList.remove('active'));
  
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.classList.add('active');
  }
}

// ============ Wallet Connection ============
function setupWallet() {
  const connectBtn = document.getElementById('connect-wallet');
  connectBtn.addEventListener('click', connectWallet);
}

async function connectWallet() {
  if (!window.ethereum) {
    alert('MetaMask não encontrado! Por favor, instale a extensão MetaMask.');
    return;
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    
    // Solicitar contas
    const accounts = await provider.send("eth_requestAccounts", []);
    const address = accounts[0];

    // Tentar mudar para PulseChain
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: "0x171" }]);
    } catch (switchError) {
      console.log('Não foi possível mudar para PulseChain', switchError);
    }

    // Assinar mensagem
    const signer = await provider.getSigner();
    const message = `Login to Hextagram\nTimestamp: ${new Date().toISOString()}\nAddress: ${address}`;
    const signature = await signer.signMessage(message);

    // Autenticar no backend
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, message, signature })
    });

    const data = await response.json();
    
    if (data.token) {
      token = data.token;
      currentAddress = data.address;
      updateWalletUI();
      loadFeed();
      loadProfile();
      console.log('✓ Wallet conectada:', currentAddress);
    } else {
      alert('Falha na autenticação');
    }
  } catch (error) {
    console.error('Erro ao conectar wallet:', error);
    alert('Erro ao conectar wallet. Verifique o console.');
  }
}

function updateWalletUI() {
  const walletAddressEl = document.getElementById('wallet-address');
  const connectBtn = document.getElementById('connect-wallet');
  
  if (currentAddress) {
    const shortAddr = `${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}`;
    walletAddressEl.textContent = shortAddr;
    connectBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      Conectado
    `;
  } else {
    walletAddressEl.textContent = 'Não conectado';
  }
}

// ============ Feed ============
async function loadFeed() {
  const feedContainer = document.getElementById('feed-posts');
  feedContainer.innerHTML = '<div class="loading">Carregando feed...</div>';

  try {
    const response = await fetch('/api/posts');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const posts = await response.json();
    
    console.log('Posts carregados:', posts.length);

    if (!Array.isArray(posts) || posts.length === 0) {
      feedContainer.innerHTML = '<div class="loading">Nenhum post ainda. Seja o primeiro a publicar!</div>';
      return;
    }

    feedContainer.innerHTML = '';
    posts.forEach(post => {
      const postEl = createPostElement(post);
      feedContainer.appendChild(postEl);
    });
    
    console.log('✓ Feed renderizado com', posts.length, 'posts');
  } catch (error) {
    console.error('Erro ao carregar feed:', error);
    feedContainer.innerHTML = `<div class="loading" style="color: #ff3040;">Erro ao carregar feed: ${error.message}</div>`;
  }
}

function createPostElement(post) {
  const article = document.createElement('article');
  article.className = 'post';
  
  const username = post.username || shortenAddress(post.address || post.user_address);
  const avatarUrl = post.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.address || post.user_address}`;
  const timeAgo = getTimeAgo(post.created_at);
  
  article.innerHTML = `
    <div class="post-header">
      <img class="post-avatar" src="${avatarUrl}" alt="${username}" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
      <div class="post-user-info">
        <span class="post-username">${username}</span>
        <span class="post-address">${shortenAddress(post.address || post.user_address)}</span>
      </div>
    </div>
    
    <img class="post-image" src="${post.media_url}" alt="Post image" loading="lazy" onerror="this.src='https://via.placeholder.com/600x600?text=Image+Error'">
    
    <div class="post-actions">
      <button class="action-btn like-btn" data-post-id="${post.id}">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
      </button>
      <button class="action-btn comment-btn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
        </svg>
      </button>
      <button class="action-btn share-btn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
    
    <div class="post-likes">
      <span id="likes-${post.id}">0</span> curtidas
    </div>
    
    ${post.caption ? `
      <div class="post-caption">
        <strong>${username}</strong> ${post.caption}
      </div>
    ` : ''}
    
    <div class="post-timestamp">${timeAgo}</div>
    
    <div class="post-comments" id="comments-${post.id}"></div>
    
    <div class="add-comment">
      <input type="text" placeholder="Adicione um comentário..." id="comment-input-${post.id}">
      <button onclick="addComment(${post.id})">Publicar</button>
    </div>
  `;
  
  // Event listeners
  const likeBtn = article.querySelector('.like-btn');
  likeBtn.addEventListener('click', () => toggleLike(post.id, likeBtn));
  
  return article;
}

function toggleLike(postId, btn) {
  const isLiked = btn.classList.contains('liked');
  const likesEl = document.getElementById(`likes-${postId}`);
  let currentLikes = parseInt(likesEl.textContent) || 0;
  
  if (isLiked) {
    btn.classList.remove('liked');
    btn.querySelector('svg').setAttribute('fill', 'none');
    likesEl.textContent = Math.max(0, currentLikes - 1);
  } else {
    btn.classList.add('liked');
    btn.querySelector('svg').setAttribute('fill', 'currentColor');
    likesEl.textContent = currentLikes + 1;
  }
}

function addComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const comment = input.value.trim();
  
  if (!comment) return;
  if (!token) {
    alert('Conecte sua wallet para comentar');
    return;
  }
  
  const commentsContainer = document.getElementById(`comments-${postId}`);
  const commentEl = document.createElement('div');
  commentEl.className = 'comment';
  commentEl.innerHTML = `<strong>você</strong> ${comment}`;
  commentsContainer.appendChild(commentEl);
  
  input.value = '';
}

// ============ Upload ============
function setupUpload() {
  const selectFileBtn = document.getElementById('select-file');
  const fileInput = document.getElementById('file-input');
  const uploadBtn = document.getElementById('upload-btn');
  const preview = document.getElementById('upload-preview');
  
  selectFileBtn.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      selectedFile = file;
      
      // Mostrar preview
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
      };
      reader.readAsDataURL(file);
      
      uploadBtn.disabled = false;
    }
  });
  
  uploadBtn.addEventListener('click', uploadPost);
}

// FUNÇÃO DE UPLOAD REESCRITA PARA USAR A ROTA DO SERVIDOR IPFS
async function uploadPost() {
  if (!token) {
    alert('Conecte sua wallet primeiro!');
    return;
  }
  
  if (!selectedFile) {
    alert('Selecione uma imagem primeiro!');
    return;
  }
  
  const caption = document.getElementById('caption-input').value;
  const statusEl = document.getElementById('upload-status');
  const uploadBtn = document.getElementById('upload-btn');
  const uploadText = document.getElementById('upload-text');
  
  try {
    uploadBtn.disabled = true;
    
    // 1. UPLOAD DA IMAGEM PARA O SEU BACKEND (QUE FARÁ O UPLOAD PARA O IPFS)
    uploadText.textContent = 'Enviando... (1/2)';
    statusEl.textContent = '📤 Fazendo upload da imagem para o IPFS...';
    statusEl.style.color = '#667eea';
    
    console.log('Iniciando upload para o servidor...');
    
    const formData = new FormData();
    formData.append('media', selectedFile); // 'media' é o nome que o Multer espera

    const uploadResponse = await fetch('/api/upload-media', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData // Não defina 'Content-Type', o FormData faz isso corretamente
    });
    
    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      throw new Error(errorData.error || 'Erro no upload da mídia para o IPFS');
    }
    
    const uploadData = await uploadResponse.json();
    const mediaUrl = uploadData.media_url;

    if (!mediaUrl) {
      throw new Error('Servidor não retornou URL do IPFS');
    }
    
    console.log('✓ Upload IPFS OK:', mediaUrl);
    
    // 2. SALVAR POST NO BANCO DE DADOS
    
    statusEl.textContent = '💾 Salvando post no banco de dados... (2/2)';
    uploadText.textContent = 'Salvando...';

    const postData = {
      media_url: mediaUrl, // Usa o URL do IPFS Gateway
      caption: caption.trim() || null
    };
    
    const postResponse = await fetch('/api/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(postData)
    });
    
    if (!postResponse.ok) {
      const errorData = await postResponse.json();
      throw new Error(errorData.error || 'Erro ao salvar post');
    }
    
    const savedPost = await postResponse.json();
    console.log('✓ Post salvo no banco:', savedPost);
    
    statusEl.textContent = '✓ Post publicado com sucesso!';
    statusEl.style.color = '#00ff88';
    
    // Limpar formulário
    selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('caption-input').value = '';
    document.getElementById('upload-preview').innerHTML = `
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
      <p>Selecione uma imagem</p>
    `;
    
    uploadText.textContent = 'Publicar';
    uploadBtn.disabled = false;
    
    // Aguardar 1 segundo e recarregar feed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Voltar para o feed E recarregar
    switchView('feed');
    await loadFeed();
    
    // Ativar botão do feed
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-view="feed"]').classList.add('active');
    
  } catch (error) {
    console.error('❌ Erro ao publicar:', error);
    statusEl.textContent = `✗ Erro: ${error.message}`;
    statusEl.style.color = '#ff3040';
    uploadText.textContent = 'Publicar';
    uploadBtn.disabled = false;
  }
}

// ============ Profile ============
function setupProfile() {
  const editBtn = document.getElementById('edit-profile-btn');
  const modal = document.getElementById('edit-profile-modal');
  const closeBtn = document.getElementById('close-modal');
  const cancelBtn = document.getElementById('cancel-edit');
  const saveBtn = document.getElementById('save-profile');
  
  editBtn.addEventListener('click', () => {
    if (!token) {
      alert('Conecte sua wallet primeiro!');
      return;
    }
    modal.classList.add('active');
    loadProfileData();
  });
  
  closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
  saveBtn.addEventListener('click', saveProfile);
  
  // Fechar ao clicar fora
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
}

async function loadProfile() {
  if (!token) {
    document.getElementById('user-posts').innerHTML = '<div class="loading">Conecte sua wallet para ver seu perfil</div>';
    return;
  }
  
  try {
    // Carregar dados do perfil
    const profileResponse = await fetch('/api/profile/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const profileData = await profileResponse.json();
    currentUser = profileData;
    
    // Atualizar UI
    const username = profileData.username || shortenAddress(profileData.address);
    const avatarUrl = profileData.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileData.address}`;
    
    document.getElementById('profile-username-display').textContent = username;
    document.getElementById('profile-bio-display').textContent = profileData.bio || '';
    document.getElementById('profile-address-display').textContent = shortenAddress(profileData.address);
    document.getElementById('profile-avatar-img').src = avatarUrl;
    
    // Carregar posts do usuário
    const postsResponse = await fetch('/api/posts');
    const allPosts = await postsResponse.json();
    const userPosts = allPosts.filter(p => {
      const postAddress = (p.address || p.user_address || '').toLowerCase();
      return postAddress === profileData.address.toLowerCase();
    });
    
    document.getElementById('posts-count').textContent = userPosts.length;
    
    const grid = document.getElementById('user-posts');
    if (userPosts.length === 0) {
      grid.innerHTML = '<div class="loading">Nenhum post ainda</div>';
    } else {
      grid.innerHTML = '';
      userPosts.forEach(post => {
        const item = document.createElement('div');
        item.className = 'profile-grid-item';
        item.innerHTML = `<img src="${post.media_url}" alt="Post">`;
        grid.appendChild(item);
      });
    }
    
  } catch (error) {
    console.error('Erro ao carregar perfil:', error);
  }
}

async function loadProfileData() {
  if (!currentUser) return;
  
  document.getElementById('edit-username').value = currentUser.username || '';
  document.getElementById('edit-bio').value = currentUser.bio || '';
  document.getElementById('edit-avatar').value = currentUser.avatar_url || '';
}

async function saveProfile() {
  const username = document.getElementById('edit-username').value;
  const bio = document.getElementById('edit-bio').value;
  const avatar_url = document.getElementById('edit-avatar').value;
  
  try {
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ username, bio, avatar_url })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      document.getElementById('edit-profile-modal').classList.remove('active');
      await loadProfile();
      await loadFeed();
    }
  } catch (error) {
    console.error('Erro ao salvar perfil:', error);
    alert('Erro ao salvar perfil');
  }
}

// ============ Explore ============
async function loadExplore() {
  const grid = document.getElementById('explore-grid');
  grid.innerHTML = '<div class="loading">Carregando...</div>';
  
  try {
    const response = await fetch('/api/posts');
    const posts = await response.json();
    
    if (posts.length === 0) {
      grid.innerHTML = '<div class="loading">Nenhum post para explorar</div>';
      return;
    }
    
    grid.innerHTML = '';
    posts.forEach(post => {
      const item = document.createElement('div');
      item.className = 'grid-item';
      item.innerHTML = `<img src="${post.media_url}" alt="Post" loading="lazy">`;
      grid.appendChild(item);
    });
  } catch (error) {
    console.error('Erro ao carregar explorar:', error);
    grid.innerHTML = '<div class="loading" style="color: #ff3040;">Erro ao carregar</div>';
  }
}

// ============ Utilities ============
function shortenAddress(address) {
  if (!address) return 'Unknown';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getTimeAgo(timestamp) {
  if (!timestamp) return 'Agora';
  
  const now = new Date();
  const postDate = new Date(timestamp);
  const diffMs = now - postDate;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  
  return postDate.toLocaleDateString('pt-BR');
}

// Inicializar
updateWalletUI();
