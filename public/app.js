const API_BASE = `${window.location.origin}/api`;
const STORAGE_KEY = 'hextagram-auth';

const $ = id => document.getElementById(id);

const els = {
  feedBtn: $('nav-feed'),
  exploreBtn: $('nav-explore'),
  createBtn: $('nav-create'),
  profileBtn: $('nav-profile'),
  connectBtn: $('connect-wallet'),
  addressLabel: $('wallet-address'),
  feedList: $('feed-list'),
  exploreList: $('explore-list'),
  createForm: $('create-form'),
  createFileInput: $('create-image'),
  createPreview: $('create-preview'),
  createCaption: $('create-caption'),
  profileBox: $('profile-box'),
  profilePosts: $('profile-posts'),
  editModal: $('edit-profile-modal'),
  editName: $('edit-name'),
  editBio: $('edit-bio'),
  editAvatarUrl: $('edit-avatar-url'),
  editAvatarFile: $('edit-avatar-file'),
  editCancel: $('edit-cancel'),
  editSave: $('edit-save'),
  commentsModal: $('comments-modal'),
  commentsList: $('comments-list'),
  commentsInput: $('comments-input'),
  commentsSend: $('comments-send'),
  commentsClose: $('comments-close'),
  postModal: $('post-modal'),
  postModalContent: $('post-modal-content'),
  postClose: $('post-close'),
  mFeedBtn: $('m-nav-feed'),
  mExploreBtn: $('m-nav-explore'),
  mCreateBtn: $('m-nav-create'),
  mProfileBtn: $('m-nav-profile')
};

const state = {
  address: null,
  token: null,
  posts: [],
  profile: null,
  currentView: 'feed',
  viewingExternalProfile: false
};

function shorten(addr) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function applyAuthToUI() {
  if (state.address && els.addressLabel) {
    els.addressLabel.textContent = shorten(state.address);
  }
  if (els.connectBtn) {
    if (state.token) {
      els.connectBtn.textContent = 'Connected';
      els.connectBtn.disabled = true;
    } else {
      els.connectBtn.textContent = 'Connect';
      els.connectBtn.disabled = false;
    }
  }
}

function saveAuth() {
  if (state.token && state.address) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ address: state.address, token: state.token })
    );
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function restoreAuth() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data && data.address && data.token) {
      state.address = data.address;
      state.token = data.token;
      applyAuthToUI();
    }
  } catch (e) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function clearAuth() {
  state.address = null;
  state.token = null;
  saveAuth();
  applyAuthToUI();
}

function setView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(`${view}-section`);
  if (el) el.classList.remove('hidden');

  if (view === 'feed') loadFeed();
  if (view === 'explore') loadExplore();
  if (view === 'profile') {
    if (state.viewingExternalProfile) renderProfile();
    else loadProfile();
  }

  const mobileButtons = [
    els.mFeedBtn,
    els.mExploreBtn,
    els.mCreateBtn,
    els.mProfileBtn
  ];
  mobileButtons.forEach(btn => btn && btn.classList.remove('active'));
  if (view === 'feed' && els.mFeedBtn) els.mFeedBtn.classList.add('active');
  if (view === 'explore' && els.mExploreBtn) els.mExploreBtn.classList.add('active');
  if (view === 'create' && els.mCreateBtn) els.mCreateBtn.classList.add('active');
  if (view === 'profile' && els.mProfileBtn) els.mProfileBtn.classList.add('active');
}

