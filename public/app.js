const API = "";
let currentWallet = null;
let currentPostForComments = null;

const views = {
  feed: document.getElementById("feedView"),
  explore: document.getElementById("exploreView"),
  create: document.getElementById("createView"),
  profile: document.getElementById("profileView")
};

function switchView(name) {
  Object.values(views).forEach(v => v.classList.remove("visible"));
  views[name].classList.add("visible");
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  if (name === "feed") loadFeed();
  if (name === "explore") loadExplore();
  if (name === "profile") loadMyProfile();
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

document.getElementById("openSidebar")?.addEventListener("click", () => {
  document.querySelector(".sidebar").classList.toggle("show");
});

async function connectWallet() {
  if (!window.ethereum) {
    alert("Install MetaMask or a PulseChain compatible wallet.");
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    currentWallet = accounts[0];
    document.getElementById("walletAddr").textContent = shortAddr(currentWallet);
    document.getElementById("connectWalletTop").textContent = "Connected";
    loadMyProfile();
  } catch (err) {
    alert("Failed to connect wallet");
  }
}

document.getElementById("connectWallet").addEventListener("click", connectWallet);
document.getElementById("connectWalletTop").addEventListener("click", connectWallet);

function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

async function loadFeed() {
  const list = document.getElementById("feedList");
  list.innerHTML = "Loading...";
  try {
    const r = await fetch(API + "/api/posts");
    const data = await r.json();
    list.innerHTML = "";
    data.forEach(p => {
      list.appendChild(renderPost(p));
    });
  } catch (err) {
    list.innerHTML = "Failed to load feed";
  }
}

function renderPost(p) {
  const div = document.createElement("div");
  div.className = "post-card";
  const name = p.username || "Pulse user";
  const wallet = p.wallet_address;
  const media = p.media_url ? `<img src="${p.media_url}" alt="post media">` : "";
  div.innerHTML = `
    <div class="post-header">
      <div class="avatar">${p.avatar_url ? `<img src="${p.avatar_url}"/>` : ""}</div>
      <div class="user-meta" data-wallet="${wallet}">
        <span class="name">${name}</span>
        <span class="wallet">${shortAddr(wallet)}</span>
      </div>
    </div>
    <div class="post-media">${media}</div>
    <div class="post-footer">
      <div class="action-row">
        <button class="action-btn like-btn" data-id="${p.id}">♥ Like</button>
        <button class="action-btn comment-btn" data-id="${p.id}">💬 Comment</button>
        <button class="action-btn share-btn" data-id="${p.id}">↗ Share</button>
        ${currentWallet && currentWallet.toLowerCase() === wallet.toLowerCase()
          ? `<button class="action-btn delete-btn" data-id="${p.id}">Delete</button>`
          : ""}
      </div>
      <div class="meta-row">
        ${p.likes || 0} likes • ${p.comments || 0} comments
      </div>
      ${p.caption ? `<div class="meta-row">${p.caption}</div>` : ""}
    </div>
  `;
  // listeners
  div.querySelector(".user-meta").addEventListener("click", () => openProfile(wallet));
  div.querySelector(".like-btn").addEventListener("click", () => likePost(p.id));
  div.querySelector(".comment-btn").addEventListener("click", () => openComments(p.id));
  div.querySelector(".share-btn").addEventListener("click", () => {
    navigator.clipboard?.writeText(location.origin + "/?post=" + p.id);
    alert("Post link copied");
  });
  const del = div.querySelector(".delete-btn");
  if (del) {
    del.addEventListener("click", () => deletePost(p.id));
  }
  return div;
}

async function likePost(id) {
  if (!currentWallet) {
    alert("Connect wallet first.");
    return;
  }
  await fetch(API + "/api/posts/" + id + "/like", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet_address: currentWallet })
  });
  loadFeed();
}

async function deletePost(id) {
  if (!currentWallet) return;
  const ok = confirm("Delete this post.");
  if (!ok) return;
  await fetch(API + "/api/posts/" + id, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet_address: currentWallet })
  });
  loadFeed();
}

const imageDrop = document.getElementById("imageDrop");
const imageInput = document.getElementById("imageInput");
imageDrop.addEventListener("click", () => imageInput.click());

document.getElementById("createForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentWallet) {
    alert("Connect wallet first.");
    return;
  }
  const file = imageInput.files[0];
  if (!file) {
    alert("Select an image.");
    return;
  }
  const caption = document.getElementById("captionInput").value;
  const fd = new FormData();
  fd.append("image", file);
  fd.append("wallet_address", currentWallet);
  fd.append("caption", caption);
  await fetch(API + "/api/posts", {
    method: "POST",
    body: fd
  });
  imageInput.value = "";
  document.getElementById("captionInput").value = "";
  switchView("feed");
});

