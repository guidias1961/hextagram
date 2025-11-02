const API_BASE = '';

let authToken = localStorage.getItem('hextagram_token') || null;
let currentAccount = localStorage.getItem('hextagram_address') || null;

const sidebarButtons = document.querySelectorAll('.menu-item');
const views = {
  feed: document.getElementById('feedView'),
  explore: document.getElementById('exploreView'),
  create: document.getElementById('createView'),
  profile: document.getElementById('profileView'),
  publicProfile: document.getElementById('publicProfileView'),
};

const viewTitle = document.getElementById('viewTitle');
const feedList = document.getElementById('feedList');
const exploreGrid = document.getElementById('exploreGrid');
const postPreview = document.getElementById('postPreview');
const postFileInput = document.getElementById('postFileInput');
const publishPostBtn = document.getElementById('publishPostBtn');
const postError = document.getElementById('postError');
const walletStatus = document.getElementById('walletStatus');
const connectWalletBtn = document.getElementById('connectWalletBtn');

const myProfileCard = document.getElementById('myProfileCard');
const myProfilePosts = document.getElementById('myProfilePosts');

const publicProfileCard = document.getElementById('publicProfileCard');
const publicProfilePosts = document.getElementById('publicProfilePosts');

const editProfileModal = document.getElementById('editProfileModal');
const editUsername = document.getElementById('editUsername');
const editBio = document.getElementById('editBio');
const editAvatarFile = document.getElementById('editAvatarFile');
const cancelEditProfile = document.getElementById('cancelEditProfile');
const saveEditProfile = document.getElementById('saveEditProfile');

const postModal = document.getElementById('postModal');
const postModalContent = document.getElementById('postModalContent');
const closePostModal = document.getElementById('closePostModal');

let selectedPostFile = null;
let cachedPosts = [];
let currentPublicProfile = null;

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (authToken) h['Authorization'] = 'Bearer ' + authToken;
  return h;
}

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  if (name === 'publicProfile') {
    views.publicProfile.classList.remove('hidden');
  } else {
    views[name].classList.remove('hidden');
  }
  sidebarButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  viewTitle.textContent = name === 'publicProfile' ? 'Profile' : name[0].toUpperCase() + name.slice(1);
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'request failed');
  }
  return res.json();
}

function sliceAddress(addr) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

async function loadFeed() {
  try {
    const posts = await fetchJSON(API_BASE + '/api/posts', {
      headers: authHeaders()
    });
    cachedPosts = posts;
    renderFeed(posts);
  } catch (err) {
    console.error(err);
  }
}

function renderFeed(posts) {
  feedList.innerHTML = '';
  posts.forEach(post => {
    const card = document.createElement('article');
    card.className = 'post-card';
    card.innerHTML = `
      <header class="post-header" data-address="${post.address}">
        <img src="${post.avatar_url || '/uploads/default-avatar.png'}" class="post-user-avatar" onerror="this.src='/uploads/default-avatar.png'">
        <div class="post-user-meta">
          <span class="post-username">${post.username || 'Unnamed'}</span>
          <span class="post-user-address">${sliceAddress(post.address)}</span>
        </div>
      </header>
      <div class="post-media-wrap">
        <img src="${post.media_url}" alt="post media">
      </div>
      <div class="post-body">
        ${post.caption ? `<p class="post-caption">${post.caption}</p>` : ''}
        <div class="post-actions">
          <button class="icon-btn ${post.liked ? 'primary' : ''}" data-like="${post.id}">
            ♥ Like
          </button>
          <button class="icon-btn" data-comment="${post.id}">
            💬 Comment
          </button>
          <button class="icon-btn" data-share="${post.id}">
            ↗ Share
          </button>
          ${currentAccount && currentAccount.toLowerCase() === post.address.toLowerCase()
            ? `<button class="icon-btn" data-delete="${post.id}">🗑 Delete</button>` : ''}
        </div>
        <div class="count-text">
          ${post.like_count || 0} likes • ${post.comment_count || 0} comments
        </div>
      </div>
    `;
    feedList.appendChild(card);
  });
}

function renderExplore(posts) {
  exploreGrid.innerHTML = '';
  posts.forEach(post => {
    const item = document.createElement('div');
    item.className = 'explore-item';
    item.dataset.postId = post.id;
    item.innerHTML = `
      <img src="${post.media_url}" alt="">
      <div class="explore-meta">
        <img src="${post.avatar_url || '/uploads/default-avatar.png'}"
             onerror="this.src='/uploads/default-avatar.png'"
             style="width:22px;height:22px;border-radius:999px;cursor:pointer"
             data-profile="${post.address}">
        <span>${post.username || sliceAddress(post.address)}</span>
      </div>
    `;
    exploreGrid.appendChild(item);
  });
}

async function loadExplore() {
  try {
    const posts = cachedPosts.length
      ? cachedPosts
      : await fetchJSON('/api/posts', { headers: authHeaders() });
    renderExplore(posts);
  } catch (err) {
    console.error(err);
  }
}

