// public/app.js

let jwtToken = null;
let currentAddress = null;
let cfConfig = null;

const feedView = document.getElementById("view-feed");
const profileView = document.getElementById("view-profile");
const uploadView = document.getElementById("view-upload");

const navFeed = document.getElementById("nav-feed");
const navProfile = document.getElementById("nav-profile");
const navUpload = document.getElementById("nav-upload");

const connectBtn = document.getElementById("connect-wallet");
const walletLabel = document.getElementById("wallet-label");

const feedList = document.getElementById("feed-list");
const myPostsEl = document.getElementById("my-posts");

const uploadBtn = document.getElementById("do-upload");
const uploadStatus = document.getElementById("upload-status");

const pfUsername = document.getElementById("pf-username");
const pfBio = document.getElementById("pf-bio");
const pfAvatarUrl = document.getElementById("pf-avatar-url");
const pfAvatarPreview = document.getElementById("pf-avatar-preview");
const pfSave = document.getElementById("pf-save");
const pfStatus = document.getElementById("pf-status");
const myAddressEl = document.getElementById("my-address");

const avatarModal = document.getElementById("avatar-modal");
const avatarFile = document.getElementById("avatar-file");
const avatarCancel = document.getElementById("avatar-cancel");
const avatarSend = document.getElementById("avatar-send");
const avatarUploadStatus = document.getElementById("avatar-upload-status");
const pfAvatarUpload = document.getElementById("pf-avatar-upload");

// troca de view
function show(view) {
  feedView.classList.remove("active");
  profileView.classList.remove("active");
  uploadView.classList.remove("active");
  navFeed.classList.remove("active");
  navProfile.classList.remove("active");
  navUpload.classList.remove("active");

  view.classList.add("active");
}

navFeed.addEventListener("click", () => {
  show(feedView);
  navFeed.classList.add("active");
  loadFeed();
});

navProfile.addEventListener("click", () => {
  show(profileView);
  navProfile.classList.add("active");
  loadProfile();
});

navUpload.addEventListener("click", () => {
  show(uploadView);
  navUpload.classList.add("active");
});

// conecta wallet
async function connectWallet() {
  if (!window.ethereum) {
    alert("Metamask not found");
    return;
  }
  // garante chain 369
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId !== "0x171") {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x171" }]
      });
    } catch (e) {
      alert("Switch to PulseChain (chainId 369) in Metamask");
      return;
    }
  }

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const addr = accounts[0];
  currentAddress = addr;
  walletLabel.textContent = addr.slice(0, 6) + "..." + addr.slice(-4);

  // pega nonce
  const nonceRes = await fetch(`/api/auth/nonce/${addr}`);
  const nonceData = await nonceRes.json();
  const nonce = nonceData.nonce;

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const message = `Hextagram login on PulseChain, nonce: ${nonce}`;
  const signature = await signer.signMessage(message);

  const verifyRes = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: addr, signature })
  });
  const verifyData = await verifyRes.json();
  if (!verifyRes.ok) {
    alert("Auth failed");
    return;
  }
  jwtToken = verifyData.token;
  loadProfile();
  loadFeed();
}

connectBtn.addEventListener("click", connectWallet);

// carrega config cloudflare
async function loadCfConfig() {
  const res = await fetch("/api/cf/config");
  const data = await res.json();
  cfConfig = data;
}

// feed
async function loadFeed() {
  const res = await fetch("/api/posts");
  const posts = await res.json();
  feedList.innerHTML = "";
  posts.forEach((p) => {
    const card = document.createElement("div");
    card.className = "post-card";
    const top = document.createElement("div");
    top.className = "post-top";
    const avatar = document.createElement("img");
    avatar.className = "post-avatar";
    avatar.src = p.avatar_url || "/default-avatar.png";
    const name = document.createElement("div");
    name.className = "post-user";
    name.textContent = p.username || p.user_address.slice(0, 6) + "..." + p.user_address.slice(-4);
    top.appendChild(avatar);
    top.appendChild(name);

    const img = document.createElement("img");
    img.className = "post-media";
    img.src = p.media_url;

    const cap = document.createElement("div");
    cap.className = "post-caption";
    cap.textContent = p.caption || "";

    const meta = document.createElement("div");
    meta.className = "post-meta";
    meta.textContent = `${p.likes_count} likes  ${p.comments_count} comments`;

    card.appendChild(top);
    card.appendChild(img);
    card.appendChild(cap);
    card.appendChild(meta);
    feedList.appendChild(card);
  });

  // meus posts também
  if (currentAddress && myPostsEl) {
    const mine = posts.filter((p) => p.user_address.toLowerCase() === currentAddress.toLowerCase());
    myPostsEl.innerHTML = "";
    mine.forEach((p) => {
      const d = document.createElement("div");
      d.className = "post-card small";
      d.innerHTML = `<img src="${p.media_url}" class="post-media" /><div class="post-caption">${p.caption || ""}</div>`;
      myPostsEl.appendChild(d);
    });
  }
}