async function loadMyProfile() {
  if (!currentWallet) {
    document.getElementById("profileBox").innerHTML = "Connect wallet";
    document.getElementById("profilePosts").innerHTML = "";
    return;
  }
  await openProfile(currentWallet, true);
}

async function openProfile(wallet, isOwn = false) {
  switchView("profile");
  try {
    const r = await fetch(API + "/api/users/" + wallet);
    const data = await r.json();
    const box = document.getElementById("profileBox");
    const postsBox = document.getElementById("profilePosts");
    box.innerHTML = `
      <div class="avatar" style="width:56px;height:56px;">
        ${data.user?.avatar_url ? `<img src="${data.user.avatar_url}"/>` : ""}
      </div>
      <div>
        <div><strong>${data.user?.username || "Pulse user"}</strong></div>
        <div>${shortAddr(wallet)}</div>
        <div style="font-size:0.75rem;">${data.user?.bio || ""}</div>
        <div style="font-size:0.68rem;margin-top:4px;">
          ${data.followers} followers • ${data.following} following
        </div>
      </div>
      <div style="margin-left:auto;display:flex;gap:6px;">
        ${currentWallet && currentWallet.toLowerCase() === wallet.toLowerCase()
          ? `<label class="primary-btn sm" style="cursor:pointer;">
              Edit
              <input type="file" id="avatarFile" hidden />
            </label>`
          : `<button id="followBtn" class="primary-btn sm">Follow</button>`}
      </div>
    `;
    postsBox.innerHTML = "";
    data.posts.forEach(p => {
      const item = document.createElement("div");
      item.className = "explore-item";
      item.innerHTML = `<img src="${p.media_url}" alt=""/>`;
      item.addEventListener("click", () => {
        switchView("feed");
        setTimeout(loadFeed, 150);
      });
      postsBox.appendChild(item);
    });

    const avatarFile = document.getElementById("avatarFile");
    if (avatarFile) {
      avatarFile.addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("avatar", file);
        await fetch(API + "/api/users/" + currentWallet, {
          method: "POST",
          body: fd
        });
        openProfile(currentWallet, true);
      });
    }

    const followBtn = document.getElementById("followBtn");
    if (followBtn && currentWallet) {
      followBtn.addEventListener("click", async () => {
        await fetch(API + "/api/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ follower: currentWallet, followed: wallet })
        });
        openProfile(wallet);
      });
    }
  } catch (err) {
    document.getElementById("profileBox").innerHTML = "Failed to load profile.";
  }
}

async function loadExplore() {
  const grid = document.getElementById("exploreGrid");
  grid.innerHTML = "Loading...";
  try {
    const r = await fetch(API + "/api/explore");
    const data = await r.json();
    grid.innerHTML = "";
    data.forEach(p => {
      const item = document.createElement("div");
      item.className = "explore-item";
      item.innerHTML = `<img src="${p.media_url}" alt="Explore"/>`;
      item.addEventListener("click", () => {
        switchView("feed");
        setTimeout(loadFeed, 150);
      });
      grid.appendChild(item);
    });
  } catch (err) {
    grid.innerHTML = "Failed to load explore.";
  }
}

// comments modal
const modal = document.getElementById("commentModal");
document.getElementById("closeComments").addEventListener("click", () => {
  modal.classList.add("hidden");
  currentPostForComments = null;
});

async function openComments(postId) {
  currentPostForComments = postId;
  modal.classList.remove("hidden");
  const list = document.getElementById("commentsList");
  list.innerHTML = "Loading...";
  const r = await fetch(API + "/api/posts/" + postId + "/comments");
  const data = await r.json();
  list.innerHTML = "";
  data.forEach(c => {
    const line = document.createElement("div");
    line.className = "comment-line";
    line.innerHTML = `
      <div class="avatar" style="width:28px;height:28px;">
        ${c.avatar_url ? `<img src="${c.avatar_url}">` : ""}
      </div>
      <div>
        <strong>${c.username || shortAddr(c.wallet_address)}</strong>
        <div>${c.text}</div>
      </div>
    `;
    list.appendChild(line);
  });
}

document.getElementById("sendComment").addEventListener("click", async () => {
  if (!currentWallet) {
    alert("Connect wallet.");
    return;
  }
  const text = document.getElementById("commentText").value.trim();
  if (!text) return;
  await fetch(API + "/api/posts/" + currentPostForComments + "/comment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet_address: currentWallet, text })
  });
  document.getElementById("commentText").value = "";
  openComments(currentPostForComments);
  loadFeed();
});

// init
loadFeed();

