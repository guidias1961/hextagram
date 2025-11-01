// public/app.js
const CLOUDINARY_UPLOAD_URL = "https://api.cloudinary.com/v1_1/dg2xpadhr/upload";
const CLOUDINARY_UPLOAD_PRESET = "hextagram_unsigned";

let authToken = null;
let currentAddress = null;

const feedView = document.getElementById("feedView");
const profileView = document.getElementById("profileView");
const uploadView = document.getElementById("uploadView");
const feedList = document.getElementById("feedList");
const myPosts = document.getElementById("myPosts");
const connectBtn = document.getElementById("connectBtn");
const walletStatus = document.getElementById("walletStatus");
const profileAddress = document.getElementById("profileAddress");
const profileUsername = document.getElementById("profileUsername");
const profileBio = document.getElementById("profileBio");
const profileAvatar = document.getElementById("profileAvatar");
const profileAvatarFile = document.getElementById("profileAvatarFile");
const uploadFile = document.getElementById("uploadFile");
const uploadCaption = document.getElementById("uploadCaption");
const uploadBtn = document.getElementById("uploadBtn");
const uploadStatus = document.getElementById("uploadStatus");

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    [feedView, profileView, uploadView].forEach(v => v.classList.remove("active"));
    if (btn.dataset.view === "feed") feedView.classList.add("active");
    if (btn.dataset.view === "profile") profileView.classList.add("active");
    if (btn.dataset.view === "upload") uploadView.classList.add("active");
  });
});

async function connectWallet() {
  if (!window.ethereum) {
    alert("Metamask não encontrada");
    return;
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const address = accounts[0];
  currentAddress = address;
  walletStatus.textContent = address.slice(0, 6) + "..." + address.slice(-4);

  const message = "Hextagram login " + Date.now();
  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: [message, address]
  });

  const r = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, message, signature })
  });
  const data = await r.json();
  authToken = data.token;
  loadMyProfile();
}
connectBtn.addEventListener("click", connectWallet);

async function fetchFeed() {
  const r = await fetch("/api/posts");
  const data = await r.json();
  renderFeed(data, feedList);
}
function renderFeed(posts, container) {
  container.innerHTML = "";
  posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `
      <div class="post-head">
        <img src="${p.avatar_url || "https://placehold.co/48x48"}" />
        <div>
          <div>${p.username || p.address || "anon"}</div>
          <small>${new Date(p.created_at).toLocaleString()}</small>
        </div>
      </div>
      <img src="${p.media_url}" />
      ${p.caption ? `<div style="padding:10px 12px 14px 12px">${p.caption}</div>` : ""}
    `;
    container.appendChild(div);
  });
}
async function loadMyProfile() {
  if (!authToken) return;
  const r = await fetch("/api/profile/me", {
    headers: { Authorization: "Bearer " + authToken }
  });
  const data = await r.json();
  profileAddress.textContent = currentAddress;
  profileUsername.value = data?.username || "";
  profileBio.value = data?.bio || "";
  profileAvatar.src = data?.avatar_url || "https://placehold.co/96x96";
  loadMyPosts();
}
document.getElementById("saveProfileBtn").addEventListener("click", async () => {
  if (!authToken) {
    alert("Conecte a wallet");
    return;
  }
  await fetch("/api/profile", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + authToken
    },
    body: JSON.stringify({
      username: profileUsername.value,
      bio: profileBio.value,
      avatar_url: profileAvatar.src
    })
  });
  alert("saved");
});
profileAvatarFile.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  uploadStatus.textContent = "uploading avatar...";
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const r = await fetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body: fd });
  const data = await r.json();
  if (data.secure_url) {
    profileAvatar.src = data.secure_url;
    uploadStatus.textContent = "";
  } else {
    uploadStatus.textContent = "avatar upload fail";
  }
});
uploadBtn.addEventListener("click", async () => {
  if (!authToken) {
    alert("Conecte a wallet");
    return;
  }
  const file = uploadFile.files[0];
  if (!file) {
    alert("selecione um arquivo");
    return;
  }
  uploadStatus.textContent = "enviando para cloudinary...";
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const r = await fetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body: fd });
  const data = await r.json();
  if (!data.secure_url) {
    uploadStatus.textContent = "erro cloudinary";
    return;
  }
  uploadStatus.textContent = "salvando no hextagram...";
  await fetch("/api/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + authToken
    },
    body: JSON.stringify({
      media_url: data.secure_url,
      caption: uploadCaption.value
    })
  });
  uploadStatus.textContent = "ok";
  uploadFile.value = "";
  uploadCaption.value = "";
  fetchFeed();
  loadMyPosts();
});
async function loadMyPosts() {
  const r = await fetch("/api/posts");
  const data = await r.json();
  const mine = data.filter(
    p => p.address && currentAddress && p.address.toLowerCase() === currentAddress.toLowerCase()
  );
  renderFeed(mine, myPosts);
}
fetchFeed();

