

(function () {
  'use strict';

  
  const STATS_KEY    = 'wave_watch_stats_v2';
  const SESSIONS_KEY = 'wave_sessions_v1';
  const CHAT_MAX_DOM = 100; 

  
  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { totalSeconds: 0, history: [] }; }
    catch (e) { return { totalSeconds: 0, history: [] }; }
  }
  function saveStats(s) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function loadSessions() {
    try { return parseInt(localStorage.getItem(SESSIONS_KEY), 10) || 0; }
    catch (e) { return 0; }
  }
  function incSessions() {
    try { localStorage.setItem(SESSIONS_KEY, loadSessions() + 1); } catch (e) {}
  }

  
  let trackInterval   = null;
  let currentTracked  = null; 
  let sessionStart    = null;

  function isVideoPlaying() {
    try {
      if (window.ytPlayer && window.currentVideo?.type === 'youtube') {
        return window.ytPlayer.getPlayerState?.() === 1;
      }
      if (window.html5Player && !window.html5Player.paused && window.currentVideo?.type === 'direct') {
        return true;
      }
      if (window.vkPlayer && window.currentVideo?.type === 'vk') {
        return true; 
      }
    } catch (e) {}
    return false;
  }

  function startTracking(video) {
    if (!video) return;
    currentTracked = video;
    sessionStart   = sessionStart || Date.now();
    if (trackInterval) return;
    trackInterval = setInterval(() => {
      if (!isVideoPlaying() || !currentTracked) return;
      const stats = loadStats();
      stats.totalSeconds = (stats.totalSeconds || 0) + 1;
      const key = currentTracked.id || currentTracked.url || 'unknown';
      const idx = stats.history.findIndex(h => h.key === key);
      if (idx >= 0) {
        stats.history[idx].watchedSeconds = (stats.history[idx].watchedSeconds || 0) + 1;
        stats.history[idx].lastWatched    = Date.now();
      } else {
        stats.history.unshift({
          key,
          title:         currentTracked.title || 'Без названия',
          platform:      currentTracked.type  || 'direct',
          thumb:         currentTracked.thumb || '',
          watchedSeconds: 1,
          firstWatched:  Date.now(),
          lastWatched:   Date.now()
        });
        if (stats.history.length > 50) stats.history = stats.history.slice(0, 50);
      }
      saveStats(stats);
    }, 1000);
  }

  function stopTracking() {
    if (trackInterval) { clearInterval(trackInterval); trackInterval = null; }
    currentTracked = null;
  }

  
  if (window.socket) {
    window.socket.on('room-state', (state) => {
      if (state && state.video) {
        startTracking(state.video);
      } else {
        stopTracking();
      }
    });

    window.socket.on('video-change', (video) => {
      if (video) startTracking(video);
      else stopTracking();
    });

    
    window.socket.on('room-joined', () => {
      incSessions();
    });
  }

  
  function fmtSeconds(s) {
    s = Math.floor(s || 0);
    if (s < 60)   return s + 'с';
    if (s < 3600) return Math.floor(s / 60) + 'м ' + (s % 60) + 'с';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h + 'ч ' + (m ? m + 'м' : '');
  }
  function fmtHours(s) {
    const h = s / 3600;
    return h >= 1 ? h.toFixed(1) : (Math.floor(s / 60) + 'м');
  }
  function fmtRelative(ts) {
    if (!ts) return '';
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d === 0) return 'сегодня';
    if (d === 1) return 'вчера';
    if (d < 7)  return d + ' дн. назад';
    return new Date(ts).toLocaleDateString('ru', { day: 'numeric', month: 'short' });
  }

  
  const panel      = document.getElementById('profile-panel');
  const backdrop   = document.getElementById('profile-backdrop');
  const btnClose   = document.getElementById('btn-close-profile');
  const avatarSlot = document.getElementById('profile-avatar-large');
  const nameEl     = document.getElementById('profile-display-name');
  const statHours  = document.getElementById('stat-hours');
  const statVids   = document.getElementById('stat-videos');
  const statSess   = document.getElementById('stat-sessions');
  const histList   = document.getElementById('watch-history-list');

  function openProfile() {
    refreshProfile();
    panel.classList.add('active');
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeProfile() {
    panel.classList.remove('active');
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  function refreshProfile() {
    
    const profile = (() => {
      try { return JSON.parse(localStorage.getItem('wave_profile_v1')); } catch(e) { return null; }
    })();
    const uname = (profile && profile.username) || window.username || '?';
    const avatar = (profile && profile.avatarData) || null;

    if (nameEl) nameEl.textContent = uname;

    if (avatarSlot) {
      if (avatar && (avatar.startsWith('data:') || avatar.startsWith('http'))) {
        avatarSlot.innerHTML = `<img src="${avatar}" alt="${uname}">`;
      } else {
        const colors = ['#4A9E6E', '#7EC49B', '#B9E5C8', '#6B5545', '#9C8472'];
        const bg = colors[uname.charCodeAt(0) % colors.length];
        avatarSlot.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${bg}"/><text x="50" y="66" font-family="sans-serif" font-size="44" font-weight="bold" fill="#2B1A12" text-anchor="middle">${uname[0].toUpperCase()}</text></svg>`;
      }
    }

    
    const stats = loadStats();
    if (statHours)  statHours.textContent  = fmtHours(stats.totalSeconds);
    if (statVids)   statVids.textContent   = stats.history.length;
    if (statSess)   statSess.textContent   = loadSessions();

    
    if (!histList) return;
    if (!stats.history.length) {
      histList.innerHTML = `
        <div class="history-empty">
          <i class="fa-solid fa-film"></i>
          <p>Ни одного видео пока нет.<br>Запустите что-нибудь — и оно появится здесь.</p>
        </div>`;
      return;
    }
    histList.innerHTML = '';
    stats.history.slice(0, 30).forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      const thumb = item.thumb
        ? `<img class="history-thumb" src="${item.thumb}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
        : `<div class="history-thumb" style="background:var(--bg-2);"></div>`;
      const pBadge = item.platform === 'youtube' ? 'YouTube' : item.platform === 'vk' ? 'VK Видео' : 'Прямая ссылка';
      el.innerHTML = `
        ${thumb}
        <div class="history-info">
          <div class="history-title">${escHtmlSafe(item.title)}</div>
          <div class="history-meta">
            <span class="history-duration">${fmtSeconds(item.watchedSeconds)}</span>
            <span class="history-platform">${pBadge}</span>
            <span class="history-date">${fmtRelative(item.lastWatched)}</span>
          </div>
        </div>`;
      histList.appendChild(el);
    });
  }

  function escHtmlSafe(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  
  const profileBar = document.getElementById('saved-profile-bar');
  if (profileBar) {
    profileBar.style.cursor = 'pointer';
    profileBar.addEventListener('click', (e) => {
      if (e.target.closest('#btn-logout')) return; 
      openProfile();
    });
  }

  if (btnClose)  btnClose.addEventListener('click', closeProfile);
  if (backdrop)  backdrop.addEventListener('click', closeProfile);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProfile(); });

  
  const chatMessages = document.getElementById('chat-messages');

  function trimChatDOM() {
    if (!chatMessages) return;
    const wrappers = chatMessages.querySelectorAll('.chat-message-wrapper, .chat-bubble.system');
    if (wrappers.length > CHAT_MAX_DOM) {
      const excess = wrappers.length - CHAT_MAX_DOM;
      for (let i = 0; i < excess; i++) wrappers[i].remove();
    }
  }

  
  if (chatMessages) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes.length) { trimChatDOM(); break; }
      }
    });
    observer.observe(chatMessages, { childList: true });
  }

  
  const REACTIONS = [
    { emoji: '❤️', key: 'heart' },
    { emoji: '😂', key: 'laugh' },
    { emoji: '😮', key: 'wow'   },
    { emoji: '👍', key: 'like'  },
    { emoji: '🔥', key: 'fire'  },
  ];

  
  const contextMenu = document.getElementById('chat-context-menu');
  if (contextMenu) {
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:var(--border);margin:4px 8px;';
    const pickerRow = document.createElement('div');
    pickerRow.className = 'reaction-picker-row';
    pickerRow.style.cssText = 'display:flex;gap:4px;padding:6px 10px;';
    REACTIONS.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'reaction-pick-btn';
      btn.textContent = r.emoji;
      btn.title = r.key;
      btn.style.cssText = 'background:none;border:none;font-size:20px;cursor:pointer;border-radius:8px;padding:2px 4px;transition:transform 0.15s;';
      btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.3)');
      btn.addEventListener('mouseleave', () => btn.style.transform = '');
      btn.addEventListener('click', () => {
        
        const mid = contextMenu.dataset.messageId;
        if (mid && window.socket) {
          window.socket.emit('message-reaction', { messageId: mid, reactionType: r.key });
        }
        contextMenu.style.display = 'none';
      });
      pickerRow.appendChild(btn);
    });
    contextMenu.insertBefore(sep, contextMenu.firstChild);
    contextMenu.insertBefore(pickerRow, contextMenu.firstChild);
  }

  
  const _orig = window.openContextMenu;
  if (typeof _orig === 'function') {
    window.openContextMenu = function(messageId, msgUser, msgText, clientX, clientY) {
      if (contextMenu) contextMenu.dataset.messageId = messageId;
      _orig.call(this, messageId, msgUser, msgText, clientX, clientY);
    };
  }

  
  const REACTION_ICONS = { heart:'❤️', laugh:'😂', wow:'😮', like:'👍', fire:'🔥' };
  const _origRender = window.renderReactions;
  if (typeof _origRender === 'function') {
    window.renderReactions = function(messageId, reactions) {
      const bubble = document.getElementById('bubble-' + messageId);
      if (!bubble) return;

      const legacyPill = bubble.querySelector(':scope > .bubble-reactions');
      if (legacyPill) legacyPill.remove();

      let container = bubble.querySelector('.bubble-reactions-multi');
      if (container) container.remove();
      if (!reactions) return;

      const entries = Object.entries(reactions).filter(([, users]) => users && users.length > 0);
      if (!entries.length) return;

      container = document.createElement('div');
      container.className = 'bubble-reactions-multi';
      container.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;';

      entries.forEach(([type, users]) => {
        const pill = document.createElement('div');
        pill.className = 'bubble-reactions';
        pill.title = 'Лайкнули: ' + users.join(', ');
        pill.innerHTML = `<span>${REACTION_ICONS[type] || '❤️'}</span><span class="reaction-count">${users.length}</span>`;
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.socket) window.socket.emit('message-reaction', { messageId, reactionType: type });
        });
        container.appendChild(pill);
      });

      bubble.appendChild(container);
    };
  }

  

  const lobbyScreen = document.getElementById('lobby-screen');
  if (lobbyScreen) {
    const obs2 = new MutationObserver(() => {
      if (lobbyScreen.classList.contains('active')) stopTracking();
    });
    obs2.observe(lobbyScreen, { attributes: true, attributeFilter: ['class'] });
  }

  console.log('[Wave Profile] loaded ✓');

})();
