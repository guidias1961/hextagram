// app.js
const API = '';

const state = {
  address: null,
  token: null,
  uploading: false
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

function setView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.dataset.view === view) n.classList.add('active');
    else n.classList.remove('active');
  });

  if (view === 'feed') loadFeed();
  if (view === 'profile') loadProfile();
}

async function connectWallet() {
  try {
    if (window.ethereum && window.ethereum.request) {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      await simpleAuth(accounts[0]);
    } else {
      const manual = prompt('Informe seu endereço 0x');
      if (!manual) return;
      await simpleAuth(manual.trim());
    }
  } catch (err) {
    console.error(err);
    alert('erro ao conectar wallet');
  }
}

async function simpleAuth(address) {
  const resp = await fetch('/api/auth/simple', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address })
  });
  const data = await resp.json();
  if (!resp.ok) {
    alert('falha ao autenticar');
    return;
  }
  state.address = data.address;
  state.token = data.token;
  saveSession();
  updateWalletUI();
  loadFeed();
  loadProfile();
}

function updateWalletUI() {
  const w = document.getElementById('wallet-address');
  if (!w) return;
  if (state.address) {
    w.textContent = `${state.address.slice(0, 6)}...${state.address.slice(-4)}`;
  } else {
    w.textContent = 'Não conectado';
  }
}

async function loadFeed() {
  const box = document.getElementById('feed-posts');
  if (!box) return;
  box.innerHTML = '<p class="muted">Carregando...</p>';
  try {
    const resp = await fetch('/api/posts');
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await resp.text();
      console.error('/api/posts html', txt.slice(0, 200));
      box.innerHTML = '<p class="error">Erro ao carregar posts.</p>';
      return;
    }
    const posts = await resp.json();
    if (!Array.isArray(posts) || posts.length === 0) {
      box.innerHTML = '<p class="muted">Nenhum post ainda</p>';
      return;
    }
    box.innerHTML = '';
    posts.forEach(p => box.appendChild(renderPost(p)));
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p class="error">Erro ao carregar posts.</p>';
  }
}

function renderPost(post) {
  const card = document.createElement('article');
  card.className = 'post-card';

  const header = document.createElement('div');
  header.className = 'post-header';
  header.textContent = post.address
    ? post.address.slice(0, 6) + '...' + post.address.slice(-4)
    : 'user';

  const media = document.createElement('div');
  media.className = 'post-media';
  const type = post.media_type || 'image';
  if (type === 'video') {
    const v = document.createElement('video');
    v.src = post.media_url;
    v.controls = true;
    media.appendChild(v);
  } else {
    const img = document.createElement('img');
    img.src = post.media_url;
    img.alt = post.caption || '';
    media.appendChild(img);
  }

  const caption = document.createElement('p');
  caption.className = 'post-caption';
  caption.textContent = post.caption || '';

  card.appendChild(header);
  card.appendChild(media);
  card.appendChild(caption);
  return card;
}

async function loadProfile() {
  if (!state.token) {
    const el = document.getElementById('profile-address-display');
    if (el) el.textContent = 'Conecte a wallet';
    return;
  }
  try {
    const resp = await fetch('/api/profile/me', {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return;
    const data = await resp.json();
    const addrEl = document.getElementById('profile-address-display');
    const userEl = document.getElementById('profile-username-display');
    const bioEl = document.getElementById('profile-bio-display');
    if (addrEl) addrEl.textContent = data.address || '';
    if (userEl) userEl.textContent = data.username || '(sem nome)';
    if (bioEl) bioEl.textContent = data.bio || '';
  } catch (err) {
    console.error(err);
  }
}

function bindUpload() {
  const fileInput = document.getElementById('file-input');
  const selectBtn = document.getElementById('select-file');
  const captionInput = document.getElementById('caption-input');
  const uploadBtn = document.getElementById('upload-btn');
  const preview = document.getElementById('upload-preview');
  const status = document.getElementById('upload-status');

  if (selectBtn && fileInput) {
    selectBtn.addEventListener('click', () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (!f) {
        if (preview) preview.innerHTML = '<p>Selecione uma imagem</p>';
        if (uploadBtn) uploadBtn.disabled = true;
        return;
      }
      const url = URL.createObjectURL(f);
      if (preview) preview.innerHTML = `<img src="${url}" class="create-preview-img" />`;
      if (uploadBtn) uploadBtn.disabled = false;
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
      if (uploadBtn.disabled) return;
      if (!state.token) {
        alert('conecte a wallet primeiro');
        return;
      }
      const f = fileInput && fileInput.files[0];
      if (!f) {
        alert('selecione uma imagem');
        return;
      }

      status.textContent = 'Enviando...';
      uploadBtn.disabled = true;

      try {
        const fd = new FormData();
        fd.append('media', f);
        const up = await fetch('/api/upload-media', {
          method: 'POST',
          headers: { Authorization: `Bearer ${state.token}` },
          body: fd
        });
        const upData = await up.json();
        if (!up.ok || !upData.media_url) {
          console.error('upload falhou', upData);
          status.textContent = 'Falha no upload';
          uploadBtn.disabled = false;
          return;
        }

        const caption = captionInput ? captionInput.value.trim() : '';
        const postResp = await fetch('/api/posts', {
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
        const postData = await postResp.json();
        if (!postResp.ok) {
          console.error('post falhou', postData);
          status.textContent = 'Erro ao publicar';
          uploadBtn.disabled = false;
          return;
        }

        if (fileInput) fileInput.value = '';
        if (captionInput) captionInput.value = '';
        if (preview) preview.innerHTML = '<p>Selecione uma imagem</p>';
        status.textContent = 'Publicado';
        setView('feed');
      } catch (err) {
        console.error(err);
        status.textContent = 'Erro';
      } finally {
        uploadBtn.disabled = false;
      }
    });
  }
}

function bindNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if (v) setView(v);
    });
  });
}

function bindWallet() {
  const btn = document.getElementById('connect-wallet');
  if (btn) btn.addEventListener('click', connectWallet);
}

document.addEventListener('DOMContentLoaded', () => {
  loadSession();
  bindNav();
  bindWallet();
  bindUpload();
  updateWalletUI();
  setView('feed');
});

