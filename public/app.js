:root {
  --pulse-pink: #ff00ea;
  --pulse-cyan: #00c2ff;
  --pulse-purple: #6c2bd9;
  --bg: #f2f4f7;
  --panel: #ffffff;
  --text: #0f172a;
  --muted: #6b7280;
  --radius-lg: 1.25rem;
  --shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

.app-shell {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background: #0f172a;
  color: #fff;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 1rem 1.25rem 1.5rem;
  position: sticky;
  top: 0;
  height: 100vh;
}

.logo {
  font-weight: 700;
  font-size: 1.25rem;
  background: linear-gradient(135deg, var(--pulse-pink), var(--pulse-cyan));
  -webkit-background-clip: text;
  color: transparent;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.nav-item {
  background: transparent;
  border: none;
  color: #cbd5f5;
  text-align: left;
  padding: 0.55rem 0.75rem;
  border-radius: 0.8rem;
  cursor: pointer;
  font-size: 0.95rem;
}

.nav-item.active,
.nav-item:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.wallet-box {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.chain-tag {
  background: rgba(255, 0, 234, 0.15);
  border: 1px solid rgba(255, 0, 234, 0.35);
  border-radius: 9999px;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  width: fit-content;
}

.wallet-btn {
  background: linear-gradient(135deg, var(--pulse-pink), var(--pulse-cyan));
  border: none;
  border-radius: 999px;
  color: #0f172a;
  font-weight: 600;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.main {
  flex: 1;
  padding: 1.5rem 2.5rem 2.5rem;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.page-header h1 {
  margin: 0;
  font-size: 1.3rem;
}

.posts {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.post {
  background: var(--panel);
  border-radius: 1.25rem;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.post-header {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  padding: 0.95rem 1.1rem 0.25rem;
  cursor: pointer;
}

.post-avatar {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  object-fit: cover;
  background: #ddd;
}

.post-user {
  font-weight: 600;
}

.post-addr {
  font-size: 0.7rem;
  color: var(--muted);
}

.post-media img,
.post-media video {
  width: 100%;
  display: block;
  background: #000;
}

.post-footer {
  padding: 0.7rem 1.1rem 1rem;
}

.post-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}

.post-actions button {
  border: none;
  background: #edf2ff;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  cursor: pointer;
}

.post-actions .danger {
  background: rgba(255, 74, 74, 0.12);
  color: #b91c1c;
}

.post-meta {
  font-size: 0.7rem;
  color: var(--muted);
}

.post-caption {
  margin-top: 0.25rem;
}

.card {
  background: var(--panel);
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: var(--shadow);
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.file-drop {
  background: #eef2ff;
  border: 1.5px dashed rgba(108, 43, 217, 0.35);
  border-radius: 0.75rem;
  padding: 1.25rem;
  text-align: center;
  cursor: pointer;
}

.file-drop input {
  display: none;
}

textarea {
  min-height: 90px;
  resize: vertical;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  padding: 0.5rem 0.75rem;
  font-family: inherit;
}

.primary-btn {
  background: linear-gradient(135deg, var(--pulse-pink), var(--pulse-cyan));
  border: none;
  border-radius: 0.75rem;
  color: #0f172a;
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
}

.explore-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 1rem;
}

.explore-item {
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--shadow);
}

.explore-item img {
  width: 100%;
  height: 170px;
  object-fit: cover;
}

.profile-card {
  display: flex;
  gap: 1rem;
  background: var(--panel);
  padding: 1rem;
  border-radius: 1rem;
  box-shadow: var(--shadow);
  margin-bottom: 1.25rem;
}

.profile-avatar {
  width: 70px;
  height: 70px;
  border-radius: 999px;
  object-fit: cover;
  background: #ddd;
}

.section-title {
  margin-top: 1rem;
  margin-bottom: 0.75rem;
}

.muted {
  color: var(--muted);
  font-size: 0.75rem;
}

/* mobile */
@media (max-width: 920px) {
  .app-shell {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    height: auto;
    flex-direction: row;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
  }
  .nav {
    flex-direction: row;
    gap: 0.4rem;
  }
  .main {
    padding: 1.1rem 1rem 2.5rem;
  }
  .profile-card {
    flex-direction: column;
    align-items: flex-start;
  }
  .post {
    border-radius: 0.9rem;
  }
}

