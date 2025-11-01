// public/app.js sem ethers

let token = null;
let currentAddress = null;
let selectedFile = null;
let currentUser = null;

document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupWallet();
  setupUpload();
  setupProfile();
  loadFeed();
});

function setupNavigation() {
  const buttons = document.querySelectorAll(".nav-item");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      switchView(view);
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (view === "feed") loadFeed();
      if (view === "explore") loadExplore();
      if (view === "profile") loadProfile();
    });
  });
}

function switchView(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
}

function setupWallet() {
  const btn = document.getElementById("connect-wallet");
  btn.addEventListener("click", connectWallet);
  updateWalletUI();
}

async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask não encontrada");
    return;
  }

  try {
    // pedir conta
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts"
    });
    const address = accounts[0];

    // tentar trocar para pulsechain, se não der segue
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x171" }]
      });
    } catch (err) {
      console.log("não trocou para 0x171, seguindo", err.message);
    }

    // construir mensagem
    const message = `Login to Hextagram\n${new Date().toISOString()}\n${address}`;

    // tentar assinar via personal_sign
    let signature = null;
    try {
      signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address]
      });
    } catch (err) {
      console.log("personal_sign falhou, vou usar login simples");
    }

    // mandar para o backend
    let resp;
    if (signature) {
      resp = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, message, signature })
      });
    } else {
      resp = await fetch("/api/auth/simple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address })
      });
    }

    const data = await resp.json();
    if (!resp.ok) {
      alert(data.error || "erro ao autenticar");
      return;
    }

    token = data.token;
    currentAddress = data.address;
    updateWalletUI();
    loadFeed();
    loadProfile();
  } catch (err) {
    console.error("connectWallet error:", err);
    alert(err.message || "erro ao conectar wallet");
  }
}

function updateWalletUI() {
  const el = document.getElementById("wallet-address");
  const btn = document.getElementById("connect-wallet");
  if (!currentAddress) {
    el.textContent = "Não conectado";
    btn.textContent = "Conectar wallet";
    return;
  }
  el.textContent = `${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}`;
  btn.textContent = "Conectado";
}

async function loadFeed() {
  const container = document.getElementById("feed-posts");
  container.innerHTML = `<div class="loading">Carregando feed...</div>`;
  try {
    const resp = await fetch("/api/posts");
    const posts = await resp.json();

    if (!Array.isArray(posts) || posts.length === 0) {
      container.innerHTML = `<div class="loading">Nenhum post ainda</div>`;
      return;
    }

    container.innerHTML = "";
    posts.forEach((p) => {
      container.appendChild(renderPost(p));
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="loading">Erro ao carregar</div>`;
  }
}

function renderPost(post) {
  const username = post.username || shortAddr(post.address);
  const avatar = post.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.address}`;
  const time = timeAgo(post.created_at);

  const el = document.createElement("article");
  el.className = "post";
  el.innerHTML = `
    <header class="post-header">
      <img class="post-avatar" src="${avatar}" alt="${username}">
      <div>
        <p class="post-username">${username}</p>
        <p class="post-address">${shortAddr(post.address)}</p>
      </div>
    </header>
    <div class="post-media">
      <img src="${post.media_url}" alt="post" onerror="this.src='https://via.placeholder.com/600x600?text=img+error'">
    </div>
    <div class="post-actions">
      <button class="like-btn">❤</button>
    </div>
    <p class="post-caption"><strong>${username}</strong> ${post.caption || ""}</p>
    <p class="post-time">${time}</p>
  `;
  return el;
}

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  return d.toLocaleDateString("pt-BR");
}

function setupUpload() {
  const selectBtn = document.getElementById("select-file");
  const fileInput = document.getElementById("file-input");
  const uploadBtn = document.getElementById("upload-btn");

  selectBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    selectedFile = f;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById("upload-preview").innerHTML =
        `<img src="${ev.target.result}" alt="preview">`;
    };
    reader.readAsDataURL(f);
    uploadBtn.disabled = false;
  });

  uploadBtn.addEventListener("click", doUpload);
}

