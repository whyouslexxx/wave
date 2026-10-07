'use strict';
const express = require('express');
const http    = require('http');
const https   = require('https');
const { Server } = require('socket.io');
const path    = require('path');
const fs      = require('fs');


let config = { PORT: 3000, VK_SERVICE_TOKEN: '' };
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (e) { console.error('[config] parse error:', e.message); }
}
const PORT             = process.env.PORT             || config.PORT            || 3000;
const VK_SERVICE_TOKEN = process.env.VK_SERVICE_TOKEN || config.VK_SERVICE_TOKEN || '';


const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 20000,
  pingInterval: 10000
});

app.use(express.static(path.join(__dirname, 'public')));



const rateLimits = new Map();
const RATE_WINDOW_MS = 60_000; 
const RATE_MAX       = 120;    

function rateLimiter(req, res, next) {
  const ip  = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let record = rateLimits.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimits.set(ip, record);
  }
  record.count++;
  if (record.count > RATE_MAX) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of rateLimits) {
    if (now > rec.resetAt) rateLimits.delete(ip);
  }
}, 300_000);

app.use('/api', rateLimiter);



function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const reqOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Referer':    'https://www.youtube.com/',
        ...(options.headers || {})
      },
      timeout: 8000
    };
    const req = mod.get(url, reqOptions, (res) => {
      
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && (options._redirects || 0) < 3) {
        return resolve(httpGet(res.headers.location, { ...options, _redirects: (options._redirects || 0) + 1 }));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:      res.statusCode,
        contentType: res.headers['content-type'] || '',
        body:        Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}


function letterAvatarSvg(name, color) {
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];
  const bg     = color || colors[(name.charCodeAt(0) || 0) % colors.length];
  const letter = (name.charAt(0) || '?').toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${bg}"/><text x="50" y="63" font-size="44" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="bold" fill="#ffffff" text-anchor="middle">${letter}</text></svg>`;
}


function esc(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}


app.get('/api/thumbnail/:id', async (req, res) => {
  const id = req.params.id;
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).send('Invalid ID');

  const urls = [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${id}/hqdefault.jpg`
  ];

  for (const url of urls) {
    try {
      const r = await httpGet(url);
      if (r.status === 200 && r.body.length > 1000) {
        const ct = r.contentType.includes('image') ? r.contentType : 'image/jpeg';
        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(r.body);
      }
    } catch {  }
  }

  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="337" viewBox="0 0 600 337"><rect width="100%" height="100%" fill="#1e1b2e"/><circle cx="300" cy="168" r="45" fill="#8b5cf6" opacity="0.85"/><polygon points="288,148 324,168 288,188" fill="#ffffff"/></svg>`);
});


app.get('/api/avatar/:name', (req, res) => {
  const name = esc(req.params.name || 'User').substring(0, 40);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(letterAvatarSvg(name));
});


const ytAvatarCache = new Map(); 