async function connectWallet() {
  if (!window.ethereum) {
    alert('Install Metamask');
    return;
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const address = accounts[0];
  const message = `Login to Hextagram\n${new Date().toISOString()}`;
  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [message, address]
  });

  const r = await fetch(`${API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, message, signature })
  });
  if (!r.ok) {
    alert('Auth failed');
    return;
  }
  const data = await r.json();
  state.address = data.address;
  state.token = data.token;
  applyAuthToUI();
  saveAuth();
  loadFeed();
  loadProfile();
}

async function loadFeed() {
  const r = await fetch(`${API_BASE}/posts`, {
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {}
  });
  const posts = await r.json();
  state.posts = posts;
  renderFeed();
}

function renderFeed() {
  if (!els.feedList) return;
  els.feedList.innerHTML = '';
  if (!state.posts.length) {
    els.feedList.innerHTML = '<p class="empty">No posts yet</p>';
    return;
  }
  state.posts.forEach(post => {
    const card = createPostCard(post);
    els.feedList.appendChild(card);
  });
}

function createPostCard(post) {
  const art = document.createElement('article');
  art.className = 'post-card';

  const head = document.createElement('div');
  head.className = 'post-header';

  const avatar = document.createElement('div');
  avatar.className = 'post-avatar';
  if (post.avatar_url) avatar.style.backgroundImage = `url(${post.avatar_url})`;
  avatar.addEventListener('click', () => openUserProfile(post.address, post.username, post.avatar_url));

  const user = document.createElement('div');
  user.className = 'post-user';
  user.innerHTML = `<strong>${post.username || shorten(post.address)}</strong><span>${new Date(post.created_at).toLocaleString()}</span>`;
  user.addEventListener('click', () => openUserProfile(post.address, post.username, post.avatar_url));

  head.appendChild(avatar);
  head.appendChild(user);

  if (state.address && post.address && state.address.toLowerCase() === post.address.toLowerCase()) {
    const del = document.createElement('button');
    del.className = 'ghost small';
    del.textContent = 'Delete';
    del.onclick = () => deletePost(post.id);
    head.appendChild(del);
  }

  const media = document.createElement('div');
  media.className = 'post-media';
  if (post.media_url) {
    const img = document.createElement('img');
    img.src = post.media_url;
    img.alt = post.caption || '';
    media.appendChild(img);
  }

  const caption = document.createElement('div');
  caption.className = 'post-caption';
  caption.textContent = post.caption || '';

  const actions = document.createElement('div');
  actions.className = 'post-actions';

  const like = document.createElement('button');
  like.textContent = post.liked ? `♥ ${post.like_count}` : `♡ ${post.like_count}`;
  like.onclick = () => toggleLike(post, like);

  const comm = document.createElement('button');
  comm.textContent = `Comments ${post.comment_count}`;
  comm.onclick = () => openComments(post);

  const share = document.createElement('button');
  share.textContent = 'Share';

  actions.appendChild(like);
  actions.appendChild(comm);
  actions.appendChild(share);

  art.appendChild(head);
  art.appendChild(media);
  art.appendChild(caption);
  art.appendChild(actions);

  return art;
}

async function toggleLike(post, btn) {
  if (!state.token) {
    alert('Connect wallet');
    return;
  }
  const r = await fetch(`${API_BASE}/posts/${post.id}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.token}` }
  });
  const data = await r.json();
  post.like_count = data.likes;
  post.liked = data.liked;
  btn.textContent = post.liked ? `♥ ${post.like_count}` : `♡ ${post.like_count}`;
}

async function deletePost(id) {
  if (!state.token) return;
  if (!confirm('Delete this post?')) return;
  await fetch(`${API_BASE}/posts/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${state.token}` }
  });
  await loadFeed();
  if (!state.viewingExternalProfile) await loadProfile();
}

function openComments(post) {
  if (!els.commentsModal) return;
  els.commentsModal.classList.remove('hidden');
  els.commentsModal.dataset.postId = post.id;
  if (els.commentsList) els.commentsList.innerHTML = '';
  loadComments(post.id);
}

async function loadComments(postId) {
  const r = await fetch(`${API_BASE}/posts/${postId}/comments`);
  const items = await r.json();
  if (!els.commentsList) return;
  els.commentsList.innerHTML = '';
  items.forEach(c => {
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `<strong>${c.username || shorten(c.user_address)}</strong> ${c.content}`;
    els.commentsList.appendChild(div);
  });
}

async function sendComment() {
  if (!els.commentsModal) return;
  const postId = els.commentsModal.dataset.postId;
  if (!postId) return;
  if (!state.token) {
    alert('Connect wallet');
    return;
  }
  const text = els.commentsInput.value.trim();
  if (!text) return;
  const r = await fetch(`${API_BASE}/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`
    },
    body: JSON.stringify({ content: text })
  });
  if (!r.ok) return;
  els.commentsInput.value = '';
  loadComments(postId);
  loadFeed();
}

function closeEditProfile() {
  if (els.editModal) els.editModal.classList.add('hidden');
}

function openEditProfile() {
  if (!state.profile) return;
  els.editName.value = state.profile.username || '';
  els.editBio.value = state.profile.bio || '';
  els.editAvatarUrl.value = state.profile.avatar_url || '';
  els.editModal.classList.remove('hidden');
}

async function saveProfile() {
  if (!state.token) return;
  let avatarUrl = els.editAvatarUrl.value.trim();

  const file = els.editAvatarFile && els.editAvatarFile.files[0];
  if (file) {
    const form = new FormData();
    form.append('media', file);
    const r = await fetch(`${API_BASE}/upload-media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.token}` },
      body: form
    });
    const d = await r.json().catch(() => null);
    if (r.ok && d && d.url) {
      avatarUrl = d.url;
    }
  }

  await fetch(`${API_BASE}/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`
    },
    body: JSON.stringify({
      username: els.editName.value.trim(),
      bio: els.editBio.value.trim(),
      avatar_url: avatarUrl
    })
  });

  closeEditProfile();
  await loadProfile();
  await loadFeed();
}

async function loadProfile() {
  if (!state.token) {
    if (els.profileBox) els.profileBox.innerHTML = '<p>Connect wallet to see your profile</p>';
    return;
  }
  let data = null;
  try {
    const r = await fetch(`${API_BASE}/profile/me`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (r.ok) {
      data = await r.json();
    }
  } catch (e) {
    data = null;
  }
  if (!data) {
    data = {
      address: state.address,
      username: null,
      bio: '',
      avatar_url: '',
      posts_count: 0,
      followers_count: 0,
      following_count: 0,
      is_following: false
    };
  }
  state.profile = data;
  state.viewingExternalProfile = false;
  renderProfile();
}

async function toggleFollow(target) {
  if (!state.token) return;
  const current = document.getElementById('profile-follow-btn');
  const isFollowing = current && current.dataset.followed === '1';
  if (isFollowing) {
    await fetch(`${API_BASE}/follow/${target}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${state.token}` }
    });
  } else {
    await fetch(`${API_BASE}/follow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`
      },
      body: JSON.stringify({ target })
    });
  }
  await loadExternalProfile(target);
}

async function openUserProfile(address) {
  state.viewingExternalProfile = true;
  await loadExternalProfile(address);
  setView('profile');
}

async function loadExternalProfile(address) {
  const r = await fetch(`${API_BASE}/profile/${address}`, {
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {}
  });
  const data = await r.json();
  state.profile = data;
  state.viewingExternalProfile = true;
  renderProfile();
}

function renderProfile() {
  if (!els.profileBox || !state.profile) return;
  const p = state.profile;

  const isOwn = state.address && p.address && state.address.toLowerCase() === p.address.toLowerCase();
  const canFollow = state.token && !isOwn;

  els.profileBox.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar" style="background-image:${p.avatar_url ? `url(${p.avatar_url})` : 'none'}"></div>
      <div>
        <h2>${p.username || (p.address ? shorten(p.address) : 'User')}</h2>
        <p class="muted">${p.address || ''}</p>
        <p>${p.posts_count || 0} posts • ${p.followers_count || 0} followers • ${p.following_count || 0} following</p>
      </div>
      ${isOwn
        ? '<button id="profile-edit-btn" class="ghost">Edit profile</button>'
        : (canFollow
          ? `<button id="profile-follow-btn" class="${p.is_following ? 'ghost' : 'primary'}" data-followed="${p.is_following ? '1' : '0'}">${p.is_following ? 'Unfollow' : 'Follow'}</button>`
          : '')
      }
    </div>
    <p>${p.bio || ''}</p>
  `;

  if (isOwn) {
    const b = document.getElementById('profile-edit-btn');
    if (b) b.onclick = openEditProfile;
  } else if (canFollow) {
    const b = document.getElementById('profile-follow-btn');
    if (b) b.onclick = () => toggleFollow(p.address);
  }

  if (!els.profilePosts) return;
  els.profilePosts.innerHTML = '';

  const targetAddr = p.address ? p.address.toLowerCase() : null;
  const list = targetAddr
    ? state.posts.filter(post => post.address && post.address.toLowerCase() === targetAddr)
    : [];

  list.forEach(post => {
    if (!post.media_url) return;
    const d = document.createElement('div');
    d.className = 'profile-post';
    const img = document.createElement('img');
    img.src = post.media_url;
    d.appendChild(img);
    d.onclick = () => openPost(post);
    els.profilePosts.appendChild(d);
  });
}

