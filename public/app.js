const API_BASE = `${window.location.origin}/api`;

const state = {
  address: null,
  token: null,
  posts: [],
  profile: null,
  currentView: 'feed'
};

const els = {
  feedBtn: document.getElementById('nav-feed'),
  exploreBtn: document.getElementById('nav-explore'),
  createBtn: document.getElementById('nav-create'),
  profileBtn: document.getElementById('nav-profile'),
  connectBtn: document.getElementById('connect-wallet'),
  addressLabel: document.getElementById('wallet-address'),
  feedList: document.getElementById('feed-list'),
  exploreList: document.getElementById('explore-list'),
  createForm: document.getElementById('create-form'),
  createFileInput: document.getElementById('create-image'),
  createPreview: document.getElementById('create-preview'),
  createCaption: document.getElementById('create-caption'),
  profileBox: document.getElementById('profile-box'),
  profilePosts: document.getElementById('profile-posts'),
  editModal: document.getElementById('edit-profile-modal'),
  editName: document.getElementById('edit-name'),
  editBio: document.getElementById('edit-bio'),
  editAvatarUrl: document.getElementById('edit-avatar-url'),
  editAvatarFile: document.getElementById('edit-avatar-file'),
  editCancel: document.getElementById('edit-cancel'),
  editSave: document.getElementById('edit-save'),
  commentsModal: document.getElementById('comments-modal'),
  commentsList: document.getElementById('comments-list'),
  commentsInput: document.getElementById('comments-input'),
  commentsSend: document.getElementById('comments-send'),
};

function setView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`${view}-section`).classList.remove('hidden');

  if (view === 'feed') loadFeed();
  if (view === 'explore') loadExplore();
  if (view === 'profile') loadProfile();
}

function setAuth(address, token) {
  state.address = address;
  state.token = token;
  els.addressLabel.textContent = address ? shortenAddress(address) : 'Not connected';
  if (address) {
    els.connectBtn.textContent = 'Connected';
    els.connectBtn.disabled = true;
  }
}

function shortenAddress(addr) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

async function connectWallet() {
  if (!window.ethereum) {
    alert('Install MetaMask');
    return;
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const address = accounts[0];
  const message = `Login to Hextagram\n${new Date().toISOString()}`;
  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [message, address],
  });

  const res = await fetch(`${API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, message, signature }),
  });
  if (!res.ok) {
    alert('Auth failed');
    return;
  }
  const data = await res.json();
  setAuth(data.address, data.token);
  loadFeed();
  loadProfile();
}

async function loadFeed() {
  const res = await fetch(`${API_BASE}/posts`, {
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
  });
  const posts = await res.json();
  state.posts = posts;
  renderFeed();
}

function renderFeed() {
  els.feedList.innerHTML = '';
  if (!state.posts || state.posts.length === 0) {
    els.feedList.innerHTML = '<p class="empty">No posts yet</p>';
    return;
  }
  state.posts.forEach(post => {
    const card = createPostCard(post);
    els.feedList.appendChild(card);
  });
}

function createPostCard(post) {
  const card = document.createElement('article');
  card.className = 'post-card';

  const header = document.createElement('div');
  header.className = 'post-header';

  const avatar = document.createElement('div');
  avatar.className = 'post-avatar';
  if (post.avatar_url) {
    avatar.style.backgroundImage = `url(${post.avatar_url})`;
  }

  const user = document.createElement('div');
  user.className = 'post-user';
  user.innerHTML = `<strong>${post.username || shortenAddress(post.address)}</strong><span>${new Date(post.created_at).toLocaleString()}</span>`;

  header.appendChild(avatar);
  header.appendChild(user);

  if (state.address && state.address.toLowerCase() === post.address.toLowerCase()) {
    const delBtn = document.createElement('button');
    delBtn.className = 'ghost small';
    delBtn.textContent = 'Delete';
    delBtn.onclick = () => deletePost(post.id);
    header.appendChild(delBtn);
  }

  const media = document.createElement('div');
  media.className = 'post-media';
  if (post.media_url) {
    const img = document.createElement('img');
    img.src = post.media_url;
    img.alt = post.caption || '';
    media.appendChild(img);
  } else {
    media.innerHTML = '<div class="no-media">media not found</div>';
  }

  const caption = document.createElement('p');
  caption.className = 'post-caption';
  caption.textContent = post.caption || '';

  const actions = document.createElement('div');
  actions.className = 'post-actions';

  const likeBtn = document.createElement('button');
  likeBtn.textContent = post.liked ? `♥ ${post.like_count}` : `♡ ${post.like_count}`;
  likeBtn.onclick = () => toggleLike(post.id);

  const commentBtn = document.createElement('button');
  commentBtn.textContent = `Comments ${post.comment_count}`;
  commentBtn.onclick = () => openComments(post);

  const shareBtn = document.createElement('button');
  shareBtn.textContent = 'Share';
  shareBtn.onclick = () => sharePost(post);

  actions.appendChild(likeBtn);
  actions.appendChild(commentBtn);
  actions.appendChild(shareBtn);

  card.appendChild(header);
  card.appendChild(media);
  card.appendChild(caption);
  card.appendChild(actions);

  return card;
}

async function toggleLike(postId) {
  if (!state.token) {
    alert('Connect wallet first');
    return;
  }
  const res = await fetch(`${API_BASE}/posts/${postId}/like`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
    },
  });
  const data = await res.json();
  const idx = state.posts.findIndex(p => p.id === postId);
  if (idx !== -1) {
    state.posts[idx].like_count = data.likes;
    state.posts[idx].liked = data.liked;
    renderFeed();
  }
}

function openComments(post) {
  els.commentsModal.classList.remove('hidden');
  els.commentsModal.dataset.postId = post.id;
  document.getElementById('comments-title').textContent = 'Comments';
  loadComments(post.id);
}

async function loadComments(postId) {
  const res = await fetch(`${API_BASE}/posts/${postId}/comments`);
  const comments = await res.json();
  els.commentsList.innerHTML = '';
  comments.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.innerHTML = `<strong>${c.username || shortenAddress(c.user_address)}</strong> ${c.content}`;
    els.commentsList.appendChild(item);
  });
}

async function sendComment() {
  const postId = Number(els.commentsModal.dataset.postId);
  const text = els.commentsInput.value.trim();
  if (!text) return;
  if (!state.token) {
    alert('Connect wallet first');
    return;
  }
  await fetch(`${API_BASE}/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify({ content: text }),
  });
  els.commentsInput.value = '';
  await loadComments(postId);
  await loadFeed();
}

