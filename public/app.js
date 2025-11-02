let currentWallet = null;
let currentView = "feed";
const apiBase = "";

const views = {
  feed: document.getElementById("view-feed"),
  explore: document.getElementById("view-explore"),
  create: document.getElementById("view-create"),
  profile: document.getElementById("view-profile")
};

const topTitle = document.getElementById("top-title");
const feedList = document.getElementById("feed-list");
const exploreGrid = document.getElementById("explore-grid");
const profileContainer = document.getElementById("profile-container");
const walletStatus = document.getElementById("wallet-status");
const connectBtn = document.getElementById("connect-wallet");

async function api(path, opts = {}) {
  const res = await fetch(apiBase + path, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function setView(view) {
  currentView = view;
  Object.values(views).forEach(v => v.classList.remove("visible"));
  views[view].classList.add("visible");
  document.querySelectorAll(".menu-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  topTitle.textContent = view[0].toUpperCase() + view.slice(1);
}

async function loadFeed() {
  const posts = await api("/api/posts");
  renderFeed(posts);
}

function renderFeed(posts) {
  feedList.innerHTML = "";
  posts.forEach(p => {
    const card = document.createElement("div");
    card.className = "post-card";
    card.innerHTML = `
      <div class="post-header" data-wallet="${p.wallet_address}">
        <div class="post-avatar">
          ${p.avatar_url ? `<img src="${p.avatar_url}">` : p.username ? p.username[0].toUpperCase() : "H"}
        </div>
        <div class="post-user">
          <div class="post-user-name">${p.username || "Unnamed"}</div>
          <div class="post-user-address">${shortAddr(p.wallet_address)}</div>
        </div>
      </div>
      <div class="post-media">
        ${p.media_url ? `<img src="${p.media_url}" alt="post media">` : ""}
      </div>
      ${p.caption ? `<div class="post-caption">${p.caption}</div>` : ""}
      <div class="post-actions" data-post="${p.id}">
        <button data-like="${p.id}">♡ Like</button>
        <button data-comment="${p.id}">💬 Comment</button>
        <button data-share="${p.id}">↗ Share</button>
        ${currentWallet && currentWallet.toLowerCase() === p.wallet_address.toLowerCase()
          ? `<button data-delete="${p.id}">Delete</button>`
          : ""}
      </div>
      <div class="post-footer">
        ${p.likes || 0} likes · ${p.comments || 0} comments
      </div>
    `;
    feedList.appendChild(card);
  });
}

async function loadExplore() {
  const posts = await api("/api/explore");
  exploreGrid.innerHTML = "";
  posts.forEach(p => {
    const item = document.createElement("div");
    item.className = "explore-item";
    item.dataset.post = p.id;
    item.innerHTML = `
      <img src="${p.media_url}" alt="">
    `;
    exploreGrid.appendChild(item);
  });
}

async function showProfile(wallet) {
  const targetWallet = wallet || currentWallet;
  if (!targetWallet) {
    profileContainer.innerHTML = `<p>Connect wallet first.</p>`;
    return;
  }
  const data = await api("/api/users/" + targetWallet);
  const u = data.user;
  const posts = data.posts || [];

  profileContainer.innerHTML = `
    <div class="profile-card">
      <div class="profile-avatar">
        ${u.avatar_url ? `<img src="${u.avatar_url}">` : (u.username ? u.username[0].toUpperCase() : "H")}
      </div>
      <div class="profile-meta">
        <div class="profile-name">${u.username || "Unnamed"}</div>
        <div class="profile-addr">${shortAddr(u.wallet_address)}</div>
        <div class="profile-stats">
          <span>${posts.length} posts</span>
          <span>0 followers</span>
          <span>0 following</span>
        </div>
        <div class="profile-bio">${u.bio || ""}</div>
      </div>
      ${targetWallet.toLowerCase() === (currentWallet || "").toLowerCase()
        ? `<button class="profile-edit-btn" id="edit-profile-btn">Edit profile</button>`
        : ""}
    </div>
    <div class="profile-posts" id="profile-posts"></div>
  `;

  const postsBox = document.getElementById("profile-posts");
  posts.forEach(p => {
    const el = document.createElement("div");
    el.className = "post-card";
    el.innerHTML = `
      <div class="post-media">
        <img src="${p.media_url}" alt="">
      </div>
      ${p.caption ? `<div class="post-caption">${p.caption}</div>` : ""}
    `;
    postsBox.appendChild(el);
  });

  const editBtn = document.getElementById("edit-profile-btn");
  if (editBtn) {
    editBtn.addEventListener("click", () => openEditProfile(u));
  }
}

function openEditProfile(u) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Edit profile</h3>
      <label>Name</label>
      <input id="edit-name" value="${u.username || ""}">
      <label>Bio</label>
      <textarea id="edit-bio">${u.bio || ""}</textarea>
      <label>Avatar (URL)</label>
      <input id="edit-avatar-url" value="${u.avatar_url || ""}">
      <label>Or upload avatar</label>
      <input id="edit-avatar-file" type="file" accept="image/*">
      <div class="modal-actions">
        <button class="btn-muted" id="edit-cancel">Cancel</button>
        <button class="btn-primary" id="edit-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  document.getElementById("edit-cancel").onclick = () => backdrop.remove();
  document.getElementById("edit-save").onclick = async () => {
    const name = document.getElementById("edit-name").value.trim();
    const bio = document.getElementById("edit-bio").value.trim();
    const avatarUrl = document.getElementById("edit-avatar-url").value.trim();
    const avatarFile = document.getElementById("edit-avatar-file").files[0] || null;

    const fd = new FormData();
    fd.append("username", name);
    fd.append("bio", bio);
    if (avatarUrl) fd.append("avatar_url", avatarUrl);
    if (avatarFile) fd.append("avatar", avatarFile);

    await fetch("/api/users/" + currentWallet, {
      method: "POST",
      body: fd
    });

    backdrop.remove();
    showProfile(currentWallet);
  };
}

async function connectWallet() {
  try {
    if (!window.ethereum || !window.ethers) {
      alert("Metamask/ethers not available");
      return;
    }
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    const addr = accounts[0];
    currentWallet = addr;
    walletStatus.textContent = shortAddr(addr);
    // ensure user exists
    await api("/api/users/" + addr);
  } catch (err) {
    console.error(err);
    alert("Failed to connect wallet");
  }
}

function shortAddr(a) {
  if (!a) return "";
  return a.slice(0, 6) + "..." + a.slice(-4);
}

// create
const createForm = document.getElementById("create-form");
const createImg = document.getElementById("create-image");
const createPreview = document.getElementById("create-preview");
const createMsg = document.getElementById("create-msg");

createImg.addEventListener("change", () => {
  const file = createImg.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    createPreview.src = url;
    createPreview.style.display = "block";
  }
});

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentWallet) {
    alert("Connect wallet first");
    return;
  }
  const file = createImg.files[0];
  if (!file) return;
  const caption = document.getElementById("create-caption").value.trim();
  const fd = new FormData();
  fd.append("image", file);
  fd.append("wallet_address", currentWallet);
  fd.append("caption", caption);
  const res = await fetch("/api/posts", { method: "POST", body: fd });
  if (!res.ok) {
    createMsg.textContent = "upload failed";
    return;
  }
  createMsg.textContent = "post created";
  document.getElementById("create-caption").value = "";
  createImg.value = "";
  createPreview.style.display = "none";

  await loadFeed();
  setView("feed");
});

