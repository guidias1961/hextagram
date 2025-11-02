const API_BASE = `${window.location.origin}/api`;

const state = {
  address: null,
  token: null,
  posts: [],
  profile: null,
  currentView: 'feed',
  viewingExternalProfile: false
};

// resto igual ao que eu te mandei, só muda o create

async function submitCreate(e) {
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

  try {
    const formData = new FormData();
    formData.append('media', file);

    const uploadRes = await fetch(`${API_BASE}/upload-media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${state.token}`,
      },
      body: formData,
    });

    const uploadData = await uploadRes.json().catch(() => null);

    if (!uploadRes.ok || !uploadData || !uploadData.url) {
      console.error('upload error', uploadData);
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
      const err = await postRes.json().catch(() => ({}));
      console.error('post error', err);
      alert('Post failed');
      return;
    }

    els.createForm.reset();
    els.createPreview.innerHTML = '';
    setView('feed');
    await loadFeed();
  } catch (err) {
    console.error(err);
    alert('Upload failed (network)');
  }
}

