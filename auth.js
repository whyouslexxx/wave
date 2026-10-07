'use strict';
// Аккаунты, сессии и история просмотров. Хранилище — JSON-файл (без внешних зависимостей).
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const DATA_DIR = process.env.WAVE_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');

const COOKIE_NAME     = 'wave_sid';
const SESSION_TTL_MS  = 30 * 24 * 3600 * 1000;
const USERNAME_RE     = /^[\p{L}\p{N}_.-]{3,24}$/u;
const MIN_PASSWORD    = 8;
const MAX_PASSWORD    = 128;
const MAX_AVATAR_LEN  = 250_000;
const HISTORY_MAX     = 100;

// ── Хранилище ───────────────────────────────────────────────────────────────
let db = { users: {}, sessions: {} };
const idByName = new Map();

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = { users: parsed.users || {}, sessions: parsed.sessions || {} };
    }
  } catch (e) {
    console.error('[auth] db load error:', e.message);
  }
  for (const u of Object.values(db.users)) idByName.set(u.username.toLowerCase(), u.id);
  pruneSessions();
}

let saveTimer = null;
function save(immediate = false) {
  if (immediate) return flush();
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 2000);
}
function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error('[auth] db save error:', e.message);
  }
}

function pruneSessions() {
  const now = Date.now();
  for (const [k, s] of Object.entries(db.sessions)) if (s.exp < now) delete db.sessions[k];
}

// ── Пароли и сессии ─────────────────────────────────────────────────────────
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
const DUMMY_HASH_PROMISE = hashPassword('wave-dummy-password');

async function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual   = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[sha256(token)] = { uid: userId, exp: Date.now() + SESSION_TTL_MS };
  save();
  return token;
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore */ }
    }
  });
  return out;
}

function userFromToken(token) {
  if (!token) return null;
  const key = sha256(token);
  const s = db.sessions[key];
  if (!s) return null;
  if (s.exp < Date.now()) { delete db.sessions[key]; return null; }
  const user = db.users[s.uid];
  if (!user) return null;
  if (s.exp - Date.now() < SESSION_TTL_MS / 2) { s.exp = Date.now() + SESSION_TTL_MS; save(); }
  return user;
}

function setSessionCookie(req, res, token, maxAgeMs = SESSION_TTL_MS) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.append('Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure ? '; Secure' : ''}`);
}

// ── Лимиты на подбор паролей ────────────────────────────────────────────────
const attempts = new Map();
function hit(key, max, windowMs) {
  const now = Date.now();
  let r = attempts.get(key);
  if (!r || now > r.resetAt) { r = { count: 0, resetAt: now + windowMs }; attempts.set(key, r); }
  r.count++;
  return r.count > max;
}
function tooMany(key, max) {
  const r = attempts.get(key);
  return !!r && Date.now() <= r.resetAt && r.count >= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, r] of attempts) if (now > r.resetAt) attempts.delete(k);
  pruneSessions();
}, 600_000).unref();

const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

