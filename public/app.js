// public/app.js
const API_BASE = "";
// endpoint que você passou
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dg2xpadhr/upload";
// tem que existir no Cloudinary
const CLOUDINARY_UPLOAD_PRESET = "hextagram_unsigned";

let jwtToken = null;
let currentAddress = null;

const navButtons = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");
const connectBtn = document.getElementById("connect-wallet");
const walletLabel = document.getElementById("wallet-label");

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    views.forEach((v) => v.classList.remove("active"));
    document.getElementById(`view-${view}`).classList.add("active");
    if (view === "feed") loadFeed();
    if (view === "profile") loadProfile();
  });
});

async function connectWallet() {
  if (!window.ethereum) {
    alert("Instala Metamask");
    return;
  }
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    let network = await provider.getNetwork();
    if (network.chainId !== 369) {
      // PulseChain chainId 369
      await provider.send("wallet_switchEthereumChain", [{ chainId: "0x171" }]);
      network = await provider.getNetwork();
    }

    const signer = provider.getSigner();
    const address = (await signer.getAddress()).toLowerCase();
    const message = "Hextagram login " + new Date().toISOString();
    const signature = await signer.signMessage(message);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, message, signature })
    });

    const data = await res.json();
    if (data.token) {
      jwtToken = data.token;
      currentAddress = data.address;
      walletLabel.textContent = currentAddress.slice(0, 6) + "..." + currentAddress.slice(-4);
      connectBtn.textContent = "Connected";
      loadFeed();
      loadProfile();
    } else {
      alert("auth fail");
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao conectar");
  }
}

connectBtn.addEventListener("click", connectWallet);

// feed
async function loadFeed() {
  const container = document.getElementById("feed-list");
  container.innerHTML = "Loading...";
  const res = await fetch("/api/posts");
  const posts = await res.json();
  container.innerHTML = "";
  posts.forEach((p) => {
    const el = document.createElement("div");
    el.className = "post-card";
    el.innerHTML = `
      <div class="post-head">
        <img src="${p.avatar_url || "/avatar-placeholder.png"}" class="post-avatar" />
        <div>
          <div class="post-user">${p.username || p.address?.slice(0, 10) || "anon"}</div>
          <div class="post-time">${new Date(p.created_at).toLocaleString()}</div>
        </div>
      </div>
      <div class="post-media">
        ${p.media_url.endsWith(".mp4") ? `<video src="${p.media_url}" controls></video>` : `<img src="${p.media_url}" />`}
      </div>
      <div class="post-caption">${p.caption || ""}</div>
    `;
    container.appendChild(el);
  });
}

// profile
async function loadProfile() {
  if (!jwtToken) {
    document.getElementById("profile-address").textContent = "Connect wallet";
    return;
  }
  const res = await fetch("/api/profile/me", {
    headers: { Authorization: "Bearer " + jwtToken }
  });
  const p = await res.json();
  document.getElementById("profile-address").textContent = p?.address || currentAddress;
  document.getElementById("profile-username").value = p?.username || "";
  document.getElementById("profile-bio").value = p?.bio || "";
  document.getElementById("profile-avatar").src = p?.avatar_url || "/avatar-placeholder.png";

  // carregar meus posts
  const postsRes = await fetch("/api/posts");
  const posts = await postsRes.json();
  const myPosts = posts.filter((x) => x.address === currentAddress);
  const list = document.getElementById("my-posts");
  list.innerHTML = "";
  myPosts.forEach((p2) => {
    const el = document.createElement("div");
    el.className = "my-post-card";
    el.innerHTML = `<img src="${p2.media_url}" />`;
    list.appendChild(el);
  });
}

document.getElementById("profile-save").addEventListener("click", async () => {
  if (!jwtToken) {
    alert("Conecta primeiro");
    return;
  }
  const username = document.getElementById("profile-username").value;
  const bio = document.getElementById("profile-bio").value;
  const avatar_url = document.getElementById("profile-avatar").src;

  const res = await fetch("/api/profile", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + jwtToken
    },
    body: JSON.stringify({ username, bio, avatar_url })
  });
  const data = await res.json();
  document.getElementById("profile-avatar").src = data.avatar_url || "/avatar-placeholder.png";
});

// avatar upload
document.getElementById("avatar-upload-btn").addEventListener("click", () => {
  document.getElementById("avatar-file").click();
});

document.getElementById("avatar-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const up = await fetch(CLOUDINARY_URL, {
    method: "POST",
    body: fd
  });
  const json = await up.json();
  if (json.secure_url) {
    document.getElementById("profile-avatar").src = json.secure_url;
  } else {
    alert("Cloudinary avatar upload error");
  }
});

// upload post
document.getElementById("upload-btn").addEventListener("click", async () => {
  const status = document.getElementById("upload-status");
  status.textContent = "";
  if (!jwtToken) {
    alert("Conecta primeiro");
    return;
  }
  const fileInput = document.getElementById("upload-file");
  const file = fileInput.files[0];
  if (!file) {
    alert("Selecione um arquivo");
    return;
  }
  const caption = document.getElementById("upload-caption").value;

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  status.textContent = "Uploading to Cloudinary...";
  const up = await fetch(CLOUDINARY_URL, {
    method: "POST",
    body: fd
  });
  const json = await up.json();
  if (!json.secure_url) {
    console.error(json);
    status.textContent = "Cloudinary error";
    return;
  }
  const mediaUrl = json.secure_url;

  status.textContent = "Saving post...";
  const res = await fetch("/api/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + jwtToken
    },
    body: JSON.stringify({ media_url: mediaUrl, caption })
  });
  const data = await res.json();
  if (data.id) {
    status.textContent = "Done";
    document.getElementById("upload-file").value = "";
    document.getElementById("upload-caption").value = "";
    loadFeed();
  } else {
    status.textContent = "Backend error";
  }
});

