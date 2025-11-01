// estado
let jwtToken = null;
let currentAddress = null;
let cfDeliveryUrl = "";

// elementos
const feedEl = document.getElementById("feed-posts");
const myPostsEl = document.getElementById("my-posts");
const walletAddressEl = document.getElementById("wallet-address");
const profileAddressEl = document.getElementById("profile-address");
const uploadModal = document.getElementById("upload-modal");
const btnUpload = document.getElementById("btn-upload");
const btnConnect = document.getElementById("btn-connect");
const cancelUpload = document.getElementById("cancel-upload");
const doUpload = document.getElementById("do-upload");
const uploadStatus = document.getElementById("upload-status");
const profileUsernameEl = document.getElementById("profile-username");
const profileBioEl = document.getElementById("profile-bio");
const profileAvatarEl = document.getElementById("profile-avatar");
const profileSaveBtn = document.getElementById("profile-save");
const profileSaveStatus = document.getElementById("profile-save-status");

// navegação
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const page = btn.dataset.page;
    document.querySelectorAll(".page").forEach(pg => pg.classList.remove("visible"));
    if (page) {
      document.getElementById(page).classList.add("visible");
      if (page === "profile") loadMyPosts();
    }
  });
});

// abrir modal de upload
btnUpload.addEventListener("click", () => {
  if (!jwtToken) {
    alert("Connect wallet first");
    return;
  }
  uploadModal.classList.remove("hidden");
});

// fechar modal
cancelUpload.addEventListener("click", () => {
  uploadModal.classList.add("hidden");
  uploadStatus.textContent = "";
});

// connect wallet
btnConnect.addEventListener("click", async () => {
  await connectWallet();
});

function shortAddr(a) {
  return a.slice(0, 6) + "..." + a.slice(-4);
}

async function connectWallet() {
  if (!window.ethereum) {
    alert("Metamask not detected");
    return;
  }
  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts"
    });
    const address = accounts[0];

    let chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== "0x171") {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x171" }]
        });
      } catch (e) {
        alert("Add PulseChain (chainId 369) in Metamask and try again");
        console.error(e);
        return;
      }
    }

    currentAddress = address;
    walletAddressEl.textContent = shortAddr(address);
    profileAddressEl.textContent = address;

    const nonceRes = await fetch(`/api/auth/nonce/${address}`);
    const { nonce } = await nonceRes.json();

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const message = `Hextagram login on PulseChain, nonce: ${nonce}`;
    const signature = await signer.signMessage(message);

    const verifyRes = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature })
    });
    const data = await verifyRes.json();
    if (!data.token) {
      alert("Auth failed");
      console.error(data);
      return;
    }

    jwtToken = data.token;
    await loadCfConfig();
    await loadMyProfile();
    await loadFeed();
  } catch (err) {
    console.error("connectWallet error", err);
    alert(err.message || "Wallet error");
  }
}

async function loadCfConfig() {
  const r = await fetch("/api/cf/config");
  const d = await r.json();
  cfDeliveryUrl = (d.deliveryUrl || "").trim();
}

async function loadMyProfile() {
  if (!jwtToken) return;
  const r = await fetch("/api/me", {
    headers: { Authorization: "Bearer " + jwtToken }
  });
  const d = await r.json();
  profileUsernameEl.value = d.username || "";
  profileBioEl.value = d.bio || "";
  profileAvatarEl.value = d.avatar_url || "";
}

profileSaveBtn.addEventListener("click", async () => {
  if (!jwtToken) {
    alert("Connect wallet first");
    return;
  }
  profileSaveStatus.textContent = "Saving...";
  const r = await fetch("/api/me", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + jwtToken
    },
    body: JSON.stringify({
      username: profileUsernameEl.value,
      bio: profileBioEl.value,
      avatar_url: profileAvatarEl.value
    })
  });
  if (r.ok) {
    profileSaveStatus.textContent = "Saved";
    loadFeed();
  } else {
    profileSaveStatus.textContent = "Error";
  }
});

async function loadFeed() {
  const res = await fetch("/api/posts");
  const posts = await res.json();
  renderFeed(posts);
}

