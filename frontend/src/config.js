// Where the Knoprix backend lives.
//
// - Local dev: Vite proxies /api -> http://127.0.0.1:8000 (see vite.config.js),
//   so the default '/api' works with zero config.
// - Deployed frontend: build with VITE_API_URL set to the backend origin,
//   e.g.  VITE_API_URL=https://yourname.pythonanywhere.com
//   or     VITE_API_URL=https://your-backend.onrender.com
// The '/api' path prefix is appended automatically, so a bare origin is all
// you need. The trailing slash is stripped so string concatenation is safe.
const envUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const API_BASE = envUrl
  ? (envUrl.endsWith('/api') ? envUrl : `${envUrl}/api`)
  : '/api';