// profile
async function loadProfile() {
  if (!jwtToken) return;
  const res = await fetch("/api/me", {
    headers: { Authorization: "Bearer " + jwtToken }
  });
  const data = await res.json();
  myAddressEl.textContent = data.address;
  pfUsername.value = data.username || "";
  pfBio.value = data.bio || "";
  pfAvatarUrl.value = data.avatar_url || "";
  pfAvatarPreview.src = data.avatar_url || "/default-avatar.png";
}

pfSave.addEventListener("click", async () => {
  if (!jwtToken) {
    alert("Connect wallet first");
    return;
  }
  const body = {
    username: pfUsername.value,
    bio: pfBio.value,
    avatar_url: pfAvatarUrl.value
  };
  const res = await fetch("/api/me", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + jwtToken
    },
    body: JSON.stringify(body)
  });
  if (res.ok) {
    pfStatus.textContent = "Saved";
    loadFeed();
  } else {
    pfStatus.textContent = "Error saving";
  }
});

// upload de post
if (uploadBtn) {
  uploadBtn.addEventListener("click", async () => {
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
      headers: { Authorization: "Bearer " + jwtToken }
    });
    const urlData = await urlRes.json();
    if (!urlRes.ok) {
      uploadStatus.textContent = "Error: " + (urlData.error || "unknown");
      return;
    }

    const fd = new FormData();
    fd.append("file", file);
    uploadStatus.textContent = "Uploading to Cloudflare...";
    const upRes = await fetch(urlData.uploadURL, {
      method: "POST",
      body: fd
    });
    const upData = await upRes.json();
    if (!upData.success) {
      uploadStatus.textContent = "Upload failed: " + JSON.stringify(upData);
      return;
    }

    // monta URL publica
    const cfConfRes = await fetch("/api/cf/config");
    const cfConf = await cfConfRes.json();
    let publicUrl = "";
    if (cfConf.configured) {
      publicUrl = cfConf.deliveryUrl.replace(/\/+$/, "") + "/" + upData.result.id + "/public";
    } else if (upData.result.variants && upData.result.variants.length) {
      publicUrl = upData.result.variants[0];
    } else {
      uploadStatus.textContent = "No public URL from CF";
      return;
    }

    uploadStatus.textContent = "Saving post...";
    const saveRes = await fetch("/api/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + jwtToken
      },
      body: JSON.stringify({
        media_url: publicUrl,
        media_type: file.type || "image",
        caption
      })
    });
    if (!saveRes.ok) {
      uploadStatus.textContent = "Error saving post";
      return;
    }
    uploadStatus.textContent = "Done";
    fileInput.value = "";
    document.getElementById("caption").value = "";
    loadFeed();
  });
}

// avatar modal
pfAvatarUpload.addEventListener("click", () => {
  if (!jwtToken) {
    alert("Connect wallet first");
    return;
  }
  avatarModal.classList.remove("hidden");
  avatarUploadStatus.textContent = "";
  avatarFile.value = "";
});

avatarCancel.addEventListener("click", () => {
  avatarModal.classList.add("hidden");
});

avatarSend.addEventListener("click", async () => {
  if (!jwtToken) {
    alert("Connect wallet first");
    return;
  }
  if (!avatarFile.files.length) {
    alert("Select file");
    return;
  }
  const file = avatarFile.files[0];
  avatarUploadStatus.textContent = "Requesting CF URL...";
  const urlRes = await fetch("/api/cf/image-url", {
    method: "POST",
    headers: { Authorization: "Bearer " + jwtToken }
  });
  const urlData = await urlRes.json();
  if (!urlRes.ok) {
    avatarUploadStatus.textContent = "Error: " + (urlData.error || "unknown");
    return;
  }

  const fd = new FormData();
  fd.append("file", file);
  avatarUploadStatus.textContent = "Uploading avatar...";
  const upRes = await fetch(urlData.uploadURL, {
    method: "POST",
    body: fd
  });
  const upData = await upRes.json();
  if (!upData.success) {
    avatarUploadStatus.textContent = "CF upload failed";
    return;
  }

  const cfConfRes = await fetch("/api/cf/config");
  const cfConf = await cfConfRes.json();
  let avatarUrl = "";
  if (cfConf.configured) {
    avatarUrl = cfConf.deliveryUrl.replace(/\/+$/, "") + "/" + upData.result.id + "/avatar";
  } else if (upData.result.variants && upData.result.variants.length) {
    avatarUrl = upData.result.variants[0];
  } else {
    avatarUploadStatus.textContent = "No avatar URL";
    return;
  }

  // salva no profile
  const saveRes = await fetch("/api/me", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + jwtToken
    },
    body: JSON.stringify({
      username: pfUsername.value,
      bio: pfBio.value,
      avatar_url: avatarUrl
    })
  });
  if (!saveRes.ok) {
    avatarUploadStatus.textContent = "Error saving profile";
    return;
  }
  pfAvatarUrl.value = avatarUrl;
  pfAvatarPreview.src = avatarUrl;
  avatarUploadStatus.textContent = "Avatar updated";
  loadFeed();
  setTimeout(() => avatarModal.classList.add("hidden"), 600);
});

// init
loadCfConfig();
loadFeed();