postPreview.addEventListener('click', () => {
  postFileInput.click();
});
postFileInput.addEventListener('change', () => {
  const file = postFileInput.files[0];
  if (!file) return;
  selectedPostFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    postPreview.innerHTML = `<img src="${e.target.result}" alt="">`;
  };
  reader.readAsDataURL(file);
});

publishPostBtn.addEventListener('click', async () => {
  postError.textContent = '';
  if (!selectedPostFile) {
    postError.textContent = 'Select an image first.';
    return;
  }
  if (!authToken) {
    postError.textContent = 'Connect wallet first.';
    return;
  }
  try {
    const form = new FormData();
    form.append('media', selectedPostFile);
    const upRes = await fetch('/api/upload-media', {
      method: 'POST',
      headers: authToken ? { Authorization: 'Bearer ' + authToken } : {},
      body: form
    });
    const upJson = await upRes.json();
    if (!upJson.ok) throw new Error('upload failed');

    const caption = document.getElementById('postCaption').value;
    await fetchJSON('/api/posts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        media_url: upJson.url,
        caption
      })
    });

    await loadFeed();
    showView('feed');
    document.getElementById('postCaption').value = '';
    selectedPostFile = null;
    postPreview.innerHTML = '<span>Select image</span>';
  } catch (err) {
    console.error(err);
    postError.textContent = 'Failed to publish post.';
  }
});

feedList.addEventListener('click', async e => {
  const likeBtn = e.target.closest('[data-like]');
  const delBtn = e.target.closest('[data-delete]');
  const header = e.target.closest('.post-header');

  if (header) {
    const addr = header.dataset.address;
    if (addr) {
      openPublicProfile(addr);
    }
    return;
  }

  if (likeBtn) {
    const postId = likeBtn.dataset.like;
    await toggleLike(postId);
    return;
  }
  if (delBtn) {
    const postId = delBtn.dataset.delete;
    await deletePost(postId);
    return;
  }
});

exploreGrid.addEventListener('click', e => {
  const imgProfile = e.target.closest('[data-profile]');
  if (imgProfile) {
    const addr = imgProfile.dataset.profile;
    openPublicProfile(addr);
    return;
  }
  const item = e.target.closest('.explore-item');
  if (item) {
    const postId = item.dataset.postId;
    openPostModal(postId);
  }
});

async function toggleLike(postId) {
  if (!authToken) {
    alert('Connect wallet first');
    return;
  }
  try {
    const res = await fetchJSON(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers: authHeaders()
    });
    cachedPosts = cachedPosts.map(p => p.id === Number(postId)
      ? { ...p, like_count: res.likes, liked: res.liked }
      : p
    );
    renderFeed(cachedPosts);
  } catch (err) {
    console.error(err);
  }
}

async function deletePost(postId) {
  if (!confirm('Delete this post?')) return;
  try {
    await fetchJSON(`/api/posts/${postId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    cachedPosts = cachedPosts.filter(p => p.id !== Number(postId));
    renderFeed(cachedPosts);
  } catch (err) {
    console.error(err);
  }
}

async function loadMyProfile() {
  if (!authToken) {
    myProfileCard.innerHTML = `<p>Connect wallet to load profile.</p>`;
    myProfilePosts.innerHTML = '';
    return;
  }
  try {
    const me = await fetchJSON('/api/profile/me', {
      headers: authHeaders()
    });
    renderMyProfile(me);
    const posts = await fetchJSON(`/api/posts/by/${me.address}`, {
      headers: authHeaders()
    });
    renderProfilePosts(myProfilePosts, posts);
  } catch (err) {
    console.error(err);
  }
}

function renderMyProfile(me) {
  myProfileCard.innerHTML = `
    <img src="${me.avatar_url || '/uploads/default-avatar.png'}" class="profile-avatar" onerror="this.src='/uploads/default-avatar.png'">
    <div class="profile-info">
      <div class="profile-username">${me.username || 'Unnamed'}</div>
      <div class="profile-address">${sliceAddress(me.address)}</div>
      ${me.bio ? `<div class="profile-bio">${me.bio}</div>` : ''}
      <div class="profile-stats">
        <span>${me.posts_count} posts</span>
        <span>${me.followers_count} followers</span>
        <span>${me.following_count} following</span>
      </div>
    </div>
    <div class="profile-actions">
      <button class="ghost-btn" id="openEditProfile">Edit profile</button>
    </div>
  `;
  document.getElementById('openEditProfile').addEventListener('click', () => {
    openEditProfileModal(me);
  });
}

async function openPublicProfile(address) {
  try {
    const profile = await fetchJSON(`/api/profile/by/${address}`, {
      headers: authHeaders()
    });
    currentPublicProfile = profile;
    renderPublicProfile(profile);
    const posts = await fetchJSON(`/api/posts/by/${address}`, {
      headers: authHeaders()
    });
    renderProfilePosts(publicProfilePosts, posts);
    showView('publicProfile');
  } catch (err) {
    console.error(err);
    alert('User not found');
  }
}

function renderPublicProfile(profile) {
  publicProfileCard.innerHTML = `
    <img src="${profile.avatar_url || '/uploads/default-avatar.png'}" class="profile-avatar" onerror="this.src='/uploads/default-avatar.png'">
    <div class="profile-info">
      <div class="profile-username">${profile.username || 'Unnamed'}</div>
      <div class="profile-address">${sliceAddress(profile.address)}</div>
      ${profile.bio ? `<div class="profile-bio">${profile.bio}</div>` : ''}
      <div class="profile-stats">
        <span>${profile.posts_count} posts</span>
        <span>${profile.followers_count} followers</span>
        <span>${profile.following_count} following</span>
      </div>
    </div>
    <div class="profile-actions">
      ${profile.is_me
        ? '<span class="muted">This is you</span>'
        : `<button class="follow-btn" id="followUserBtn">${profile.is_following ? 'Unfollow' : 'Follow'}</button>`}
    </div>
  `;
  if (!profile.is_me) {
    document.getElementById('followUserBtn').addEventListener('click', async () => {
      await toggleFollow(profile);
    });
  }
}

async function toggleFollow(profile) {
  if (!authToken) {
    alert('Connect wallet first');
    return;
  }
  try {
    if (profile.is_following) {
      await fetchJSON(`/api/follow/${profile.address}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      profile.is_following = false;
    } else {
      await fetchJSON(`/api/follow/${profile.address}`, {
        method: 'POST',
        headers: authHeaders()
      });
      profile.is_following = true;
    }
    renderPublicProfile(profile);
  } catch (err) {
    console.error(err);
  }
}

