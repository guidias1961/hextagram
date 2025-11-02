const API_BASE = `${window.location.origin}/api`;

const state = {
  address: null,
  token: null,
  posts: [],
  profile: null,
  currentView: 'feed',
  viewingExternalProfile: false
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
  postModal: document.getElementById('post-modal'),
  postModalContent: document.getElementById('post-modal-content'),
  postClose: document.getElementById('post-close')
};

function linkify(text) {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(
    urlRegex,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function setView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`${view}-section`).classList.remove('hidden');

  if (view === 'feed') loadFeed();
  if (view === 'explore') loadExplore();
  if (view === 'profile') {
    if (state.viewingExternalProfile) {
      renderProfile();
    } else {
      loadProfile();
    }
  }
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

  for (const post of posts) {
    if (post.comment_count && post.comment_count > 0) {
      try {
        const cres = await fetch(`${API_BASE}/posts/${post.id}/comments`);
        const all = await cres.json();
        post.preview_comments = all.slice(0, 5);
      } catch (e) {
        post.preview_comments = [];
      }
    } else {
      post.preview_comments = [];
    }
  }

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

function openPost(post) {
  els.postModal.classList.remove('hidden');
  els.postModalContent.innerHTML = '';
  const card = createPostCard(post);
  card.classList.add('post-card-modal');
  els.postModalContent.appendChild(card);
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
  if (post.address) {
    avatar.style.cursor = 'pointer';
    avatar.addEventListener('click', () => openUserProfile(post.address, post.username, post.avatar_url));
  }

  const user = document.createElement('div');
  user.className = 'post-user';
  user.innerHTML = `<strong>${post.username || shortenAddress(post.address)}</strong><span>${new Date(post.created_at).toLocaleString()}</span>`;
  if (post.address) {
    user.style.cursor = 'pointer';
    user.addEventListener('click', () => openUserProfile(post.address, post.username, post.avatar_url));
  }

  header.appendChild(avatar);
  header.appendChild(user);

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
  caption.innerHTML = linkify(post.caption || '');

  const actions = document.createElement('div');
  actions.className = 'post-actions';

  const likeBtn = document.createElement('button');
  likeBtn.textContent = post.liked ? `♥ ${post.like_count}` : `♡ ${post.like_count}`;
  likeBtn.addEventListener('click', async () => {
    if (!state.token) {
      alert('Connect wallet');
      return;
    }
    const res = await fetch(`${API_BASE}/posts/${post.id}/like`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${state.token}`,
      },
    });
    const data = await res.json();
    post.like_count = data.likes;
    post.liked = data.liked;
    likeBtn.textContent = post.liked ? `♥ ${post.like_count}` : `♡ ${post.like_count}`;
  });

  const commentBtn = document.createElement('button');
  commentBtn.textContent = `Comments ${post.comment_count}`;
  commentBtn.addEventListener('click', () => openComments(post));

  const shareBtn = document.createElement('button');
  shareBtn.textContent = 'Share';

  actions.appendChild(likeBtn);
  actions.appendChild(commentBtn);
  actions.appendChild(shareBtn);

  card.appendChild(header);
  card.appendChild(media);
  card.appendChild(caption);

  if (post.preview_comments && post.preview_comments.length > 0) {
    const preview = document.createElement('div');
    preview.className = 'comment-preview';
    post.preview_comments.forEach(c => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML = `<strong>${c.username || shortenAddress(c.user_address)}</strong> ${c.content}`;
      preview.appendChild(item);
    });
    card.appendChild(preview);
  }

  card.appendChild(actions);

  if (state.address && post.address && state.address.toLowerCase() === post.address.toLowerCase()) {
    const del = document.createElement('button');
    del.className = 'ghost';
    del.textContent = 'Delete';
    del.style.margin = '0 0 12px 16px';
    del.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      await fetch(`${API_BASE}/posts/${post.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${state.token}` },
      });
      await loadFeed();
      if (!state.viewingExternalProfile) {
        await loadProfile();
      }
    });
    card.appendChild(del);
  }

  return card;
}

// COMMENTS
function openComments(post) {
  els.commentsModal.classList.remove('hidden');
  els.commentsList.innerHTML = '';
  els.commentsModal.dataset.postId = post.id;
  document.getElementById('comments-title').textContent = `Comments for post #${post.id}`;
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
  const postId = els.commentsModal.dataset.postId;
  const txt = els.commentsInput.value.trim();
  if (!txt) return;
  if (!state.token) {
    alert('Connect wallet');
    return;
  }
  await fetch(`${API_BASE}/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify({ content: txt }),
  });
  els.commentsInput.value = '';
  await loadComments(postId);
  await loadFeed();
}

// CREATE
async function handleCreate(e) {
  e.preventDefault();
  if (!state.token) {
    alert('Connect wallet');
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
  state.viewingExternalProfile = false;
  renderProfile();
}

function renderProfile() {
  const p = state.profile;
  if (!p) return;
  const isOwn = !state.viewingExternalProfile && state.address && p.address && state.address.toLowerCase() === p.address.toLowerCase();

  const canFollow = state.token && state.address && !isOwn && p.address;

  els.profileBox.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar" style="background-image: ${p.avatar_url ? `url(${p.avatar_url})` : 'none'}"></div>
      <div>
        <h2>${p.username || shortenAddress(p.address)}</h2>
        <p class="muted">${p.address}</p>
        <p>${p.posts_count} posts • ${p.followers_count} followers • ${p.following_count} following</p>
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
    document.getElementById('profile-edit-btn').onclick = openEditProfile;
  } else if (canFollow) {
    const btn = document.getElementById('profile-follow-btn');
    btn.onclick = async () => {
      const followed = btn.dataset.followed === '1';
      if (followed) {
        await fetch(`${API_BASE}/follow/${p.address}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${state.token}` },
        });
      } else {
        await fetch(`${API_BASE}/follow`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${state.token}`,
          },
          body: JSON.stringify({ target: p.address }),
        });
      }

      if (state.viewingExternalProfile) {
        const r = await fetch(`${API_BASE}/profile/${p.address}`, {
          headers: { Authorization: `Bearer ${state.token}` },
        });
        const fresh = await r.json();
        state.profile = fresh;
        renderProfile();
      } else {
        await loadProfile();
      }
    };
  }

  const myPosts = state.posts.filter(post => post.address && p.address && post.address.toLowerCase() === p.address.toLowerCase());
  els.profilePosts.innerHTML = '';
  myPosts.forEach(post => {
    if (!post.media_url) return;
    const item = document.createElement('div');
    item.className = 'profile-post';
    const img = document.createElement('img');
    img.src = post.media_url;
    img.alt = post.caption || '';
    item.appendChild(img);
    const meta = document.createElement('div');
    meta.className = 'profile-post-meta';
    meta.innerHTML = `<span>♡ ${post.like_count}</span><span>Comments ${post.comment_count}</span><span>Share</span>`;
    item.appendChild(meta);
    item.addEventListener('click', () => openPost(post));
    els.profilePosts.appendChild(item);
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

async function openUserProfile(address, username, avatarUrl) {
  if (state.address && address && state.address.toLowerCase() === address.toLowerCase()) {
    state.viewingExternalProfile = false;
    setView('profile');
    return;
  }

  let profileData = null;

  if (state.token) {
    try {
      const res = await fetch(`${API_BASE}/profile/${address}`, {
        headers: { Authorization: `Bearer ${state.token}` },
      });
      if (res.ok) {
        profileData = await res.json();
      }
    } catch (e) {
      profileData = null;
    }
  }

  if (!profileData) {
    const userPosts = state.posts.filter(p => p.address && p.address.toLowerCase() === address.toLowerCase());
    profileData = {
      address,
      username: username || (userPosts[0] ? userPosts[0].username : shortenAddress(address)),
      avatar_url: avatarUrl || (userPosts[0] ? userPosts[0].avatar_url : ''),
      bio: '',
      posts_count: userPosts.length,
      followers_count: 0,
      following_count: 0,
      is_following: false
    };
  }

  state.profile = profileData;
  state.viewingExternalProfile = true;
  setView('profile');
}

// EXPLORE (mock simples)
async function loadExplore() {
  els.exploreList.innerHTML = '';
  const imgs = state.posts.slice(0, 30);
  imgs.forEach(p => {
    if (!p.media_url) return;
    const img = document.createElement('img');
    img.src = p.media_url;
    img.alt = p.caption || '';
    img.addEventListener('click', () => openPost(p));
    els.exploreList.appendChild(img);
  });
}

// events
els.feedBtn.addEventListener('click', () => setView('feed'));
els.exploreBtn.addEventListener('click', () => setView('explore'));
els.createBtn.addEventListener('click', () => setView('create'));
els.profileBtn.addEventListener('click', () => {
  state.viewingExternalProfile = false;
  setView('profile');
});
els.connectBtn.addEventListener('click', connectWallet);

els.createForm.addEventListener('submit', handleCreate);
els.createFileInput.addEventListener('change', handleCreatePreview);

els.commentsSend.addEventListener('click', sendComment);
document.getElementById('comments-close').addEventListener('click', () => {
  els.commentsModal.classList.add('hidden');
});

els.postClose.addEventListener('click', () => {
  els.postModal.classList.add('hidden');
});

els.editCancel.addEventListener('click', closeEditProfile);
els.editSave.addEventListener('click', saveProfile);

// init
loadFeed();

