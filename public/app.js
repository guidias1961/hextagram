// app.js
let jwtToken = null;
let currentAddress = null;
let cfDeliveryBase = null;

const feedView = document.getElementById("feed-view");
const profileView = document.getElementById("profile-view");
const uploadView = document.getElementById("upload-view");

const navFeed = document.getElementById("nav-feed");
const navProfile = document.getElementById("nav-profile");
const navUpload = document.getElementById("nav-upload");
const walletStatus = document.getElementById("wallet-status");
const connectBtn = document.getElementById("connect-wallet");
const uploadBtn = document.getElementById("upload-btn");
const uploadStatus = document.getElementById("upload-status");

const profileAddress = document.getElementById("profile-address");
const profileUsername = document.getElementById("profile-username");
const profileBio = document.getElementById("profile-bio");
const saveProfileBtn = document.getElementById("save-profile");
const profileSaveStatus = document.getElementById("profile-save-status");
const profileAvatarFile = document.getElementById("profile-avatar-file");
const profileAvatarImg = document.getElementById("profile-avatar-img");
const myPosts = document.getElementById("my-posts");

function showView(view) {
  feedView.classList.add("hidden");
  profileView.classList.add("hidden");
  uploadView.classList.add("hidden");
  navFeed.classList.remove("active");
  navProfile.classList.remove("active");
  navUpload.classList.remove("active");
  if (view === "feed") {
    feedView.classList.remove("hidden");
    navFeed.classList.add("active");
  } else if (view === "profile") {
    profileView.classList.remove("hidden");
    navProfile.classList.add("active");
  } else {
    uploadView.classList.remove("hidden");
    navUpload.classList.add("active");
  }
}

navFeed.onclick = () => {
  showView("feed");
  loadFeed();
};
navProfile.onclick = () => {
  if (!jwtToken) {
    alert("Connect wallet first");
    return;
  }
  showView("profile");
  loadProfile();
};
navUpload.onclick = () => {
  if (!jwtToken) {
    alert("Connect wallet first");
    return;
  }
  showView("upload");
};

async function connectWallet() {
  if (!window.ethereum) {
    alert("Metamask não encontrada");
    return;
  }
  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts"
    });
    const address = accounts[0];
    // força pulsechain (369)
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x171" }]
      });
    } catch (e) {
      console.log("switch error", e);
    }
    // nonce
    const nonceRes = await fetch(`/api/auth/nonce/${address}`);
    const { nonce } = await nonceRes.json();
    const message = `Hextagram login on PulseChain, nonce: ${nonce}`;
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [message, address]
    });
    const verifyRes = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature })
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) {
      alert("login error: " + (verifyData.error || "unknown"));
      return;
    }
    jwtToken = verifyData.token;
    currentAddress = address;
    walletStatus.textContent =
      address.slice(0, 6) + "..." + address.slice(address.length - 4);
    connectBtn.textContent = "Connected";
    loadProfile(); // pré-carrega
  } catch (e) {
    console.error(e);
    alert("wallet error");
  }
}

connectBtn.onclick = connectWallet;

async function loadFeed() {
  const res = await fetch("/api/posts");
  const posts = await res.json();
  feedView.innerHTML = "";
  posts.forEach((p) => {
    const card = document.createElement("div");
    card.className = "post-card";
    card.innerHTML = `
      <div class="post-header">
        <img src="${p.avatar_url || "/default-avatar.png"}" />
        <div>
          <div>${p.username || p.user_address?.slice(0, 6) + "..." + p.user_address?.slice(-4)}</div>
          <div class="post-time">${new Date(p.created_at).toLocaleString()}</div>
        </div>
      </div>
      <div class="post-media">
        <img src="${p.media_url}" alt="post" />
      </div>
      <div class="post-caption">${p.caption || ""}</div>
    `;
    feedView.appendChild(card);
  });
}

async function loadProfile() {
  const res = await fetch("/api/me", {
    headers: { Authorization: "Bearer " + jwtToken }
  });
  const me = await res.json();
  profileAddress.textContent = me.address;
  profileUsername.value = me.username || "";
  profileBio.value = me.bio || "";
  profileAvatarImg.src = me.avatar_url || "/default-avatar.png";

  const all = await fetch("/api/posts");
  const posts = await all.json();
  const mine = posts.filter((p) => p.user_address === me.address);
  myPosts.innerHTML = "";
  mine.forEach((p) => {
    const img = document.createElement("img");
    img.src = p.media_url;
    myPosts.appendChild(img);
  });
}

saveProfileBtn.onclick = async () => {
  const body = {
    username: profileUsername.value,
    bio: profileBio.value,
    avatar_url: profileAvatarImg.src
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
    profileSaveStatus.textContent = "Saved";
    loadFeed();
  } else {
    profileSaveStatus.textContent = "Error";
  }
};

profileAvatarFile.onchange = async (e) => {
  if (!jwtToken) {
    alert("Connect wallet first");
    return;
  }
  const file = e.target.files[0];
  if (!file) return;
  uploadStatus.textContent = "Uploading avatar...";
  const urlRes = await fetch("/api/cf/image-url", {
    method: "POST",
    headers: { Authorization: "Bearer " + jwtToken }
  });
  const urlData = await urlRes.json();
  if (!urlRes.ok) {
    uploadStatus.textContent =
      "CF avatar error: " + (urlData.error || "") + (urlData.cf ? " " + JSON.stringify(urlData.cf) : "");
    return;
  }
  const formData = new FormData();
  formData.append("file", file);
  const upRes = await fetch(urlData.uploadURL, {
    method: "POST",
    body: formData
  });
  const upJson = await upRes.json();
  if (!upRes.ok) {
    uploadStatus.textContent = "CF avatar upload fail";
    return;
  }
  const finalUrl = `${urlData.deliveryBase}/${urlData.id}/public`;
  profileAvatarImg.src = finalUrl;
  uploadStatus.textContent = "";
};

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
    uploadStatus.textContent =
      "Error: " + (urlData.error || "unknown") + (urlData.cf ? " " + JSON.stringify(urlData.cf) : "");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  uploadStatus.textContent = "Uploading to Cloudflare...";

  const upRes = await fetch(urlData.uploadURL, {
    method: "POST",
    body: formData
  });
  const upJson = await upRes.json();
  if (!upRes.ok || !upJson.success) {
    uploadStatus.textContent = "CF upload failed";
    console.log(upJson);
    return;
  }

  const finalUrl = `${urlData.deliveryBase}/${urlData.id}/public`;

  const postRes = await fetch("/api/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + jwtToken
    },
    body: JSON.stringify({
      media_url: finalUrl,
      media_type: file.type.startsWith("video") ? "video" : "image",
      caption
    })
  });
  if (!postRes.ok) {
    uploadStatus.textContent = "DB save failed";
    return;
  }
  uploadStatus.textContent = "Uploaded";
  fileInput.value = "";
  document.getElementById("caption").value = "";
  loadFeed();
});

loadFeed();