function renderFeed(posts) {
  feedEl.innerHTML = "";
  posts.forEach(p => {
    const card = document.createElement("div");
    card.className = "post-card";
    card.innerHTML = `
      <div class="post-header">
        <div class="post-user-avatar" style="${p.avatar_url ? `background-image:url('${p.avatar_url}');background-size:cover;background-position:center;` : ""}"></div>
        <div>
          <div>${p.username ? p.username : shortAddr(p.user_address)}</div>
          <small>${new Date(p.created_at).toLocaleString()}</small>
        </div>
      </div>
      <div class="post-media">
        <img src="${p.media_url}" loading="lazy">
      </div>
      <div class="post-actions">
        <button data-like="${p.id}">Like (${p.likes_count || 0})</button>
        <button data-comment="${p.id}">Comments (${p.comments_count || 0})</button>
      </div>
      <div class="post-caption">${p.caption || ""}</div>
      <div class="comments-box" id="comments-${p.id}" style="display:none">
        <input placeholder="Write a comment" data-input="${p.id}">
      </div>
    `;
    feedEl.appendChild(card);
  });

  feedEl.querySelectorAll("[data-like]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!jwtToken) {
        alert("Connect wallet");
        return;
      }
      const id = btn.getAttribute("data-like");
      await fetch(`/api/posts/${id}/like`, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + jwtToken,
          "Content-Type": "application/json"
        }
      });
      loadFeed();
    });
  });

  feedEl.querySelectorAll("[data-comment]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-comment");
      const box = document.getElementById(`comments-${id}`);
      const visible = box.style.display === "block";
      if (visible) {
        box.style.display = "none";
      } else {
        box.style.display = "block";
        loadComments(id);
      }
      const input = box.querySelector(`[data-input="${id}"]`);
      input.addEventListener("keypress", async (e) => {
        if (e.key === "Enter") {
          if (!jwtToken) {
            alert("Connect wallet");
            return;
          }
          const content = e.target.value;
          if (!content.trim()) return;
          await fetch(`/api/posts/${id}/comment`, {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + jwtToken,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ content })
          });
          e.target.value = "";
          loadComments(id);
        }
      });
    });
  });
}

async function loadComments(postId) {
  const res = await fetch(`/api/posts/${postId}/comments`);
  const comments = await res.json();
  const box = document.getElementById(`comments-${postId}`);
  box.querySelectorAll(".cmt").forEach(el => el.remove());
  comments.forEach(c => {
    const div = document.createElement("div");
    div.className = "cmt";
    div.textContent = shortAddr(c.user_address) + ": " + c.content;
    box.insertBefore(div, box.lastElementChild);
  });
}

async function loadMyPosts() {
  const res = await fetch("/api/posts");
  const posts = await res.json();
  const mine = posts.filter(
    p => currentAddress && p.user_address.toLowerCase() === currentAddress.toLowerCase()
  );
  myPostsEl.innerHTML = "";
  mine.forEach(p => {
    const item = document.createElement("div");
    item.className = "post-card";
    item.innerHTML = `<img src="${p.media_url}"><div class="post-caption">${p.caption || ""}</div>`;
    myPostsEl.appendChild(item);
  });
}

// upload
doUpload.addEventListener("click", async () => {
  if (!jwtToken) {
    alert("Connect wallet first");
    return;
  }
  const fileInput = document.getElementById("media-file");
  const caption = document.getElementById("caption").value;
  if (!fileInput.files.length) {
    alert("Select file");
    return;
  }
  const file = fileInput.files[0];
  uploadStatus.textContent = "Getting Cloudflare URL...";

  const urlRes = await fetch("/api/cf/image-url", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + jwtToken
    }
  });
  const urlData = await urlRes.json();
  if (!urlData.uploadURL) {
    uploadStatus.textContent = "Cloudflare not configured";
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  const upRes = await fetch(urlData.uploadURL, {
    method: "POST",
    body: formData
  });
  const upData = await upRes.json();
  if (!upData.success) {
    uploadStatus.textContent = "Upload failed";
    return;
  }

  let publicUrl;
  if (cfDeliveryUrl) {
    publicUrl = cfDeliveryUrl.replace(/\/$/, "") + "/" + upData.result.id + "/public";
  } else if (upData.result.variants && upData.result.variants.length) {
    publicUrl = upData.result.variants[0];
  } else {
    uploadStatus.textContent = "No public URL";
    return;
  }

  uploadStatus.textContent = "Saving post...";

  const save = await fetch("/api/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + jwtToken
    },
    body: JSON.stringify({
      media_url: publicUrl,
      media_type: "image/jpeg",
      caption
    })
  });

  if (save.ok) {
    uploadStatus.textContent = "Done";
    uploadModal.classList.add("hidden");
    document.getElementById("caption").value = "";
    document.getElementById("media-file").value = "";
    loadFeed();
  } else {
    uploadStatus.textContent = "Error saving post";
  }
});

// feed inicial sem login
loadFeed();