function closeComments() {
  els.commentsModal.classList.add('hidden');
}

function sharePost(post) {
  const url = `${window.location.origin}/#post-${post.id}`;
  navigator.clipboard.writeText(url).then(() => {
    alert('Link copied');
  });
}

async function deletePost(postId) {
  if (!state.token) {
    alert('Connect wallet first');
    return;
  }
  if (!confirm('Delete this post?')) return;
  const res = await fetch(`${API_BASE}/posts/${postId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${state.token}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'failed to delete');
    return;
  }
  await loadFeed();
  await loadProfile();
}

// CREATE POST
async function submitCreate(e) {
  e.preventDefault();
  if (!state.token) {
    alert('Connect wallet first');
    return;
  }
  const file = els.createFileInput.files[0];
  if (!file) {
    alert('Select an image');
    return;
  }

  const formData = new FormData();
  formData.append('media', file);

  const uploadRes = await fetch(`${API_BASE}/upload-media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.token}`,
    },
    body: formData,
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.url) {
    alert('Upload failed');
    return;
  }

  const postRes = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify({
      media_url: uploadData.url,
      caption: els.createCaption.value,
    }),
  });
  if (!postRes.ok) {
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

// PROFILE
async function loadProfile() {
  if (!state.token) {
    els.profileBox.innerHTML = '<p>Connect wallet to see your profile</p>';
    return;
  }
  const res = await fetch(`${API_BASE}/profile/me`, {
    headers: { Authorization: `Bearer ${state.token}` },
  });
  const data = await res.json();
  state.profile = data;
  renderProfile();
}

function renderProfile() {
  const p = state.profile;
  if (!p) return;

  els.profileBox.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar" style="background-image: ${p.avatar_url ? `url(${p.avatar_url})` : 'none'}"></div>
      <div>
        <h2>${p.username || shortenAddress(p.address)}</h2>
        <p class="muted">${p.address}</p>
        <p>${p.posts_count} posts • ${p.followers_count} followers • ${p.following_count} following</p>
      </div>
      <button id="profile-edit-btn" class="ghost">Edit profile</button>
    </div>
    <p>${p.bio || ''}</p>
  `;

  document.getElementById('profile-edit-btn').onclick = openEditProfile;

  const myPosts = state.posts.filter(post => post.address.toLowerCase() === p.address.toLowerCase());
  els.profilePosts.innerHTML = '';
  myPosts.forEach(post => {
    if (!post.media_url) return;
    const img = document.createElement('img');
    img.src = post.media_url;
    img.alt = post.caption || '';
    els.profilePosts.appendChild(img);
  });
}

function openEditProfile() {
  const p = state.profile;
  els.editModal.classList.remove('hidden');
  els.editName.value = p?.username || '';
  els.editBio.value = p?.bio || '';
  els.editAvatarUrl.value = p?.avatar_url || '';
}

function closeEditProfile() {
  els.editModal.classList.add('hidden');
  els.editAvatarFile.value = '';
}

async function saveProfile() {
  let avatarUrl = els.editAvatarUrl.value.trim();

  const avatarFile = els.editAvatarFile.files[0];
  if (avatarFile) {
    const formData = new FormData();
    formData.append('avatar', avatarFile);
    const upload = await fetch(`${API_BASE}/profile/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${state.token}`,
      },
      body: formData,
    });
    const data = await upload.json();
    avatarUrl = data.avatar_url;
  }

  await fetch(`${API_BASE}/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify({
      username: els.editName.value.trim(),
      bio: els.editBio.value.trim(),
      avatar_url: avatarUrl,
    }),
  });

  closeEditProfile();
  await loadProfile();
  await loadFeed();
}

// explore
async function loadExplore() {
  const res = await fetch(`${API_BASE}/posts`);
  const posts = await res.json();
  els.exploreList.innerHTML = '';
  posts.forEach(post => {
    if (!post.media_url) return;
    const img = document.createElement('img');
    img.src = post.media_url;
    img.alt = post.caption || '';
    els.exploreList.appendChild(img);
  });
}

// events
els.connectBtn.addEventListener('click', connectWallet);
els.feedBtn.addEventListener('click', () => {
  setView('feed');
});
els.exploreBtn.addEventListener('click', () => {
  setView('explore');
});
els.createBtn.addEventListener('click', () => {
  setView('create');
});
els.profileBtn.addEventListener('click', () => {
  setView('profile');
});
els.createForm.addEventListener('submit', submitCreate);
els.createFileInput.addEventListener('change', handleCreatePreview);
els.editCancel.addEventListener('click', closeEditProfile);
els.editSave.addEventListener('click', saveProfile);
document.getElementById('comments-close').addEventListener('click', closeComments);
els.commentsSend.addEventListener('click', sendComment);

// initial
setView('feed');
loadFeed();