function openPost(post) {
  if (!els.postModal) return;
  els.postModal.classList.remove('hidden');
  els.postModalContent.innerHTML = '';
  const card = createPostCard(post);
  els.postModalContent.appendChild(card);
}

async function loadExplore() {
  if (!els.exploreList) return;
  els.exploreList.innerHTML = '';
  state.posts.slice(0, 40).forEach(p => {
    if (!p.media_url) return;
    const img = document.createElement('img');
    img.src = p.media_url;
    img.alt = p.caption || '';
    img.onclick = () => openPost(p);
    els.exploreList.appendChild(img);
  });
}

async function submitCreate(e) {
  e.preventDefault();
  if (!state.token) {
    alert('Connect wallet first');
    return;
  }
  const file = els.createFileInput.files[0];
  if (!file) {
    alert('Image required');
    return;
  }
  const formData = new FormData();
  formData.append('media', file);

  const up = await fetch(`${API_BASE}/upload-media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.token}` },
    body: formData
  });
  const upData = await up.json().catch(() => null);
  if (!up.ok || !upData || !upData.url) {
    alert('Upload failed');
    return;
  }

  const r = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`
    },
    body: JSON.stringify({
      media_url: upData.url,
      caption: els.createCaption.value
    })
  });

  if (!r.ok) {
    alert('Post failed');
    return;
  }

  els.createForm.reset();
  els.createPreview.innerHTML = '';
  setView('feed');
  await loadFeed();
}

function handleCreatePreview() {
  const file = els.createFileInput.files[0];
  if (!file) {
    els.createPreview.innerHTML = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    els.createPreview.innerHTML = `<img src="${reader.result}" alt="preview" />`;
  };
  reader.readAsDataURL(file);
}

function init() {
  if (els.feedBtn) els.feedBtn.onclick = () => setView('feed');
  if (els.exploreBtn) els.exploreBtn.onclick = () => setView('explore');
  if (els.createBtn) els.createBtn.onclick = () => setView('create');
  if (els.profileBtn) els.profileBtn.onclick = () => {
    state.viewingExternalProfile = false;
    setView('profile');
  };

  if (els.mFeedBtn) els.mFeedBtn.onclick = () => setView('feed');
  if (els.mExploreBtn) els.mExploreBtn.onclick = () => setView('explore');
  if (els.mCreateBtn) els.mCreateBtn.onclick = () => setView('create');
  if (els.mProfileBtn) els.mProfileBtn.onclick = () => {
    state.viewingExternalProfile = false;
    setView('profile');
  };

  if (els.connectBtn) els.connectBtn.onclick = connectWallet;
  if (els.createForm) els.createForm.onsubmit = submitCreate;
  if (els.createFileInput) els.createFileInput.onchange = handleCreatePreview;
  if (els.commentsSend) els.commentsSend.onclick = sendComment;
  if (els.commentsClose) els.commentsClose.onclick = () => els.commentsModal.classList.add('hidden');
  if (els.postClose) els.postClose.onclick = () => els.postModal.classList.add('hidden');
  if (els.editCancel) els.editCancel.onclick = closeEditProfile;
  if (els.editSave) els.editSave.onclick = saveProfile;

  restoreAuth();
  applyAuthToUI();
  setView('feed');
  loadFeed();
  if (state.token) loadProfile();

  if (window.ethereum && typeof window.ethereum.on === 'function') {
    window.ethereum.on('accountsChanged', accounts => {
      if (!accounts || !accounts.length) {
        clearAuth();
        setView('feed');
        loadFeed();
        return;
      }
      const newAddress = accounts[0].toLowerCase();
      if (state.address && state.address.toLowerCase() !== newAddress) {
        clearAuth();
        setView('feed');
        loadFeed();
      }
    });
  }
}

init();

