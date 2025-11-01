// app.js
// Hextagram frontend logic

const API_BASE = '';

let state = {
  address: null,
  token: null,
  currentView: 'feed',
  uploading: false
};

const els = {
  feedBtn: document.getElementById('nav-feed'),
  exploreBtn: document.getElementById('nav-explore'),
  createBtn: document.getElementById('nav-create'),
  profileBtn: document.getElementById('nav-profile'),
  walletStatus: document.getElementById('wallet-status'),
  walletBtn: document.getElementById('wallet-connect'),
  viewFeed: document.getElementById('view-feed'),
  viewExplore: document.getElementById('view-explore'),
  viewCreate: document.getElementById('view-create'),
  viewProfile: document.getElementById('view-profile'),
  feedPosts: document.getElementById('feed-posts'),
  createFile: document.getElementById('create-file'),
  createCaption: document.getElementById('create-caption'),
  createPreview: document.getElementById('create-preview'),
  createSubmit: document.getElementById('create-submit'),
  profileBox: document.getElementById('profile-box')
};

function saveSession() {
  if (state.token && state.address) {
    localStorage.setItem('hex_token', state.token);
    localStorage.setItem('hex_address', state.address);
  }
}

function loadSession() {
  const t = localStorage.getItem('hex_token');
  const a = localStorage.getItem('hex_address');
  if (t && a) {
    state.token = t;
    state.address = a;
  }
}

function setView(name) {
  state.currentView = name;
  const all = [els.viewFeed, els.viewExplore, els.viewCreate, els.viewProfile];
  all.forEach(v => {
    if (v) v.style.display = 'none';
  });
  if (name === 'feed' && els.viewFeed) els.viewFeed.style.display = 'block';
  if (name === 'explore' && els.viewExplore) els.viewExplore.style.display = 'block';
  if (name === 'create' && els.viewCreate) els.viewCreate.style.display = 'block';
  if (name === 'profile' && els.viewProfile) els.viewProfile.style.display = 'block';

  if (name === 'feed') loadFeed();
  if (name === 'profile') loadProfile();
}

async function connectWallet() {
  try {
    if (window.ethereum && window.ethereum.request) {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const addr = accounts[0];
      await simpleAuth(addr);
    } else {
      const manual = prompt('Informe seu endereço (0x...)');
      if (!manual) return;
      await simpleAuth(manual.trim());
    }
  } catch (err) {
    alert('erro ao conectar wallet');
    console.error(err);
  }
}