// clicks
document.addEventListener("click", async (e) => {
  // menu
  const menuBtn = e.target.closest(".menu-item");
  if (menuBtn) {
    const v = menuBtn.dataset.view;
    setView(v);
    if (v === "feed") loadFeed();
    if (v === "explore") loadExplore();
    if (v === "profile") showProfile();
  }

  // connect wallet
  if (e.target.id === "connect-wallet") {
    connectWallet();
  }

  // post header to profile
  const postHeader = e.target.closest(".post-header");
  if (postHeader) {
    const w = postHeader.dataset.wallet;
    setView("profile");
    showProfile(w);
  }

  // like comment share delete
  const likeBtn = e.target.closest("[data-like]");
  if (likeBtn) {
    if (!currentWallet) return alert("Connect wallet first");
    const id = likeBtn.dataset.like;
    await api("/api/posts/" + id + "/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: currentWallet })
    });
    loadFeed();
  }

  const commentBtn = e.target.closest("[data-comment]");
  if (commentBtn) {
    if (!currentWallet) return alert("Connect wallet first");
    const id = commentBtn.dataset.comment;
    const text = prompt("Comment");
    if (!text) return;
    await api("/api/posts/" + id + "/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: currentWallet, text })
    });
    loadFeed();
  }

  const shareBtn = e.target.closest("[data-share]");
  if (shareBtn) {
    const id = shareBtn.dataset.share;
    const url = location.origin + "/?post=" + id;
    if (navigator.share) {
      navigator.share({ title: "Hextagram", url });
    } else {
      navigator.clipboard.writeText(url);
      alert("Link copied");
    }
  }

  const deleteBtn = e.target.closest("[data-delete]");
  if (deleteBtn) {
    const id = deleteBtn.dataset.delete;
    if (!confirm("Delete post?")) return;
    await fetch("/api/posts/" + id, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: currentWallet })
    });
    loadFeed();
  }

  // explore item
  const exploreItem = e.target.closest(".explore-item");
  if (exploreItem) {
    const postId = exploreItem.dataset.post;
    // just go to feed and scroll (simpler)
    setView("feed");
    loadFeed().then(() => {
      // optional: highlight
    });
  }

  // mobile open sidebar (icon is ::before)
  if (e.target === topTitle && window.innerWidth < 960) {
    document.querySelector(".sidebar").classList.toggle("open");
  }
});

// init
loadFeed();