// ── Представление пользователя ──────────────────────────────────────────────
function letterAvatarDataUri(name) {
  const colors = ['#4A9E6E', '#7EC49B', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4'];
  const bg = colors[(name.codePointAt(0) || 0) % colors.length];
  const letter = (Array.from(name)[0] || '?').toUpperCase().replace(/[<>&"']/g, '?');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${bg}"/><text x="50" y="66" font-size="46" font-family="Arial,sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function publicUser(u) {
  return { id: u.id, username: u.username, avatar: u.avatar || '', createdAt: u.createdAt };
}

function roomIdentity(userId) {
  const u = db.users[userId];
  if (!u) return null;
  return { id: u.id, username: u.username, avatar: u.avatar || letterAvatarDataUri(u.username) };
}

// ── История просмотров ──────────────────────────────────────────────────────
const titleLookups = new Set();

function videoKey(video) {
  return `${video.type}:${video.id || video.url}`.slice(0, 220);
}

function thumbFor(video) {
  if (video.type === 'youtube' && /^[\w-]{11}$/.test(video.id || '')) return `/api/thumbnail/${video.id}`;
  return '';
}

function recordWatch(userId, video, seconds, fetchTitle) {
  const user = db.users[userId];
  if (!user || !video || !video.type) return;
  const key = videoKey(video);
  const now = Date.now();
  user.stats.totalSeconds += seconds;

  let entry = user.history.find(h => h.key === key);
  if (!entry) {
    entry = {
      key, type: video.type, id: video.id || '', url: video.url || '', playerUrl: video.playerUrl || '',
      referer: video.referer || '', title: video.title || '', thumb: thumbFor(video),
      watchedSeconds: 0, firstWatched: now, lastWatched: now
    };
    user.history.unshift(entry);
  }
  entry.watchedSeconds += seconds;
  entry.lastWatched = now;
  if (!entry.title && video.title) entry.title = video.title;

  if (user.history.length > HISTORY_MAX) {
    user.history.sort((a, b) => b.lastWatched - a.lastWatched);
    user.history.length = HISTORY_MAX;
  }
  save();

  if (!entry.title && fetchTitle && !titleLookups.has(key)) {
    titleLookups.add(key);
    Promise.resolve(fetchTitle(video)).then(title => {
      if (title) { entry.title = String(title).slice(0, 200); save(); }
    }).catch(() => {}).finally(() => setTimeout(() => titleLookups.delete(key), 600_000));
  }
}

function bumpSessions(userId) {
  const user = db.users[userId];
  if (!user) return;
  user.stats.sessions += 1;
  save();
}

// ── HTTP-маршруты ───────────────────────────────────────────────────────────
function mount(app) {
  const requireJson = (req, res, next) =>
    req.is('application/json') ? next() : res.status(415).json({ error: 'JSON_REQUIRED', message: 'Некорректный запрос' });

  const authed = (req, res, next) => {
    const user = userFromToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
    if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Требуется вход' });
    req.user = user;
    next();
  };

  function validateCredentials(username, password, res) {
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      res.status(400).json({ error: 'BAD_USERNAME', field: 'username', message: 'Имя: 3–24 символа, буквы, цифры, «_», «.» или «-»' });
      return false;
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      res.status(400).json({ error: 'BAD_PASSWORD', field: 'password', message: `Пароль: от ${MIN_PASSWORD} до ${MAX_PASSWORD} символов` });
      return false;
    }
    return true;
  }

  app.post('/api/auth/register', requireJson, async (req, res) => {
    const { username, password } = req.body || {};
    if (hit(`reg|${clientIp(req)}`, 10, 3600_000)) {
      return res.status(429).json({ error: 'TOO_MANY', message: 'Слишком много регистраций, попробуйте позже' });
    }
    if (!validateCredentials(username, password, res)) return;
    if (idByName.has(username.toLowerCase())) {
      return res.status(409).json({ error: 'NAME_TAKEN', field: 'username', message: 'Это имя уже занято' });
    }
    try {
      const passHash = await hashPassword(password);
      if (idByName.has(username.toLowerCase())) {
        return res.status(409).json({ error: 'NAME_TAKEN', field: 'username', message: 'Это имя уже занято' });
      }
      const user = {
        id: crypto.randomUUID(), username, passHash, avatar: '', createdAt: Date.now(),
        stats: { totalSeconds: 0, sessions: 0 }, history: []
      };
      db.users[user.id] = user;
      idByName.set(username.toLowerCase(), user.id);
      setSessionCookie(req, res, createSession(user.id));
      save(true);
      res.json({ user: publicUser(user) });
    } catch (e) {
      console.error('[auth] register error:', e.message);
      res.status(500).json({ error: 'SERVER_ERROR', message: 'Ошибка сервера' });
    }
  });

  app.post('/api/auth/login', requireJson, async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > MAX_PASSWORD) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Введите имя и пароль' });
    }
    const throttleKey = `login|${clientIp(req)}|${username.toLowerCase()}`;
    if (tooMany(throttleKey, 8)) {
      return res.status(429).json({ error: 'TOO_MANY', message: 'Слишком много попыток. Подождите 15 минут' });
    }
    try {
      const user = db.users[idByName.get(username.toLowerCase())];
      const ok = await verifyPassword(password, user ? user.passHash : await DUMMY_HASH_PROMISE);
      if (!user || !ok) {
        hit(throttleKey, 8, 15 * 60_000);
        return res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'Неверное имя или пароль' });
      }
      attempts.delete(throttleKey);
      setSessionCookie(req, res, createSession(user.id));
      res.json({ user: publicUser(user) });
    } catch (e) {
      console.error('[auth] login error:', e.message);
      res.status(500).json({ error: 'SERVER_ERROR', message: 'Ошибка сервера' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (token) { delete db.sessions[sha256(token)]; save(); }
    setSessionCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', authed, (req, res) => res.json({ user: publicUser(req.user) }));

  app.put('/api/profile', requireJson, authed, (req, res) => {
    const { avatar } = req.body || {};
    if (typeof avatar !== 'string') return res.status(400).json({ error: 'BAD_AVATAR', message: 'Некорректный аватар' });
    if (avatar !== '' && !(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) && avatar.length <= MAX_AVATAR_LEN)) {
      return res.status(400).json({ error: 'BAD_AVATAR', message: 'Фото должно быть PNG/JPEG/WebP до ~180 КБ' });
    }
    req.user.avatar = avatar;
    save();
    res.json({ user: publicUser(req.user) });
  });

  app.post('/api/auth/password', requireJson, authed, async (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    if (typeof oldPassword !== 'string' || typeof newPassword !== 'string'
        || newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
      return res.status(400).json({ error: 'BAD_PASSWORD', message: `Новый пароль: от ${MIN_PASSWORD} до ${MAX_PASSWORD} символов` });
    }
    const throttleKey = `pw|${req.user.id}`;
    if (tooMany(throttleKey, 8)) return res.status(429).json({ error: 'TOO_MANY', message: 'Слишком много попыток' });
    try {
      if (!(await verifyPassword(oldPassword, req.user.passHash))) {
        hit(throttleKey, 8, 15 * 60_000);
        return res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'Текущий пароль неверен' });
      }
      req.user.passHash = await hashPassword(newPassword);
      const current = sha256(parseCookies(req.headers.cookie)[COOKIE_NAME] || '');
      for (const [k, s] of Object.entries(db.sessions)) if (s.uid === req.user.id && k !== current) delete db.sessions[k];
      save(true);
      res.json({ ok: true });
    } catch (e) {
      console.error('[auth] password error:', e.message);
      res.status(500).json({ error: 'SERVER_ERROR', message: 'Ошибка сервера' });
    }
  });

  app.get('/api/history', authed, (req, res) => {
    const u = req.user;
    const history = [...u.history].sort((a, b) => b.lastWatched - a.lastWatched);
    res.json({
      stats: { totalSeconds: u.stats.totalSeconds, sessions: u.stats.sessions, videos: history.length },
      history
    });
  });

  app.delete('/api/history', authed, (req, res) => {
    req.user.history = [];
    save();
    res.json({ ok: true });
  });

  app.delete('/api/history/:key', authed, (req, res) => {
    req.user.history = req.user.history.filter(h => h.key !== req.params.key);
    save();
    res.json({ ok: true });
  });
}

function socketMiddleware(socket, next) {
  const user = userFromToken(parseCookies(socket.handshake.headers.cookie)[COOKIE_NAME]);
  if (!user) return next(new Error('AUTH_REQUIRED'));
  socket.data.userId = user.id;
  next();
}

load();
process.on('exit', () => { if (saveTimer) flush(); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });

module.exports = { mount, socketMiddleware, roomIdentity, recordWatch, bumpSessions };
