(function () {
  'use strict';

  const CHAT_MAX_DOM = 100;
  const PLATFORMS = { youtube: 'YouTube', vk: 'VK Видео', rutube: 'Rutube', direct: 'Прямая ссылка' };

  // Время просмотра и история считаются на сервере (по аккаунту), здесь — только показ.
  function fmtSeconds(s) {
    s = Math.floor(s || 0);
    if (s < 60)   return s + 'с';
    if (s < 3600) return Math.floor(s / 60) + 'м ' + (s % 60) + 'с';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h + 'ч' + (m ? ' ' + m + 'м' : '');
  }
  function fmtHours(s) {
    const h = s / 3600;
    return h >= 1 ? h.toFixed(1) : (Math.floor(s / 60) + 'м');
  }
  function fmtRelative(ts) {
    if (!ts) return '';
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const d = Math.floor((startOfToday - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
    if (d <= 0) return 'сегодня';
    if (d === 1) return 'вчера';
    if (d < 7)  return d + ' дн. назад';
    return new Date(ts).toLocaleDateString('ru', { day: 'numeric', month: 'short' });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function safeUrl(u) {
    return /^(https?:\/\/|\/(?!\/)|data:image\/)/i.test(u || '') ? u : '';
  }

  const panel      = document.getElementById('profile-panel');
  const backdrop   = document.getElementById('profile-backdrop');
  const btnClose   = document.getElementById('btn-close-profile');
  const avatarSlot = document.getElementById('profile-avatar-large');
  const nameEl     = document.getElementById('profile-display-name');
  const sinceEl    = document.getElementById('profile-since');
  const statHours  = document.getElementById('stat-hours');
  const statVids   = document.getElementById('stat-videos');
  const statSess   = document.getElementById('stat-sessions');
  const histList   = document.getElementById('watch-history-list');
  const btnClear   = document.getElementById('btn-clear-history');

  let historyItems = [];

  function renderAvatar() {
    if (!avatarSlot) return;
    if (avatarData && (avatarData.startsWith('data:') || avatarData.startsWith('http'))) {
      avatarSlot.innerHTML = `<img src="${esc(avatarData)}" alt="${esc(username)}">`;
    } else {
      const colors = ['#4A9E6E', '#7EC49B', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4'];
      const bg = colors[(username.codePointAt(0) || 0) % colors.length];
      avatarSlot.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${bg}"/><text x="50" y="66" font-family="sans-serif" font-size="44" font-weight="bold" fill="#fff" text-anchor="middle">${esc((Array.from(username)[0] || '?').toUpperCase())}</text></svg>`;
    }
  }

  function renderHistory() {
    if (!histList) return;
    if (btnClear) btnClear.hidden = !historyItems.length;
    if (!historyItems.length) {
      histList.className = 'history-empty';
      histList.innerHTML = `
        <i class="fa-solid fa-film"></i>
        <p>Ни одного видео пока нет.<br>Запустите что-нибудь — и оно появится здесь.</p>`;
      return;
    }
    histList.className = '';
    histList.innerHTML = '';
    historyItems.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      const thumbSrc = safeUrl(item.thumb);
      const thumb = thumbSrc
        ? `<img class="history-thumb" src="${esc(thumbSrc)}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">`
        : `<div class="history-thumb"></div>`;
      el.innerHTML = `
        ${thumb}
        <div class="history-info">
          <div class="history-title">${esc(item.title || item.url || 'Без названия')}</div>
          <div class="history-meta">
            <span class="history-duration">${fmtSeconds(item.watchedSeconds)}</span>
            <span class="history-platform">${esc(PLATFORMS[item.type] || 'Видео')}</span>
            <span class="history-date">${fmtRelative(item.lastWatched)}</span>
          </div>
        </div>
        <div class="history-actions">
          <button type="button" class="history-action replay" title="Смотреть снова" aria-label="Смотреть снова"><i class="fa-solid fa-play"></i></button>
          <button type="button" class="history-action remove" title="Убрать из истории" aria-label="Убрать из истории"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
      el.querySelector('.replay').addEventListener('click', () => replay(item));
      el.querySelector('.remove').addEventListener('click', async () => {
        try {
          await api('DELETE', '/api/history/' + encodeURIComponent(item.key));
          historyItems = historyItems.filter(h => h.key !== item.key);
          statVids.textContent = historyItems.length;
          renderHistory();
        } catch (e) { alert(e.message); }
      });
      histList.appendChild(el);
    });
  }

  function replay(item) {
    const video = {
      type: item.type, id: item.id, url: item.url, playerUrl: item.playerUrl,
      referer: item.referer, title: item.title, thumb: item.thumb
    };
    closeProfile();
    if (roomId) {
      socket.emit('video-change', video);
    } else {
      openCreateVideoModal(video);
    }
  }

  async function refreshProfile() {
    if (nameEl) nameEl.textContent = username || '—';
    renderAvatar();
    try {
      const data = await api('GET', '/api/history');
      historyItems = data.history || [];
      if (statHours) statHours.textContent = fmtHours(data.stats.totalSeconds);
      if (statVids)  statVids.textContent  = data.stats.videos;
      if (statSess)  statSess.textContent  = data.stats.sessions;
      renderHistory();
    } catch (e) {
      if (histList) { histList.className = 'history-empty'; histList.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><p>Не удалось загрузить историю</p>`; }
    }
  }

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
    const pf = document.getElementById('password-form');
    if (pf) pf.hidden = true;
  }

  const profileBar = document.getElementById('saved-profile-bar');
  if (profileBar) profileBar.addEventListener('click', openProfile);
  if (btnClose)  btnClose.addEventListener('click', closeProfile);
  if (backdrop)  backdrop.addEventListener('click', closeProfile);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProfile(); });

  window.addEventListener('wave:user', (e) => { if (!e.detail) closeProfile(); });

  if (btnClear) btnClear.addEventListener('click', async () => {
    if (!confirm('Очистить всю историю просмотров?')) return;
    try {
      await api('DELETE', '/api/history');
      historyItems = [];
      statVids.textContent = '0';
      renderHistory();
    } catch (e) { alert(e.message); }
  });

  document.getElementById('btn-profile-logout').addEventListener('click', () => {
    if (confirm('Выйти из аккаунта?')) { closeProfile(); window.waveLogout(); }
  });

  // ── Смена фото ────────────────────────────────────────────────────────────
  const avatarInput = document.getElementById('profile-avatar-input');
  document.getElementById('btn-profile-avatar').addEventListener('click', () => avatarInput.click());
  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files && avatarInput.files[0];
    avatarInput.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const size = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      canvas.getContext('2d').drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 256, 256);
      try {
        const { user } = await api('PUT', '/api/profile', { avatar: canvas.toDataURL('image/jpeg', 0.85) });
        avatarData = user.avatar || null;
        updateProfileBar();
        renderAvatar();
      } catch (e) { alert(e.message); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert('Не удалось прочитать изображение'); };
    img.src = url;
  });

  // ── Смена пароля ──────────────────────────────────────────────────────────
  const pwForm = document.getElementById('password-form');
  const pwMsg  = document.getElementById('pw-message');
  document.getElementById('btn-toggle-password').addEventListener('click', () => {
    pwForm.hidden = !pwForm.hidden;
    pwMsg.hidden = true;
    if (!pwForm.hidden) document.getElementById('pw-old').focus();
  });
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPassword = document.getElementById('pw-old').value;
    const newPassword = document.getElementById('pw-new').value;
    const btn = document.getElementById('pw-submit');
    const show = (text, ok) => { pwMsg.textContent = text; pwMsg.classList.toggle('ok', !!ok); pwMsg.hidden = false; };
    if (newPassword.length < 8) return show('Новый пароль: минимум 8 символов');
    btn.disabled = true;
    try {
      await api('POST', '/api/auth/password', { oldPassword, newPassword });
      pwForm.reset();
      show('Пароль изменён. На других устройствах потребуется войти заново', true);
    } catch (err) { show(err.message); }
    finally { btn.disabled = false; }
  });


  
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

  

  console.log('[Wave Profile] loaded ✓');

})();
