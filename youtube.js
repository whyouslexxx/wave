'use strict';
// Рекомендации для главной: популярные ролики YouTube по категориям (YouTube Data API v3).
// Один запрос videos.list?chart=mostPopular стоит 1 единицу квоты; результат кэшируется.

const CATEGORIES = {
  all:           { id: null,  label: 'Всё' },
  gaming:        { id: '20',  label: 'Игры' },
  music:         { id: '10',  label: 'Музыка' },
  comedy:        { id: '23',  label: 'Юмор' },
  entertainment: { id: '24',  label: 'Развлечения' },
  film:          { id: '1',   label: 'Кино и анимация' },
  blogs:         { id: '22',  label: 'Блоги' }
};

const CACHE_TTL_MS = 45 * 60 * 1000;
const MIN_SECONDS  = 90;          // отсекаем шортсы
const MAX_SECONDS  = 3 * 3600;    // и многочасовые стримы

function parseIsoDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

function formatDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
  return many;
}

function formatViews(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '').replace('.', ',')} млн просмотров`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} тыс. просмотров`;
  return `${n} ${plural(n, 'просмотр', 'просмотра', 'просмотров')}`;
}

function formatAgo(iso, now = Date.now()) {
  const days = Math.max(0, Math.floor((now - Date.parse(iso)) / 86400000));
  if (days < 1) return 'сегодня';
  if (days < 7) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
  if (days < 30) { const w = Math.floor(days / 7); return `${w} ${plural(w, 'неделю', 'недели', 'недель')} назад`; }
  if (days < 365) { const mo = Math.floor(days / 30); return `${mo} ${plural(mo, 'месяц', 'месяца', 'месяцев')} назад`; }
  const y = Math.floor(days / 365);
  return `${y} ${plural(y, 'год', 'года', 'лет')} назад`;
}

function mapItem(v) {
  const sn = v.snippet || {};
  const sec = parseIsoDuration(v.contentDetails && v.contentDetails.duration);
  if (!v.id || !sn.title) return null;
  if (v.status && v.status.embeddable === false) return null;
  if (v.status && v.status.privacyStatus && v.status.privacyStatus !== 'public') return null;
  if (sn.liveBroadcastContent && sn.liveBroadcastContent !== 'none') return null;
  if (sec < MIN_SECONDS || sec > MAX_SECONDS) return null;
  const thumbs = sn.thumbnails || {};
  const thumb = (thumbs.maxres || thumbs.standard || thumbs.high || thumbs.medium || {}).url
    || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
  return {
    type: 'youtube',
    id: v.id,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    title: sn.title,
    channelName: sn.channelTitle || '',
    channelAvatar: `/api/ytavatar/${v.id}`,
    thumb,
    duration: formatDuration(sec),
    views: formatViews(v.statistics && v.statistics.viewCount),
    date: formatAgo(sn.publishedAt)
  };
}

function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// getJson(url) → Promise<object>; ключ и регион приходят снаружи, чтобы модуль легко тестировался.
function createRecommender({ apiKey, region = 'RU', getJson, now = Date.now }) {
  const cache = new Map();      // category → { at, items }
  const inflight = new Map();

  async function load(category) {
    const cat = CATEGORIES[category];
    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics,status',
      chart: 'mostPopular',
      regionCode: region,
      maxResults: '50',
      key: apiKey
    });
    if (cat.id) params.set('videoCategoryId', cat.id);
    const data = await getJson(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    if (data && data.error) throw new Error(data.error.message || 'YouTube API error');
    return (data.items || []).map(mapItem).filter(Boolean);
  }

  async function pool(category) {
    const hit = cache.get(category);
    if (hit && now() - hit.at < CACHE_TTL_MS) return hit.items;
    if (inflight.has(category)) return inflight.get(category);
    const p = load(category).then(items => {
      if (items.length) cache.set(category, { at: now(), items });
      return items;
    }).catch(err => {
      // Отдаём устаревший кэш, если API временно недоступен
      if (hit) return hit.items;
      throw err;
    }).finally(() => inflight.delete(category));
    inflight.set(category, p);
    return p;
  }

  return {
    enabled: !!apiKey,
    categories: Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label })),
    // Случайная выборка count роликов; exclude — id, которые не повторять (если хватает альтернатив).
    async pick(category, count, exclude = []) {
      if (!apiKey) return [];
      const key = CATEGORIES[category] ? category : 'all';
      const items = await pool(key);
      const skip = new Set(exclude);
      const fresh = items.filter(i => !skip.has(i.id));
      const source = fresh.length >= count ? fresh : items;
      return shuffle(source).slice(0, count);
    }
  };
}

module.exports = { createRecommender, CATEGORIES, _test: { parseIsoDuration, formatDuration, formatViews, formatAgo, mapItem } };
