let jwtToken = null;
let currentAddress = null;
let cfDeliveryUrl = "";

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
const avatarBtn = document.getElementById("avatar-upload-btn");
const avatarFile = document.getElementById("avatar-file");
const avatarPreview = document.getElementById("avatar-preview");
const avatarUploadStatus = document.getElementById("avatar-upload-status");

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

if (btnUpload) {
  btnUpload.addEventListener("click", () => {
    if (!jwtToken) {
      alert("Connect wallet first");
      return;
    }
    document.getElementById("upload-modal").classList.remove("hidden");
  });
}
if (cancelUpload) {
  cancelUpload.addEventListener("click", () => {
    document.getElementById("upload-modal").classList.add("hidden");
    if (uploadStatus) uploadStatus.textContent = "";
  });
}
if (btnConnect) {
  btnConnect.addEventListener("click", async () => {
    await connectWallet();
  });
}

function shortAddr(a) {
  return a.slice(0, 6) + "..." + a.slice(-4);
}

async function connectWallet() {
  if (!window.ethereum) {
    alert("Metamask not detected");
    return;
  }
  if (typeof ethers === "undefined") {
    alert("ethers ainda não carregou, recarrega a página");
    return;
  }
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    let chainId = await provider.send("eth_chainId", []);
    if (chainId !== "0x171") {
      try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: "0x171" }]);
      } catch (e) {
        alert("Adiciona a PulseChain (369) na Metamask e tenta de novo");
        return;
      }
    }
    const signer = provider.getSigner();
    const address = await signer.getAddress();

    currentAddress = address;
    walletAddressEl.textContent = shortAddr(address);
    profileAddressEl.textContent = address;

    const nonceRes = await fetch(`/api/auth/nonce/${address}`);
    const { nonce } = await nonceRes.json();

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
      return;
    }
    jwtToken = data.token;

    await loadCfConfig();
    await loadMyProfile();
    await loadFeed();
  } catch (err) {
    console.error(err);
    alert(err.message || "wallet error");
  }
}

async function loadCfConfig() {
  try {
    const r = await fetch("/api/cf/config");
    const d = await r.json();
    cfDeliveryUrl = (d.deliveryUrl || "").trim();
  } catch (e) {
    cfDeliveryUrl = "";
  }
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
  if (d.avatar_url) {
    avatarPreview.style.backgroundImage = `url('${d.avatar_url}')`;
  } else {
    avatarPreview.style.backgroundImage = "none";
  }
}

if (profileSaveBtn) {
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
}

if (avatarBtn) {
  avatarBtn.addEventListener("click", () => {
    if (!jwtToken) {
      alert("Connect wallet first");
      return;
    }
    avatarFile.click();
  });
}
if (avatarFile) {
  avatarFile.addEventListener("change", async () => {
    if (!avatarFile.files.length) return;
    const file = avatarFile.files[0];
    avatarUploadStatus.textContent = "Getting upload URL...";
    const urlRes = await fetch("/api/cf/image-url", {
      method: "POST",
      headers: { "Authorization": "Bearer " + jwtToken }
    });
    const urlData = await urlRes.json();
    if (!urlData.uploadURL) {
      avatarUploadStatus.textContent = "Cloudflare not configured";
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    const upRes = await fetch(urlData.uploadURL, {
      method: "POST",
      body: fd
    });
    const upData = await upRes.json();
    if (!upData.success) {
      avatarUploadStatus.textContent = "Upload failed";
      return;
    }
    let avatarUrl;
    if (cfDeliveryUrl) {
      avatarUrl = cfDeliveryUrl.replace(/\/$/, "") + "/" + upData.result.id + "/public";
    } else if (upData.result.variants && upData.result.variants.length) {
      avatarUrl = upData.result.variants[0];
    } else {
      avatarUploadStatus.textContent = "No public URL";
      return;
    }
    const save = await fetch("/api/me", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + jwtToken
      },
      body: JSON.stringify({
        username: profileUsernameEl.value,
        bio: profileBioEl.value,
        avatar_url: avatarUrl
      })
    });
    if (save.ok) {
      avatarPreview.style.backgroundImage = `url('${avatarUrl}')`;
      profileAvatarEl.value = avatarUrl;
      avatarUploadStatus.textContent = "Avatar updated";
      loadFeed();
    } else {
      avatarUploadStatus.textContent = "Error saving avatar";
    }
  });
}

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

if (doUpload) {
  doUpload.addEventListener("click", async () => {
    if (!jwtToken) {
      alert("Connect wallet first");
      return;
    }
    const fileInput = document.getElementById("media-file");
    const caption = document.getElementById("caption").value;
    if (!fileInput || !fileInput.files.length) {
      alert("Select file");
      return;
    }
    const file = fileInput.files[0];
    uploadStatus.textContent = "Getting Cloudflare URL...";
    const urlRes = await fetch("/api/cf/image-url", {
      method: "POST",
      headers: { "Authorization": "Bearer " + jwtToken }
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
      document.getElementById("upload-modal").classList.add("hidden");
      document.getElementById("caption").value = "";
      fileInput.value = "";
      loadFeed();
    } else {
      uploadStatus.textContent = "Error saving post";
    }
  });
}

loadFeed();