async function doUpload() {
  if (!token) {
    alert("conecte a wallet");
    return;
  }
  if (!selectedFile) {
    alert("selecione uma imagem");
    return;
  }
  const caption = document.getElementById("caption-input").value;
  const status = document.getElementById("upload-status");
  const btn = document.getElementById("upload-btn");
  const btnText = document.getElementById("upload-text");

  try {
    btn.disabled = true;
    btnText.textContent = "Enviando...";
    status.textContent = "enviando arquivo para IPFS";

    const form = new FormData();
    form.append("media", selectedFile);

    const up = await fetch("/api/upload-media", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });

    const upData = await up.json();
    if (!up.ok) {
      throw new Error(upData.error || "upload error");
    }

    status.textContent = "salvando post";

    const save = await fetch("/api/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        media_url: upData.media_url,
        caption: caption || null
      })
    });

    const saveData = await save.json();
    if (!save.ok) {
      throw new Error(saveData.error || "save error");
    }

    status.textContent = "ok";
    btnText.textContent = "Publicar";
    btn.disabled = false;
    selectedFile = null;
    document.getElementById("file-input").value = "";
    document.getElementById("caption-input").value = "";
    document.getElementById("upload-preview").innerHTML = `<p>Selecione uma imagem</p>`;

    switchView("feed");
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-view="feed"]').classList.add("active");
    loadFeed();
  } catch (err) {
    console.error(err);
    status.textContent = "erro: " + err.message;
    btn.disabled = false;
    btnText.textContent = "Publicar";
  }
}

function setupProfile() {
  const editBtn = document.getElementById("edit-profile-btn");
  const modal = document.getElementById("edit-profile-modal");
  const close = document.getElementById("close-modal");
  const cancel = document.getElementById("cancel-edit");
  const save = document.getElementById("save-profile");

  editBtn.addEventListener("click", () => {
    if (!token) {
      alert("conecte sua wallet");
      return;
    }
    modal.classList.add("active");
    if (currentUser) {
      document.getElementById("edit-username").value = currentUser.username || "";
      document.getElementById("edit-bio").value = currentUser.bio || "";
      document.getElementById("edit-avatar").value = currentUser.avatar_url || "";
    }
  });

  close.addEventListener("click", () => modal.classList.remove("active"));
  cancel.addEventListener("click", () => modal.classList.remove("active"));

  save.addEventListener("click", async () => {
    const username = document.getElementById("edit-username").value;
    const bio = document.getElementById("edit-bio").value;
    const avatar = document.getElementById("edit-avatar").value;

    const resp = await fetch("/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ username, bio, avatar_url: avatar })
    });
    const data = await resp.json();
    if (data.ok) {
      modal.classList.remove("active");
      loadProfile();
      loadFeed();
    }
  });
}

async function loadProfile() {
  const grid = document.getElementById("user-posts");
  if (!token) {
    grid.innerHTML = `<div class="loading">Conecte sua wallet</div>`;
    return;
  }

  const prof = await fetch("/api/profile/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const pdata = await prof.json();
  currentUser = pdata;

  document.getElementById("profile-username-display").textContent =
    pdata.username || shortAddr(pdata.address);
  document.getElementById("profile-bio-display").textContent = pdata.bio || "";
  document.getElementById("profile-address-display").textContent = shortAddr(pdata.address);
  document.getElementById("profile-avatar-img").src =
    pdata.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${pdata.address}`;

  const all = await fetch("/api/posts");
  const posts = await all.json();
  const mine = posts.filter(
    (p) => (p.address || "").toLowerCase() === pdata.address.toLowerCase()
  );
  document.getElementById("posts-count").textContent = mine.length;

  if (mine.length === 0) {
    grid.innerHTML = `<div class="loading">Nenhum post</div>`;
    return;
  }

  grid.innerHTML = "";
  mine.forEach((p) => {
    const div = document.createElement("div");
    div.className = "profile-grid-item";
    div.innerHTML = `<img src="${p.media_url}" alt="post">`;
    grid.appendChild(div);
  });
}

async function loadExplore() {
  const grid = document.getElementById("explore-grid");
  grid.innerHTML = `<div class="loading">Carregando...</div>`;
  const resp = await fetch("/api/posts");
  const posts = await resp.json();
  if (posts.length === 0) {
    grid.innerHTML = `<div class="loading">Nada</div>`;
    return;
  }
  grid.innerHTML = "";
  posts.forEach((p) => {
    const item = document.createElement("div");
    item.className = "grid-item";
    item.innerHTML = `<img src="${p.media_url}" alt="">`;
    grid.appendChild(item);
  });
}

