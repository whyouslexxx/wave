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
let db = { users: {}, sessions: {}, rooms: {} };
const idByName = new Map();

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = { users: parsed.users || {}, sessions: parsed.sessions || {}, rooms: parsed.rooms || {} };
    }
  } catch (e) {
    console.error('[auth] db load error:', e.message);
  }
  for (const u of Object.values(db.users)) { idByName.set(u.username.toLowerCase(), u.id); ensureSocial(u); }
  pruneSessions();
  pruneRooms();
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

function ensureSocial(u) {
  u.friends     = u.friends     || [];
  u.requestsIn  = u.requestsIn  || [];
  u.requestsOut = u.requestsOut || [];
  u.recentRooms = u.recentRooms || [];
  u.avatarVer   = u.avatarVer   || 0;
}

function pruneRooms() {
  const limit = Date.now() - 60 * 24 * 3600 * 1000;
  for (const [id, r] of Object.entries(db.rooms)) if (r.lastUsed < limit) delete db.rooms[id];
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

// ── Хуки сервера (присутствие, живые комнаты, уведомления) ──────────────────
let hooks = {
  notify:   () => {},
  presence: () => ({ online: false, roomId: null }),
  liveRoom: () => null,
  listLive: () => []
};
function setHooks(h) { hooks = { ...hooks, ...h }; }

function avatarUrl(u) { return `/api/users/${u.id}/avatar?v=${u.avatarVer || 0}`; }

function userCard(u) {
  const p = hooks.presence(u.id);
  const meta = p.roomId ? db.rooms[p.roomId] : null;
  return {
    id: u.id, username: u.username, avatar: avatarUrl(u),
    online: !!p.online, roomId: meta ? p.roomId : null, roomLocked: !!(meta && meta.passHash)
  };
}

// ── Реестр комнат ───────────────────────────────────────────────────────────
const ROOM_ID_RE = /^[a-z0-9_-]{3,40}$/;
const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const MIN_ROOM_PASSWORD = 4;

function getRoom(id) { return db.rooms[id] || null; }

function generateRoomCode() {
  for (let i = 0; i < 20; i++) {
    let code = '';
    for (let j = 0; j < 6; j++) code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
    if (!db.rooms[code]) return code;
  }
  return 'room-' + crypto.randomBytes(4).toString('hex');
}

async function createRoom(id, ownerId, opts = {}) {
  const now = Date.now();
  const room = {
    id, ownerId, title: String(opts.title || '').slice(0, 60),
    visibility: opts.visibility === 'public' ? 'public' : 'unlisted',
    controlMode: opts.controlMode === 'host' ? 'host' : 'all',
    passHash: opts.password ? await hashPassword(opts.password) : '',
    createdAt: now, lastUsed: now
  };
  db.rooms[id] = room;
  save();
  return room;
}

// patch: { title?, visibility?, controlMode?, password? (строка — задать, null/'' — снять) }
async function updateRoom(id, patch) {
  const r = db.rooms[id];
  if (!r) return null;
  if (typeof patch.title === 'string') r.title = patch.title.trim().slice(0, 60);
  if (patch.visibility === 'public' || patch.visibility === 'unlisted') r.visibility = patch.visibility;
  if (patch.controlMode === 'host' || patch.controlMode === 'all') r.controlMode = patch.controlMode;
  if (patch.password !== undefined) r.passHash = patch.password ? await hashPassword(patch.password) : '';
  save();
  return r;
}

function touchRoom(id) { const r = db.rooms[id]; if (r) { r.lastUsed = Date.now(); save(); } }

async function checkRoomPassword(id, password) {
  const r = db.rooms[id];
  if (!r || !r.passHash) return true;
  if (typeof password !== 'string' || password.length > MAX_PASSWORD) return false;
  return verifyPassword(password, r.passHash);
}

function addRecentRoom(userId, roomId) {
  const u = db.users[userId];
  if (!u) return;
  u.recentRooms = [{ id: roomId, at: Date.now() }, ...u.recentRooms.filter(r => r.id !== roomId)].slice(0, 20);
  save();
}

function roomView(r) {
  const owner = db.users[r.ownerId];
  return {
    id: r.id, ownerId: r.ownerId, ownerName: owner ? owner.username : '',
    title: r.title, visibility: r.visibility, locked: !!r.passHash, controlMode: r.controlMode
  };
}

// ── Друзья ──────────────────────────────────────────────────────────────────
function areFriends(a, b) { const u = db.users[a]; return !!u && u.friends.includes(b); }
function friendIds(userId) { const u = db.users[userId]; return u ? [...u.friends] : []; }
const without = (arr, id) => arr.filter(x => x !== id);

function makeFriends(a, b) {
  const ua = db.users[a], ub = db.users[b];
  ua.friends = [...new Set([...ua.friends, b])]; ub.friends = [...new Set([...ub.friends, a])];
  ua.requestsIn = without(ua.requestsIn, b); ua.requestsOut = without(ua.requestsOut, b);
  ub.requestsIn = without(ub.requestsIn, a); ub.requestsOut = without(ub.requestsOut, a);
}

function friendsPayload(u) {
  const list = (ids) => ids.map(id => db.users[id]).filter(Boolean).map(userCard);
  return { friends: list(u.friends), incoming: list(u.requestsIn), outgoing: list(u.requestsOut) };
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
      ensureSocial(user);
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
    req.user.avatarVer = Date.now();
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

  // ── Аватары по URL (чтобы не гонять base64 в каждом списке) ──
  app.get('/api/users/:id/avatar', authed, (req, res) => {
    const u = db.users[req.params.id];
    if (!u) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=86400');
    const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(u.avatar || '');
    if (m) { res.type(m[1]); return res.send(Buffer.from(m[2], 'base64')); }
    const svg = decodeURIComponent(letterAvatarDataUri(u.username).replace('data:image/svg+xml;utf8,', ''));
    res.type('image/svg+xml').send(svg);
  });

  // ── Комнаты ──
  const liveView = (id) => hooks.liveRoom(id);

  app.post('/api/rooms', requireJson, authed, async (req, res) => {
    const { code, title, visibility, controlMode, password } = req.body || {};
    if (hit(`mkroom|${req.user.id}`, 30, 3600_000)) {
      return res.status(429).json({ error: 'TOO_MANY', message: 'Слишком много новых комнат, попробуйте позже' });
    }
    let id = code == null || code === '' ? generateRoomCode() : String(code).trim().toLowerCase();
    if (!ROOM_ID_RE.test(id)) {
      return res.status(400).json({ error: 'BAD_CODE', message: 'Код комнаты: 3–40 символов, латиница, цифры, «-» и «_»' });
    }
    if (password != null && password !== '' && (typeof password !== 'string' || password.length < MIN_ROOM_PASSWORD || password.length > MAX_PASSWORD)) {
      return res.status(400).json({ error: 'BAD_PASSWORD', message: `Пароль комнаты: от ${MIN_ROOM_PASSWORD} символов` });
    }
    const existing = db.rooms[id];
    if (existing) {
      if (existing.ownerId === req.user.id) return res.json({ room: roomView(existing) });
      return res.status(409).json({ error: 'CODE_TAKEN', message: 'Этот код уже занят — выберите другой' });
    }
    try {
      const room = await createRoom(id, req.user.id, { title, visibility, controlMode, password });
      res.json({ room: roomView(room) });
    } catch (e) {
      console.error('[rooms] create error:', e.message);
      res.status(500).json({ error: 'SERVER_ERROR', message: 'Ошибка сервера' });
    }
  });

  app.get('/api/rooms/mine', authed, (req, res) => {
    const u = req.user;
    const seen = new Set();
    const rows = [];
    for (const r of u.recentRooms) {
      const meta = db.rooms[r.id];
      if (meta && !seen.has(r.id)) { seen.add(r.id); rows.push({ ...roomView(meta), lastVisited: r.at, live: liveView(r.id) }); }
    }
    for (const meta of Object.values(db.rooms)) {
      if (meta.ownerId === u.id && !seen.has(meta.id)) { seen.add(meta.id); rows.push({ ...roomView(meta), lastVisited: meta.lastUsed, live: liveView(meta.id) }); }
    }
    rows.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.lastVisited - a.lastVisited);
    res.json({ rooms: rows.slice(0, 12) });
  });

  app.get('/api/rooms/public', authed, (req, res) => {
    const rows = hooks.listLive()
      .map(id => db.rooms[id]).filter(m => m && m.visibility === 'public')
      .map(m => ({ ...roomView(m), live: liveView(m.id) }))
      .filter(r => r.live)
      .sort((a, b) => b.live.count - a.live.count)
      .slice(0, 18);
    res.json({ rooms: rows });
  });

  app.get('/api/rooms/:id', authed, (req, res) => {
    const id = String(req.params.id).toLowerCase();
    const meta = ROOM_ID_RE.test(id) ? db.rooms[id] : null;
    if (!meta) return res.json({ exists: false, id });
    res.json({ exists: true, room: roomView(meta), live: liveView(id) });
  });

  // ── Друзья ──
  app.get('/api/friends', authed, (req, res) => res.json(friendsPayload(req.user)));

  app.post('/api/friends/request', requireJson, authed, (req, res) => {
    const name = String((req.body || {}).username || '').trim().toLowerCase();
    if (hit(`freq|${req.user.id}`, 30, 3600_000)) return res.status(429).json({ error: 'TOO_MANY', message: 'Слишком много заявок, попробуйте позже' });
    const target = db.users[idByName.get(name)];
    if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Пользователь с таким именем не найден' });
    const me = req.user;
    if (target.id === me.id) return res.status(400).json({ error: 'SELF', message: 'Нельзя добавить самого себя' });
    if (me.friends.includes(target.id)) return res.status(409).json({ error: 'ALREADY', message: 'Вы уже друзья' });
    if (me.requestsIn.includes(target.id)) {
      makeFriends(me.id, target.id);
      save();
      hooks.notify(target.id, 'friends-changed', { kind: 'accepted', user: userCard(me) });
      return res.json({ status: 'friends', ...friendsPayload(me) });
    }
    if (!me.requestsOut.includes(target.id)) {
      me.requestsOut.push(target.id);
      target.requestsIn.push(me.id);
      save();
      hooks.notify(target.id, 'friends-changed', { kind: 'request', user: userCard(me) });
    }
    res.json({ status: 'sent', ...friendsPayload(me) });
  });

  app.post('/api/friends/accept', requireJson, authed, (req, res) => {
    const id = String((req.body || {}).id || '');
    const me = req.user;
    if (!me.requestsIn.includes(id) || !db.users[id]) return res.status(404).json({ error: 'NOT_FOUND', message: 'Заявка не найдена' });
    makeFriends(me.id, id);
    save();
    hooks.notify(id, 'friends-changed', { kind: 'accepted', user: userCard(me) });
    res.json(friendsPayload(me));
  });

  // отклонить входящую или отменить исходящую заявку
  app.post('/api/friends/decline', requireJson, authed, (req, res) => {
    const id = String((req.body || {}).id || '');
    const me = req.user, other = db.users[id];
    me.requestsIn = without(me.requestsIn, id); me.requestsOut = without(me.requestsOut, id);
    if (other) { other.requestsIn = without(other.requestsIn, me.id); other.requestsOut = without(other.requestsOut, me.id); }
    save();
    if (other) hooks.notify(id, 'friends-changed', { kind: 'refresh' });
    res.json(friendsPayload(me));
  });

  app.delete('/api/friends/:id', authed, (req, res) => {
    const id = req.params.id, me = req.user, other = db.users[id];
    me.friends = without(me.friends, id);
    if (other) other.friends = without(other.friends, me.id);
    save();
    if (other) hooks.notify(id, 'friends-changed', { kind: 'refresh' });
    res.json(friendsPayload(me));
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

module.exports = {
  mount, socketMiddleware, roomIdentity, recordWatch, bumpSessions, setHooks,
  getUser: (id) => db.users[id] || null, userCard, areFriends, friendIds,
  getRoom, createRoom, updateRoom, touchRoom, checkRoomPassword, addRecentRoom, roomView, ROOM_ID_RE, MIN_ROOM_PASSWORD
};