function renderProfilePosts(targetEl, posts) {
  targetEl.innerHTML = '';
  posts.forEach(p => {
    const div = document.createElement('div');
    div.className = 'profile-post-thumbnail';
    div.dataset.postId = p.id;
    div.innerHTML = `<img src="${p.media_url}" alt="">`;
    div.addEventListener('click', () => {
      openPostModal(p.id);
    });
    targetEl.appendChild(div);
  });
}

function openPostModal(postId) {
  const post = cachedPosts.find(p => p.id === Number(postId));
  if (!post) return;
  postModalContent.innerHTML = `
    <img src="${post.media_url}" style="width:100%;border-radius:10px;margin-bottom:0.5rem">
    <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.4rem;cursor:pointer" data-address="${post.address}">
      <img src="${post.avatar_url || '/uploads/default-avatar.png'}" style="width:30px;height:30px;border-radius:999px" onerror="this.src='/uploads/default-avatar.png'">
      <div>
        <div style="font-weight:600;font-size:0.8rem">${post.username || 'Unnamed'}</div>
        <div style="font-size:0.63rem;color:#6b7280">${sliceAddress(post.address)}</div>
      </div>
    </div>
    ${post.caption ? `<p style="font-size:0.74rem">${post.caption}</p>` : ''}
  `;
  postModal.classList.remove('hidden');
  postModalContent.querySelector('[data-address]').addEventListener('click', () => {
    openPublicProfile(post.address);
    closePostModal.click();
  });
}
closePostModal.addEventListener('click', () => {
  postModal.classList.add('hidden');
});

function openEditProfileModal(me) {
  editUsername.value = me.username || '';
  editBio.value = me.bio || '';
  editAvatarFile.value = '';
  editProfileModal.classList.remove('hidden');
}
cancelEditProfile.addEventListener('click', () => {
  editProfileModal.classList.add('hidden');
});
saveEditProfile.addEventListener('click', async () => {
  try {
    let avatar_url = null;
    const file = editAvatarFile.files[0];
    if (file) {
      const fd = new FormData();
      fd.append('avatar', file);
      const up = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: authToken ? { Authorization: 'Bearer ' + authToken } : {},
        body: fd
      });
      const j = await up.json();
      if (j.ok) {
        avatar_url = j.avatar_url;
      }
    }

    await fetchJSON('/api/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        username: editUsername.value.trim(),
        bio: editBio.value.trim(),
        avatar_url
      })
    });
    editProfileModal.classList.add('hidden');
    await loadMyProfile();
    await loadFeed();
  } catch (err) {
    console.error(err);
    alert('Failed to update profile');
  }
});

sidebarButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    const view = btn.dataset.view;
    showView(view);
    if (view === 'feed') {
      await loadFeed();
    } else if (view === 'explore') {
      await loadExplore();
    } else if (view === 'profile') {
      await loadMyProfile();
    }
  });
});

connectWalletBtn.addEventListener('click', async () => {
  if (!window.ethereum) {
    alert('Install MetaMask');
    return;
  }
  try {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    });
    const account = accounts[0];
    currentAccount = account;
    walletStatus.textContent = sliceAddress(account);
    localStorage.setItem('hextagram_address', account);

    const message = 'Login to Hextagram with wallet ' + account;
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, account]
    });

    const auth = await fetchJSON('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: account, message, signature })
    });
    authToken = auth.token;
    localStorage.setItem('hextagram_token', auth.token);

    await loadFeed();
    await loadMyProfile();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Failed to connect wallet');
  }
});

(async function init() {
  if (currentAccount) {
    walletStatus.textContent = sliceAddress(currentAccount);
  }
  await loadFeed();
})();