async function simpleAuth(address) {
  const resp = await fetch(`${API_BASE}/api/auth/simple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address })
  });
  const data = await resp.json();
  if (data.token) {
    state.token = data.token;
    state.address = data.address;
    saveSession();
    refreshWalletStatus();
    loadFeed();
    loadProfile();
  } else {
    alert('falha ao autenticar');
  }
}

function refreshWalletStatus() {
  if (!els.walletStatus) return;
  if (state.address) {
    els.walletStatus.textContent = `Conectado ${state.address.slice(0, 6)}...${state.address.slice(-4)}`;
  } else {
    els.walletStatus.textContent = 'Não conectado';
  }
}

async function loadFeed() {
  if (!els.feedPosts) return;
  els.feedPosts.innerHTML = '<p class="muted">Carregando...</p>';
  try {
    const resp = await fetch(`${API_BASE}/api/posts`);
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await resp.text();
      console.error('Resposta não JSON de /api/posts:', txt);
      els.feedPosts.innerHTML = '<p class="error">Erro ao carregar posts.</p>';
      return;
    }
    const posts = await resp.json();
    if (!Array.isArray(posts) || posts.length === 0) {
      els.feedPosts.innerHTML = '<p class="muted">Nenhum post ainda</p>';
      return;
    }
    els.feedPosts.innerHTML = '';
    posts.forEach(renderPost);
  } catch (err) {
    console.error(err);
    els.feedPosts.innerHTML = '<p class="error">Erro ao carregar posts.</p>';
  }
}

function renderPost(post) {
  const card = document.createElement('div');
  card.className = 'post-card';

  const header = document.createElement('div');
  header.className = 'post-header';
  const name = post.address ? post.address.slice(0, 6) + '...' + post.address.slice(-4) : 'user';
  header.textContent = name;

  const mediaBox = document.createElement('div');
  mediaBox.className = 'post-media';

  const type = post.media_type || 'image';
  if (type === 'video') {
    const video = document.createElement('video');
    video.src = post.media_url;
    video.controls = true;
    mediaBox.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = post.media_url;
    img.alt = post.caption || '';
    mediaBox.appendChild(img);
  }

  const caption = document.createElement('p');
  caption.className = 'post-caption';
  caption.textContent = post.caption || '';

  card.appendChild(header);
  card.appendChild(mediaBox);
  card.appendChild(caption);

  els.feedPosts.appendChild(card);
}

async function loadProfile() {
  if (!state.token) {
    if (els.profileBox) els.profileBox.innerHTML = '<p>Conecte a wallet primeiro.</p>';
    return;
  }
  try {
    const resp = await fetch(`${API_BASE}/api/profile/me`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const t = await resp.text();
      console.error('profile não json', t);
      if (els.profileBox) els.profileBox.innerHTML = '<p>Erro ao carregar perfil</p>';
      return;
    }
    const data = await resp.json();
    if (els.profileBox) {
      els.profileBox.innerHTML = `
        <h2>Perfil</h2>
        <p><strong>Address</strong> ${data.address || ''}</p>
        <p><strong>Username</strong> ${data.username || '-'}</p>
        <p><strong>Bio</strong> ${data.bio || '-'}</p>
      `;
    }
  } catch (err) {
    console.error(err);
    if (els.profileBox) els.profileBox.innerHTML = '<p>Erro ao carregar perfil</p>';
  }
}

function handleFileChange() {
  const file = els.createFile.files[0];
  if (!file) {
    els.createPreview.innerHTML = '';
    return;
  }
  const url = URL.createObjectURL(file);
  els.createPreview.innerHTML = `<img src="${url}" alt="preview" class="create-preview-img" />`;
}

async function handleCreateSubmit() {
  if (state.uploading) return;
  if (!state.token) {
    alert('conecte a wallet primeiro');
    return;
  }
  const file = els.createFile.files[0];
  if (!file) {
    alert('selecione uma imagem');
    return;
  }
  state.uploading = true;
  els.createSubmit.disabled = true;
  els.createSubmit.textContent = 'Enviando...';

  try {
    // 1. upload
    const fd = new FormData();
    fd.append('media', file);
    const up = await fetch(`${API_BASE}/api/upload-media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.token}` },
      body: fd
    });
    const ct = up.headers.get('content-type') || '';
    const upData = ct.includes('application/json') ? await up.json() : {};
    if (!upData.success || !upData.media_url) {
      console.error('upload falhou', upData);
      alert('upload falhou');
      return;
    }

    // 2. criar post
    const caption = els.createCaption.value.trim();
    const postResp = await fetch(`${API_BASE}/api/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${state.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        media_url: upData.media_url,
        caption,
        media_type: upData.media_type || 'image'
      })
    });
    const postCt = postResp.headers.get('content-type') || '';
    const postData = postCt.includes('application/json') ? await postResp.json() : null;
    if (!postResp.ok) {
      console.error('erro ao criar post', postData);
      alert('erro ao criar post');
      return;
    }

    // reset
    els.createFile.value = '';
    els.createCaption.value = '';
    els.createPreview.innerHTML = '';
    alert('post publicado');
    setView('feed');
  } catch (err) {
    console.error(err);
    alert('erro ao publicar');
  } finally {
    state.uploading = false;
    els.createSubmit.disabled = false;
    els.createSubmit.textContent = 'Publicar';
  }
}

function bindEvents() {
  if (els.feedBtn) els.feedBtn.addEventListener('click', () => setView('feed'));
  if (els.exploreBtn) els.exploreBtn.addEventListener('click', () => setView('explore'));
  if (els.createBtn) els.createBtn.addEventListener('click', () => setView('create'));
  if (els.profileBtn) els.profileBtn.addEventListener('click', () => setView('profile'));
  if (els.walletBtn) els.walletBtn.addEventListener('click', connectWallet);
  if (els.createFile) els.createFile.addEventListener('change', handleFileChange);
  if (els.createSubmit) els.createSubmit.addEventListener('click', handleCreateSubmit);
}

function init() {
  loadSession();
  bindEvents();
  refreshWalletStatus();
  setView('feed');
}

document.addEventListener('DOMContentLoaded', init);