app.get('/api/ytavatar/:id', async (req, res) => {
  const id = req.params.id;
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).send('Invalid ID');

  const sendFallback = (name, color) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(letterAvatarSvg(name || '?', color));
  };

  if (ytAvatarCache.has(id)) {
    const c = ytAvatarCache.get(id);
    if (c.type === 'image') {
      res.setHeader('Content-Type', c.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(c.buffer);
    }
    return sendFallback(c.letter, c.color);
  }

  try {
    
    const oe = await httpGet(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
    const data = JSON.parse(oe.body.toString('utf8'));
    const authorName = data.author_name || '?';
    const authorUrl  = data.author_url;
    if (!authorUrl) throw new Error('no author_url');

    
    const page = await httpGet(authorUrl);
    const html = page.body.toString('utf8');
    let avatarUrl = null;
    const m1 = html.match(/"avatar":\{"thumbnails":\[.*?"url":"(https:\/\/yt3\.ggpht\.com\/[^"]+)"/);
    if (m1) avatarUrl = m1[1];
    if (!avatarUrl) {
      const all = html.match(/https:\/\/yt3\.ggpht\.com\/[^"\\=\s]+/g);
      if (all?.length) avatarUrl = all[0];
    }
    if (!avatarUrl) throw new Error('no avatar url');
    avatarUrl = avatarUrl.replace(/=s\d+/, '=s240');

    
    const img = await httpGet(avatarUrl);
    if (img.status !== 200 || img.body.length < 100) throw new Error('bad image');

    ytAvatarCache.set(id, { type: 'image', buffer: img.body, contentType: 'image/jpeg' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(img.body);

  } catch (e) {
    
    try {
      const oe2  = await httpGet(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
      const d2   = JSON.parse(oe2.body.toString('utf8'));
      const name = d2.author_name || '?';
      const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444','#06b6d4'];
      const color  = colors[(name.charCodeAt(0) || 0) % colors.length];
      ytAvatarCache.set(id, { type: 'svg', letter: name, color });
      return sendFallback(name, color);
    } catch { return sendFallback('?'); }
  }
});


// ── Резолвер страниц: «ссылка на страницу с видео» → прямой поток ──────────
const MEDIA_URL_RE = /https?:\/\/[^\s"'<>\\()]+?\.(m3u8|mp4|webm)(?:\?[^\s"'<>\\()]*)?/gi;
const EMBED_HOST_RE = /^(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|rutube\.ru|vk\.com|vk\.ru|vkvideo\.ru)$/i;
const MAX_PAGE_BYTES = 3 * 1024 * 1024;

function isPrivateHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(?:127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h) || h.startsWith('::ffff:')) return true;
  return false;
}

function parsePublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (isPrivateHost(u.hostname)) return null;
  return u;
}

function fetchPage(url, referer, redirects = 0) {
  return new Promise((resolve, reject) => {
    const u = parsePublicUrl(url);
    if (!u) return reject(new Error('blocked url'));
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru,en;q=0.8',
        'Referer': referer || `${u.protocol}//${u.host}/`
      },
      timeout: 12000
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= 5) return reject(new Error('too many redirects'));
        return resolve(fetchPage(new URL(res.headers.location, u).href, referer, redirects + 1));
      }
      const chunks = [];
      let size = 0;
      res.on('data', c => {
        size += c.length;
        if (size > MAX_PAGE_BYTES) { req.destroy(); return reject(new Error('page too large')); }
        chunks.push(c);
      });
      res.on('end', () => resolve({
        status: res.statusCode,
        contentType: res.headers['content-type'] || '',
        finalUrl: u.href,
        body: Buffer.concat(chunks).toString('utf8')
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function unescapeJsString(s) {
  return s
    .replace(/\\u0026/gi, '&').replace(/&amp;/g, '&')
    .replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
}

// Достаёт из HTML/JS все кандидаты: потоки, <video>/<source>, og:video, iframe.
function extractCandidates(html, baseUrl) {
  const text = unescapeJsString(html);
  const media = [];
  const iframes = [];
  const seen = new Set();
  const addMedia = (raw) => {
    let abs;
    try { abs = new URL(raw, baseUrl).href; } catch { return; }
    if (seen.has(abs) || !parsePublicUrl(abs)) return;
    seen.add(abs);
    const kind = /\.m3u8(?:\?|$)/i.test(abs) ? 'hls' : 'file';
    media.push({ kind, url: abs });
  };

  for (const m of text.matchAll(MEDIA_URL_RE)) addMedia(m[0]);

  for (const m of text.matchAll(/<(?:video|source)\b[^>]*?\ssrc=["']([^"']+)["']/gi)) addMedia(m[1]);
  for (const m of text.matchAll(/<meta[^>]+(?:property|name)=["']og:video(?::url|:secure_url)?["'][^>]*content=["']([^"']+)["']/gi)) {
    if (/\.(m3u8|mp4|webm)(?:\?|$)/i.test(m[1])) addMedia(m[1]);
  }
  // типичные поля плееров: file: "...", source: "...", hls: "..."
  for (const m of text.matchAll(/["']?(?:file|src|source|hls|stream|video_url|videoUrl)["']?\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|webm)[^"']*)["']/gi)) addMedia(m[1]);

  for (const m of text.matchAll(/<iframe\b[^>]*?\ssrc=["']([^"']+)["']/gi)) {
    try {
      const abs = new URL(m[1], baseUrl).href;
      if (!iframes.includes(abs) && parsePublicUrl(abs)) iframes.push(abs);
    } catch { /* ignore */ }
  }

  media.sort((a, b) => (a.kind === 'hls' ? 0 : 1) - (b.kind === 'hls' ? 0 : 1));
  return { media, iframes };
}

app.get('/api/resolve-video', async (req, res) => {
  const pageUrl = req.query.url;
  if (!pageUrl || typeof pageUrl !== 'string' || pageUrl.length > 2048) {
    return res.status(400).json({ error: 'BAD_URL', message: 'Некорректная ссылка' });
  }
  if (!parsePublicUrl(pageUrl)) {
    return res.status(400).json({ error: 'BAD_URL', message: 'Эта ссылка не поддерживается' });
  }

  try {
    const page = await fetchPage(pageUrl);
    const title = (page.body.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      || page.body.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1];
    const cleanTitle = title ? unescapeJsString(title).replace(/\s+/g, ' ').trim().slice(0, 200) : '';

    let { media, iframes } = extractCandidates(page.body, page.finalUrl);
    let referer = page.finalUrl;

    // Видео часто лежит в iframe-плеере — заглядываем на один уровень вглубь.
    if (!media.length) {
      const embed = iframes.find(f => EMBED_HOST_RE.test(new URL(f).hostname));
      if (embed) return res.json({ kind: 'embed', url: embed, title: cleanTitle });

      for (const frame of iframes.slice(0, 4)) {
        try {
          const sub = await fetchPage(frame, page.finalUrl);
          const found = extractCandidates(sub.body, sub.finalUrl);
          if (found.media.length) { media = found.media; referer = sub.finalUrl; break; }
        } catch (e) {
          console.warn('[resolve-video] iframe error:', e.message);
        }
      }
    }

    if (req.query.debug === '1') {
      const scripts = [...page.body.matchAll(/<script\b[^>]*\ssrc=["']([^"']+)["']/gi)].map(m => m[1]).slice(0, 30);
      const hints = [...new Set([...page.body.matchAll(/["'(]((?:https?:)?\/\/[^"'\s)]*?(?:api|player|embed|video|stream|cdn|playlist)[^"'\s)]*)/gi)].map(m => m[1]))].slice(0, 40);
      const scriptReports = [];
      if (req.query.scripts === '1') {
        const own = [...page.body.matchAll(/<script\b[^>]*\ssrc=["']([^"']+)["']/gi)].map(m => m[1])
          .filter(u => !/jquery|metrika|yandex|google|deltarockme|vak345/i.test(u)).slice(0, 8);
        const pat = /(?:fetch\s*\(|XMLHttpRequest|\.ajax\s*\(|\$\.(?:get|post|getJSON)\s*\(|iframe|kinopoisk|kp_id|imdb|tmdb|\/api\/|api\.|m3u8|\.mp4|playlist|socialAlias|atob\s*\(|new Kinobox|kinobox)/gi;
        for (const src of own) {
          try {
            const abs = new URL(src, page.finalUrl).href;
            const r = await fetchPage(abs, page.finalUrl);
            const code = r.body;
            const hits = [];
            let m;
            pat.lastIndex = 0;
            while ((m = pat.exec(code)) && hits.length < 25) {
              hits.push(code.slice(Math.max(0, m.index - 80), m.index + 160).replace(/\s+/g, ' '));
              pat.lastIndex = m.index + 160;
            }
            scriptReports.push({ url: abs, status: r.status, bytes: code.length, head: code.replace(/\s+/g, ' ').slice(0, 600), hits });
          } catch (e) {
            scriptReports.push({ url: src, error: e.message });
          }
        }
      }
      return res.json({
        debug: true, scriptReports, status: page.status, contentType: page.contentType, finalUrl: page.finalUrl,
        bytes: page.body.length, title: cleanTitle, media, iframes, scripts, hints,
        snippet: page.body.replace(/\s+/g, ' ').slice(0, 3000)
      });
    }
    if (!media.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Не удалось найти видео на этой странице' });
    }
    const best = media[0];
    res.json({ kind: best.kind, url: best.url, referer, title: cleanTitle });
  } catch (err) {
    console.error('[resolve-video] error:', err.message);
    res.status(502).json({ error: 'FETCH_FAILED', message: 'Не удалось открыть страницу: ' + err.message });
  }
});


app.get('/api/hls-proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('Missing url parameter');
  }
  const refParam = typeof req.query.ref === 'string' ? req.query.ref : '';
  const refQuery = refParam ? `&ref=${encodeURIComponent(refParam)}` : '';

  try {
    const parsedTarget = parsePublicUrl(targetUrl);
    if (!parsedTarget) return res.status(400).send('Invalid URL');
    const mod = parsedTarget.protocol === 'https:' ? https : http;

    const refUrl = refParam ? parsePublicUrl(refParam) : null;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': refUrl ? refUrl.href : `${parsedTarget.protocol}//${parsedTarget.host}/`,
      'Origin': refUrl ? refUrl.origin : `${parsedTarget.protocol}//${parsedTarget.host}`
    };

    const proxyReq = mod.get(targetUrl, { headers, timeout: 20000 }, (proxyRes) => {
      if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
        const redirectUrl = new URL(proxyRes.headers.location, targetUrl).href;
        return res.redirect(`/api/hls-proxy?url=${encodeURIComponent(redirectUrl)}${refQuery}`);
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');

      const contentType = proxyRes.headers['content-type'] || '';
      const isM3u8 = targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL');

      if (isM3u8) {
        let rawData = '';
        proxyRes.setEncoding('utf8');
        proxyRes.on('data', chunk => { rawData += chunk; });
        proxyRes.on('end', () => {
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          
          const lines = rawData.split('\n');
          const rewrittenLines = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
              if (trimmed.includes('URI="')) {
                return line.replace(/URI="([^"]+)"/, (match, uri) => {
                  const resolved = new URL(uri, targetUrl).href;
                  return `URI="/api/hls-proxy?url=${encodeURIComponent(resolved)}${refQuery}"`;
                });
              }
              return line;
            }
            try {
              const resolvedUrl = new URL(trimmed, targetUrl).href;
              return `/api/hls-proxy?url=${encodeURIComponent(resolvedUrl)}${refQuery}`;
            } catch {
              return line;
            }
          });

          res.send(rewrittenLines.join('\n'));
        });
      } else {
        res.setHeader('Content-Type', contentType || 'video/MP2T');
        if (proxyRes.headers['content-length']) {
          res.setHeader('Content-Length', proxyRes.headers['content-length']);
        }
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error('[hls-proxy] error:', err.message);
      if (!res.headersSent) res.status(500).send('Proxy error');
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) res.status(504).send('Proxy timeout');
    });

  } catch (err) {
    console.error('[hls-proxy] exception:', err.message);
    if (!res.headersSent) res.status(400).send('Invalid URL');
  }
});

app.get('/api/vk-status', rateLimiter, (req, res) => {
  res.json({ configured: !!VK_SERVICE_TOKEN });
});


app.get('/api/vk-search', async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Missing query' });
  if (!VK_SERVICE_TOKEN) return res.status(400).json({ error: 'VK_SERVICE_TOKEN_MISSING', message: 'Токен ВК не настроен.' });

  try {
    const vkUrl = `https://api.vk.com/method/video.search?q=${encodeURIComponent(query)}&access_token=${VK_SERVICE_TOKEN}&v=5.131&count=20&extended=1`;
    const r = await httpGet(vkUrl);
    const data = JSON.parse(r.body.toString('utf8'));
    if (data.error) return res.status(500).json({ error: 'VK_API_ERROR', message: data.error.error_msg });

    const videos = (data.response?.items || []).map(item => ({
      id:       item.id,
      owner_id: item.owner_id,
      title:    item.title,
      duration: item.duration,
      preview:  item.image?.at(-1)?.url || item.photo_320 || item.photo_130 || '',
      views:    item.views,
      player:   item.player
    }));
    res.json({ videos });
  } catch (err) {
    console.error('[vk-search] error:', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Ошибка сервера при поиске в ВК' });
  }
});

app.get('/api/rutube-info', async (req, res) => {
  const id = req.query.id;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing id' });
  try {
    const r = await httpGet(`https://rutube.ru/api/video/${encodeURIComponent(id)}/`, { headers: { Referer: 'https://rutube.ru/' } });
    const data = JSON.parse(r.body.toString('utf8'));
    res.json({
      title: data.title || '',
      duration: data.duration || 0,
      thumbnail: data.thumbnail_url || '',
      embedUrl: data.embed_url || `https://rutube.ru/play/embed/${id}`
    });
  } catch (err) {
    console.error('[rutube-info] error:', err.message);
    res.status(500).json({ error: 'RUTUBE_ERROR', message: err.message });
  }
});

app.get('/api/rutube-search', async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Missing query' });
  try {
    const rutubeUrl = `https://rutube.ru/api/search/video/?query=${encodeURIComponent(query)}`;
    const r = await httpGet(rutubeUrl, { headers: { Referer: 'https://rutube.ru/' } });
    const data = JSON.parse(r.body.toString('utf8'));
    const videos = (data.results || []).map(item => ({
      id: item.id,
      title: item.title,
      duration: item.duration,
      preview: item.thumbnail_url || '',
      views: item.hits,
      author: item.author?.name || '',
      playerUrl: `https://rutube.ru/play/embed/${item.id}`,
      url: item.video_url || `https://rutube.ru/video/${item.id}/`
    }));
    res.json({ videos });
  } catch (err) {
    console.error('[rutube-search] error:', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Ошибка сервера при поиске в Rutube' });
  }
});



const rooms = {};

function getEstimatedTime(room) {
  if (!room) return 0;
  if (room.isPlaying) {
    const elapsed = (Date.now() - room.lastUpdateTime) / 1000;
    return Math.max(0, room.currentTime + elapsed);
  }
  return room.currentTime;
}

function removeUserFromRoom(roomId, socketId) {
  const room = rooms[roomId];
  if (!room) return;
  room.users = room.users.filter(u => u.id !== socketId);
  if (room.users.length === 0) {
    delete rooms[roomId];
    console.log(`[room] ${roomId} empty — deleted`);
  }
}

function pushSystemMsg(room, text) {
  const msg = {
    id:        `sys-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    username:  'Система',
    text,
    system:    true,
    timestamp: Date.now()
  };
  if (!room.messages) room.messages = [];
  room.messages.push(msg);
  if (room.messages.length > 50) room.messages.shift();
  return msg;
}



const MSG_RATE_LIMIT = 5;
const MSG_RATE_WINDOW = 1000;

io.on('connection', (socket) => {
  let currentRoomId = null;
  let username      = 'Аноним';
  let userAvatar    = 'avatar-1';

  
  let msgCount = 0;
  let msgRateReset = Date.now() + MSG_RATE_WINDOW;

  function canSendMessage() {
    const now = Date.now();
    if (now > msgRateReset) { msgCount = 0; msgRateReset = now + MSG_RATE_WINDOW; }
    msgCount++;
    return msgCount <= MSG_RATE_LIMIT;
  }

  
  socket.on('join-room', ({ roomId, user, avatar }) => {
    if (!roomId || typeof roomId !== 'string') return;
    const safeRoomId = roomId.slice(0, 80).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!safeRoomId) return;

    if (currentRoomId) {
      socket.leave(currentRoomId);
      removeUserFromRoom(currentRoomId, socket.id);
    }

    currentRoomId = safeRoomId;
    username      = String(user  || 'Гость').slice(0, 40).replace(/[<>]/g, '');
    userAvatar    = String(avatar || 'avatar-1').slice(0, 300_000); 

    socket.join(currentRoomId);

    if (!rooms[currentRoomId]) {
      rooms[currentRoomId] = {
        video: null, isPlaying: false, currentTime: 0,
        lastUpdateTime: Date.now(), version: 0,
        users: [], messages: []
      };
    }

    const room = rooms[currentRoomId];
    room.users.push({ id: socket.id, username, avatar: userAvatar });

    socket.emit('room-status', {
      video: room.video, isPlaying: room.isPlaying,
      time: getEstimatedTime(room), version: room.version,
      users: room.users, messages: room.messages
    });

    socket.to(currentRoomId).emit('user-joined', { id: socket.id, username, avatar: userAvatar, users: room.users });

    const msg = pushSystemMsg(room, `${username} присоединился к просмотру.`);
    io.to(currentRoomId).emit('chat-message', msg);
    console.log(`[join] ${username} (${socket.id}) → ${currentRoomId}`);
  });

  
  socket.on('video-change', async (videoData) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    if (!videoData || typeof videoData !== 'object') return;
    const { type, url, id, playerUrl, title, referer } = videoData;
    if (!type || !['youtube', 'vk', 'rutube', 'direct'].includes(type)) return;

    let finalTitle = String(title || '').slice(0, 200);
    if (type === 'rutube' && (!finalTitle || finalTitle === 'Rutube' || finalTitle === 'Видео')) {
      try {
        const r = await httpGet(`https://rutube.ru/api/video/${encodeURIComponent(id)}/`, { headers: { Referer: 'https://rutube.ru/' } });
        const info = JSON.parse(r.body.toString('utf8'));
        if (info && info.title) {
          finalTitle = String(info.title).slice(0, 200);
        }
      } catch (e) {
        console.warn('[rutube] title fetch error:', e.message);
      }
    }

    const room = rooms[currentRoomId];
    room.video = {
      type,
      url:       String(url       || '').slice(0, 2048),
      id:        String(id        || '').slice(0, 200),
      playerUrl: String(playerUrl || '').slice(0, 2048),
      referer:   String(referer   || '').slice(0, 2048),
      title:     finalTitle || (type === 'rutube' ? 'Rutube Видео' : '')
    };
    room.isPlaying     = true;
    room.currentTime   = 0;
    room.lastUpdateTime = Date.now();
    room.version++;

    io.to(currentRoomId).emit('video-changed', room.video);

    const msg = pushSystemMsg(room, `${username} изменил источник видео.`);
    io.to(currentRoomId).emit('chat-message', msg);
  });

  
  socket.on('client-action', ({ action, time }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const t = Number(time);
    if (!isFinite(t) || t < 0) return;

    const room = rooms[currentRoomId];
    room.version++;
    const version = room.version;

    if (action === 'play') {
      room.isPlaying     = true;
      room.currentTime   = t;
      room.lastUpdateTime = Date.now();
      socket.to(currentRoomId).emit('server-action', { action: 'play', time: t, version });
    } else if (action === 'pause') {
      room.isPlaying     = false;
      room.currentTime   = t;
      room.lastUpdateTime = Date.now();
      socket.to(currentRoomId).emit('server-action', { action: 'pause', time: t, version });
    } else if (action === 'seek') {
      room.currentTime   = t;
      room.lastUpdateTime = Date.now();
      socket.to(currentRoomId).emit('server-action', { action: 'seek', time: t, version });
    }
  });

  
  socket.on('chat-message', (data) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    if (!canSendMessage()) return; 

    const room = rooms[currentRoomId];
    let msgText = '';
    let replyTo = null;

    if (typeof data === 'string') {
      msgText = data;
    } else if (data && typeof data === 'object') {
      msgText = String(data.text  || '');
      replyTo = data.replyTo ? {
        username: String(data.replyTo.username || '').slice(0, 40),
        text:     String(data.replyTo.text     || '').slice(0, 500)
      } : null;
    }

    msgText = msgText.trim().slice(0, 500); 
    if (!msgText) return;

    const message = {
      id:        `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      username,
      avatar:    userAvatar,
      text:      msgText,
      system:    false,
      timestamp: Date.now(),
      reactions: {},
      replyTo
    };

    room.messages.push(message);
    if (room.messages.length > 50) room.messages.shift();
    io.to(currentRoomId).emit('chat-message', message);
  });

  
  socket.on('message-reaction', ({ messageId, reactionType }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    if (typeof messageId !== 'string' || typeof reactionType !== 'string') return;
    if (!['heart', 'laugh', 'wow', 'like', 'fire'].includes(reactionType)) return; 

    const room = rooms[currentRoomId];
    const message = room.messages.find(m => m.id === messageId);
    if (!message) return;

    
    Object.keys(message.reactions).forEach(type => {
      if (type !== reactionType && Array.isArray(message.reactions[type])) {
        const uIdx = message.reactions[type].indexOf(username);
        if (uIdx !== -1) {
          message.reactions[type].splice(uIdx, 1);
        }
      }
    });

    if (!message.reactions[reactionType]) message.reactions[reactionType] = [];
    const idx = message.reactions[reactionType].indexOf(username);
    if (idx === -1) {
      message.reactions[reactionType].push(username);
    } else {
      message.reactions[reactionType].splice(idx, 1);
    }
    io.to(currentRoomId).emit('message-reaction-updated', { messageId, reactions: message.reactions });
  });

  
  socket.on('request-sync', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    socket.emit('server-action', {
      action:  room.isPlaying ? 'play' : 'pause',
      time:    getEstimatedTime(room),
      version: room.version,
      force:   true
    });
  });
  socket.on('typing', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    socket.to(currentRoomId).emit('user-typing', { username });
  });

  socket.on('stop-typing', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    socket.to(currentRoomId).emit('user-stop-typing', { username });
  });

  socket.on('leave-room', () => {
    if (!currentRoomId) return;
    socket.leave(currentRoomId);
    removeUserFromRoom(currentRoomId, socket.id);
    const room = rooms[currentRoomId];
    const users = room ? room.users : [];
    socket.to(currentRoomId).emit('user-left', { id: socket.id, username, users });
    if (room) {
      const msg = pushSystemMsg(room, `${username} покинул просмотр.`);
      io.to(currentRoomId).emit('chat-message', msg);
    }
    console.log(`[leave] ${username} (${socket.id}) ← ${currentRoomId}`);
    currentRoomId = null;
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    removeUserFromRoom(currentRoomId, socket.id);
    const room = rooms[currentRoomId];
    const users = room ? room.users : [];
    socket.to(currentRoomId).emit('user-left', { id: socket.id, username, users });
    if (room) {
      const msg = pushSystemMsg(room, `${username} покинул просмотр.`);
      io.to(currentRoomId).emit('chat-message', msg);
    }
    console.log(`[leave] ${username} (${socket.id}) ← ${currentRoomId}`);
  });
});




setInterval(() => {
  for (const roomId of Object.keys(rooms)) {
    const room = rooms[roomId];
    if (room.users.length > 0) {
      io.to(roomId).emit('sync-heartbeat', {
        isPlaying: room.isPlaying,
        time:      getEstimatedTime(room),
        version:   room.version
      });
    }
  }
}, 1000);


server.listen(PORT, '0.0.0.0', () => {
  console.log(`[wave] Server running → http://localhost:${PORT}`);
});
