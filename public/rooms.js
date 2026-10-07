// Комнаты и друзья: вход по ссылке/коду, «Мои комнаты», публичные, настройки, приглашения.
// Опирается на глобальные объекты client.js: socket, api, enterRoom, roomId, username, leaveRoom, escHtml.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => escHtml(String(s == null ? '' : s));

  let currentUser = null;
  let settings = null;          // настройки текущей комнаты
  let lastJoin = null;          // последняя попытка входа (для пароля)
  let deepLinkDone = false;
  let friends = { friends: [], incoming: [], outgoing: [] };

  // ── Уведомления ───────────────────────────────────────────────────────────
  function toast({ icon = 'fa-circle-info', title, text = '', avatar = '', actions = [], timeout = 6000, kind = '' }) {
    const stack = $('toast-stack');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `
      ${avatar ? `<img class="toast-avatar" src="${esc(avatar)}" alt="">` : `<i class="fa-solid ${esc(icon)} toast-icon"></i>`}
      <div class="toast-body">
        <div class="toast-title">${esc(title)}</div>
        ${text ? `<div class="toast-text">${esc(text)}</div>` : ''}
        ${actions.length ? '<div class="toast-actions"></div>' : ''}
      </div>`;
    const close = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 250); };
    const box = el.querySelector('.toast-actions');
    actions.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.primary ? 'toast-btn primary' : 'toast-btn';
      b.textContent = a.label;
      b.addEventListener('click', () => { close(); if (a.onClick) a.onClick(); });
      box.appendChild(b);
    });
    stack.appendChild(el);
    while (stack.children.length > 4) stack.firstChild.remove();
    if (timeout) setTimeout(close, timeout);
    return close;
  }
  window.waveToast = toast;

  // ── Разбор ввода: ссылка-приглашение или код ──────────────────────────────
  function parseRoomInput(raw) {
    raw = String(raw || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw);
      const hash = u.hash.replace(/^#/, '');
      return (hash || u.pathname.split('/').filter(Boolean).pop() || '').toLowerCase();
    } catch (e) { /* не ссылка */ }
    return raw.replace(/^#/, '').toLowerCase();
  }

  function go(code, opts = {}) {
    const id = String(code || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!id) { toast({ icon: 'fa-circle-exclamation', title: 'Введите код или ссылку на комнату', kind: 'error' }); return false; }
    lastJoin = { id, video: opts.video || null };
    return enterRoom(id, opts);
  }

  async function quickCreate(video) {
    try {
      const { room } = await api('POST', '/api/rooms', {});
      go(room.id, { video });
    } catch (err) {
      toast({ icon: 'fa-circle-exclamation', title: 'Не удалось создать комнату', text: err.message, kind: 'error' });
    }
  }

  // ── Вход: единое поле ─────────────────────────────────────────────────────
  const joinInput = $('join-input');
  $('join-bar').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = parseRoomInput(joinInput.value);
    if (go(code)) joinInput.value = '';
  });
  joinInput.addEventListener('paste', () => {
    setTimeout(() => {
      if (/^https?:\/\//i.test(joinInput.value.trim()) && parseRoomInput(joinInput.value)) $('join-bar').requestSubmit();
    }, 0);
  });

  // ── Окно пароля ───────────────────────────────────────────────────────────
  const pwModal = $('room-password-modal');
  const pwInput = $('rp-password');
  const pwError = $('rp-error');

  function openPasswordModal(roomCode, errorText) {
    $('rp-room-label').textContent = `Комната «${roomCode}» защищена паролем. Введите его, чтобы войти.`;
    pwError.hidden = !errorText;
    pwError.textContent = errorText || '';
    pwModal.style.display = 'flex';
    pwInput.value = '';
    setTimeout(() => pwInput.focus(), 50);
  }
  function closePasswordModal() { pwModal.style.display = 'none'; }
  $('btn-close-room-password').addEventListener('click', closePasswordModal);
  pwModal.addEventListener('click', (e) => { if (e.target === pwModal) closePasswordModal(); });
  $('room-password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!lastJoin || !pwInput.value) return;
    enterRoom(lastJoin.id, { password: pwInput.value, video: lastJoin.video });
  });

  socket.on('room-error', (err) => {
    if (err.code === 'PASSWORD_REQUIRED') return openPasswordModal(err.roomId);
    if (err.code === 'BAD_PASSWORD') return openPasswordModal(err.roomId, err.message);
    toast({ icon: 'fa-circle-exclamation', title: err.message || 'Не удалось войти в комнату', kind: 'error' });
  });
  socket.on('room-status', () => closePasswordModal());

  // ── Создание: быстрое и с настройками ─────────────────────────────────────
  $('btn-quick-create').addEventListener('click', () => quickCreate());

  const cfgModal = $('room-config-modal');
  let cfgMode = 'create';
  const seg = { visibility: 'unlisted', control: 'all' };

  function setSeg(group, value) {
    seg[group] = value;
    $(group === 'visibility' ? 'rc-visibility' : 'rc-control').querySelectorAll('.seg')
      .forEach(b => b.classList.toggle('active', b.dataset.value === value));
    if (group === 'visibility') {
      $('rc-visibility-hint').textContent = value === 'public'
        ? 'Комната появится в «Сейчас смотрят» у всех, пока в ней кто-то есть.'
        : 'Зайти можно только по коду, ссылке или приглашению.';
    }
  }
  ['rc-visibility', 'rc-control'].forEach(id => {
    $(id).querySelectorAll('.seg').forEach(b => b.addEventListener('click', () => setSeg(id === 'rc-visibility' ? 'visibility' : 'control', b.dataset.value)));
  });

  $('rc-toggle-pass').addEventListener('click', () => {
    const input = $('rc-password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('rc-toggle-pass').firstElementChild.className = show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
  });

  function openConfig(mode) {
    cfgMode = mode;
    const edit = mode === 'edit';
    $('room-config-title').innerHTML = edit ? '<i class="fa-solid fa-gear"></i> Настройки комнаты' : '<i class="fa-solid fa-sliders"></i> Новая комната';
    $('rc-submit-label').textContent = edit ? 'Сохранить' : 'Создать и войти';
    $('rc-code-group').hidden = edit;
    $('rc-clear-row').hidden = !(edit && settings && settings.locked);
    $('rc-clear-password').checked = false;
    $('rc-password').value = '';
    $('rc-password').type = 'password';
    $('rc-password').placeholder = edit && settings && settings.locked ? 'Оставьте пустым, чтобы не менять' : 'Без пароля';
    $('rc-title').value = edit && settings ? settings.title : '';
    $('rc-code').value = '';
    setSeg('visibility', edit && settings ? settings.visibility : 'unlisted');
    setSeg('control', edit && settings ? settings.controlMode : 'all');
    $('rc-error').hidden = true;
    cfgModal.style.display = 'flex';
  }
  const closeConfig = () => { cfgModal.style.display = 'none'; };
  $('btn-create-options').addEventListener('click', () => openConfig('create'));
  $('btn-room-settings').addEventListener('click', () => openConfig('edit'));
  $('btn-close-room-config').addEventListener('click', closeConfig);
  cfgModal.addEventListener('click', (e) => { if (e.target === cfgModal) closeConfig(); });

  $('room-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('rc-error');
    err.hidden = true;
    const password = $('rc-password').value;
    if (password && password.length < 4) { err.textContent = 'Пароль комнаты: минимум 4 символа'; err.hidden = false; return; }

    if (cfgMode === 'edit') {
      const patch = { title: $('rc-title').value, visibility: seg.visibility, controlMode: seg.control };
      if (password) patch.password = password;
      else if ($('rc-clear-password').checked) patch.password = null;
      socket.emit('room-settings', patch);
      closeConfig();
      return;
    }

    const btn = $('rc-submit');
    btn.disabled = true;
    try {
      const body = { title: $('rc-title').value, visibility: seg.visibility, controlMode: seg.control };
      if (password) body.password = password;
      const code = $('rc-code').value.trim().toLowerCase();
      if (code) body.code = code;
      const { room } = await api('POST', '/api/rooms', body);
      closeConfig();
      go(room.id);
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally { btn.disabled = false; }
  });

  // ── Создание комнаты из карточки видео ────────────────────────────────────
  const videoModal = $('create-with-video-modal');
  $('btn-close-create-video-modal').addEventListener('click', () => { videoModal.style.display = 'none'; });
  videoModal.addEventListener('click', (e) => { if (e.target === videoModal) videoModal.style.display = 'none'; });
  $('btn-submit-create-video-room').addEventListener('click', () => {
    videoModal.style.display = 'none';
    quickCreate(selectedVideoForModal);
  });

  // ── Карточки комнат ───────────────────────────────────────────────────────
  function relTime(ts) {
    const d = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
    if (d <= 0) return 'заходили сегодня';
    if (d === 1) return 'заходили вчера';
    if (d < 7) return `заходили ${d} дн. назад`;
    return 'заходили ' + new Date(ts).toLocaleDateString('ru', { day: 'numeric', month: 'short' });
  }

  function roomCard(r) {
    const live = r.live;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'room-card' + (live ? ' live' : '');
    const thumb = live && live.video && live.video.thumb;
    const name = r.title || r.id;
    const avatars = live ? live.users.map(u => `<img src="${esc(u.avatar)}" alt="${esc(u.username)}" title="${esc(u.username)}" onerror="this.style.visibility='hidden'">`).join('') : '';
    el.innerHTML = `
      <div class="room-card-cover"${thumb ? ` style="background-image:url('${esc(thumb)}')"` : ''}>
        ${live ? `<span class="room-live"><i class="fa-solid fa-circle"></i> ${live.count} ${live.count === 1 ? 'смотрит' : 'смотрят'}</span>` : ''}
        ${r.locked ? '<span class="room-lock"><i class="fa-solid fa-lock"></i></span>' : ''}
        ${!thumb ? '<i class="fa-solid fa-clapperboard room-cover-icon"></i>' : ''}
      </div>
      <div class="room-card-body">
        <div class="room-card-name">${esc(name)}</div>
        <div class="room-card-sub">${live
          ? (live.video && live.video.title ? esc(live.video.title) : 'Видео ещё не выбрано')
          : esc(relTime(r.lastVisited))}</div>
        <div class="room-card-foot">
          <div class="room-avatars">${avatars}</div>
          <span class="room-card-go">${live ? 'Присоединиться' : 'Войти'} <i class="fa-solid fa-arrow-right"></i></span>
        </div>
      </div>`;
    el.addEventListener('click', () => go(r.id));
    return el;
  }

  function fillRooms(sectionId, listId, rooms) {
    $(sectionId).hidden = !rooms.length;
    const box = $(listId);
    box.innerHTML = '';
    rooms.forEach(r => box.appendChild(roomCard(r)));
  }

  async function loadRooms() {
    if (!currentUser) return;
    try {
      const [mine, pub] = await Promise.all([api('GET', '/api/rooms/mine'), api('GET', '/api/rooms/public')]);
      const mineIds = new Set(mine.rooms.map(r => r.id));
      fillRooms('my-rooms-section', 'my-rooms', mine.rooms);
      fillRooms('public-rooms-section', 'public-rooms', pub.rooms.filter(r => !mineIds.has(r.id)));
    } catch (e) { /* сеть моргнула — обновим при следующем тике */ }
  }
  setInterval(() => {
    if (currentUser && !document.hidden && lobbyScreen.classList.contains('active') && !$('lobby-grid-hub').hidden
        && $('lobby-grid-hub').style.display !== 'none') loadRooms();
  }, 10000);

  // ── Настройки текущей комнаты ─────────────────────────────────────────────
  function applySettings(s) {
    settings = s;
    if (!s) return;
    $('room-chip-lock').hidden = !s.locked;
    const showHost = s.controlMode === 'host';
    $('room-chip-host').hidden = !showHost;
    if (showHost) {
      const me = s.hostId === socket.id;
      $('room-chip-host-name').textContent = me ? 'Вы управляете' : (s.hostName ? `Управляет ${s.hostName}` : 'Управляет хозяин');
      $('room-chip-host').title = 'Только хозяин комнаты может ставить паузу, перематывать и менять видео';
    }
    $('btn-room-settings').hidden = !(currentUser && s.ownerId === currentUser.id);
    roomNameDisplay.textContent = s.title || s.id;
  }
  socket.on('room-status', (st) => applySettings(st.settings));
  socket.on('room-settings', applySettings);

  let deniedAt = 0;
  socket.on('control-denied', ({ hostName }) => {
    if (Date.now() - deniedAt < 4000) return;
    deniedAt = Date.now();
    toast({ icon: 'fa-crown', title: 'Управляет хозяин комнаты', text: hostName ? `${hostName} решает, что и когда смотреть` : 'Вы можете смотреть и общаться в чате', kind: 'warn' });
  });

  // ── Друзья ────────────────────────────────────────────────────────────────
  const friendsPanel = $('friends-panel');
  const friendsBackdrop = $('friends-backdrop');
  const openFriends = () => { friendsPanel.classList.add('active'); friendsBackdrop.classList.add('active'); loadFriends(); };
  const closeFriends = () => { friendsPanel.classList.remove('active'); friendsBackdrop.classList.remove('active'); };
  $('btn-open-friends').addEventListener('click', openFriends);
  $('btn-close-friends').addEventListener('click', closeFriends);
  friendsBackdrop.addEventListener('click', closeFriends);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeFriends(); closeConfig(); closePasswordModal(); hideInvite(); } });

  function avatarImg(f) {
    return `<span class="friend-avatar"><img src="${esc(f.avatar)}" alt="" onerror="this.style.visibility='hidden'"><i class="friend-dot ${f.online ? 'on' : ''}"></i></span>`;
  }

  function statusText(f) {
    if (!f.online) return 'не в сети';
    if (f.roomId) return f.roomLocked ? 'в комнате с паролем' : 'смотрит в комнате';
    return 'в сети';
  }

  function updateBadge() {
    const n = friends.incoming.length;
    const badge = $('friends-badge');
    badge.hidden = !n;
    badge.textContent = n;
  }

  function renderFriends() {
    updateBadge();
    const box = $('friends-scroll');
    box.innerHTML = '';
    const section = (title, rows) => {
      if (!rows.length) return;
      const h = document.createElement('h3');
      h.className = 'friends-section-title';
      h.textContent = title;
      box.appendChild(h);
      rows.forEach(r => box.appendChild(r));
    };

    const row = (f, actions) => {
      const el = document.createElement('div');
      el.className = 'friend-row';
      el.innerHTML = `${avatarImg(f)}<div class="friend-info"><div class="friend-name">${esc(f.username)}</div><div class="friend-status">${esc(f.statusText || '')}</div></div><div class="friend-actions"></div>`;
      const acts = el.querySelector('.friend-actions');
      actions.forEach(a => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'friend-btn ' + (a.cls || '');
        b.innerHTML = a.html;
        b.title = a.title || '';
        b.addEventListener('click', a.onClick);
        acts.appendChild(b);
      });
      return el;
    };

    section('Заявки в друзья', friends.incoming.map(f => row({ ...f, statusText: 'хочет добавить вас' }, [
      { html: '<i class="fa-solid fa-check"></i>', cls: 'ok', title: 'Принять', onClick: () => friendAction('accept', f.id) },
      { html: '<i class="fa-solid fa-xmark"></i>', title: 'Отклонить', onClick: () => friendAction('decline', f.id) }
    ])));

    const sorted = [...friends.friends].sort((a, b) => (b.online - a.online) || a.username.localeCompare(b.username));
    section('Друзья', sorted.map(f => {
      const acts = [];
      if (f.roomId && !(roomId && f.roomId === roomId)) {
        acts.push({ html: 'Присоединиться', cls: 'primary', onClick: () => { closeFriends(); go(f.roomId); } });
      }
      acts.push({ html: '<i class="fa-solid fa-user-minus"></i>', cls: 'danger', title: 'Удалить из друзей', onClick: () => removeFriend(f) });
      return row({ ...f, statusText: statusText(f) }, acts);
    }));

    section('Исходящие заявки', friends.outgoing.map(f => row({ ...f, statusText: 'ожидает ответа' }, [
      { html: 'Отменить', onClick: () => friendAction('decline', f.id) }
    ])));

    if (!friends.friends.length && !friends.incoming.length && !friends.outgoing.length) {
      box.innerHTML = '<div class="history-empty"><i class="fa-solid fa-user-group"></i><p>Пока никого нет.<br>Введите имя друга выше, чтобы отправить заявку.</p></div>';
    }
    renderInviteList();
  }

  async function loadFriends() {
    if (!currentUser) return;
    try { friends = await api('GET', '/api/friends'); renderFriends(); } catch (e) { /* ignore */ }
  }

  async function friendAction(kind, id) {
    try { friends = await api('POST', '/api/friends/' + kind, { id }); renderFriends(); }
    catch (e) { toast({ icon: 'fa-circle-exclamation', title: e.message, kind: 'error' }); }
  }
  async function removeFriend(f) {
    if (!confirm(`Удалить ${f.username} из друзей?`)) return;
    try { friends = await api('DELETE', '/api/friends/' + encodeURIComponent(f.id)); renderFriends(); }
    catch (e) { toast({ icon: 'fa-circle-exclamation', title: e.message, kind: 'error' }); }
  }

  const friendMsg = $('friend-msg');
  $('friend-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('friend-add-input');
    const name = input.value.trim();
    if (!name) return;
    friendMsg.hidden = true;
    try {
      const data = await api('POST', '/api/friends/request', { username: name });
      friends = { friends: data.friends, incoming: data.incoming, outgoing: data.outgoing };
      input.value = '';
      friendMsg.textContent = data.status === 'friends' ? 'Вы теперь друзья!' : 'Заявка отправлена';
      friendMsg.classList.add('ok');
      friendMsg.hidden = false;
      renderFriends();
    } catch (ex) {
      friendMsg.textContent = ex.message;
      friendMsg.classList.remove('ok');
      friendMsg.hidden = false;
    }
  });

  socket.on('friends-changed', ({ kind, user }) => {
    loadFriends();
    if (kind === 'request' && user) {
      toast({ avatar: user.avatar, title: `${user.username} хочет дружить`, text: 'Заявка в друзья', timeout: 9000,
        actions: [{ label: 'Открыть', primary: true, onClick: openFriends }] });
    } else if (kind === 'accepted' && user) {
      toast({ avatar: user.avatar, title: `${user.username} теперь ваш друг` });
    }
  });

  socket.on('friend-presence', (card) => {
    const f = friends.friends.find(x => x.id === card.id);
    if (!f) return;
    Object.assign(f, card);
    renderFriends();
  });

  // ── Приглашения ───────────────────────────────────────────────────────────
  const popover = $('invite-popover');
  function hideInvite() { popover.hidden = true; }

  function renderInviteList() {
    const list = $('invite-list');
    if (!list) return;
    const online = friends.friends.filter(f => f.online);
    list.innerHTML = '';
    if (!online.length) {
      list.innerHTML = `<div class="invite-empty">${friends.friends.length ? 'Сейчас никого из друзей нет в сети' : 'Добавьте друзей на главной странице, чтобы приглашать их сюда'}</div>`;
      return;
    }
    online.forEach(f => {
      const row = document.createElement('div');
      row.className = 'invite-row';
      row.innerHTML = `${avatarImg(f)}<span class="friend-name">${esc(f.username)}</span>`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'friend-btn primary';
      b.textContent = 'Позвать';
      b.addEventListener('click', () => {
        b.disabled = true;
        socket.emit('invite-friend', { userId: f.id }, (res) => {
          if (res && res.ok) { b.textContent = 'Отправлено'; }
          else { b.disabled = false; toast({ icon: 'fa-circle-exclamation', title: (res && res.message) || 'Не удалось отправить приглашение', kind: 'error' }); }
        });
      });
      row.appendChild(b);
      list.appendChild(row);
    });
  }

  $('btn-invite-friend').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!popover.hidden) return hideInvite();
    loadFriends();
    renderInviteList();
    const r = e.currentTarget.getBoundingClientRect();
    popover.style.top = (r.bottom + 8) + 'px';
    popover.style.left = Math.max(8, Math.min(window.innerWidth - 300, r.left)) + 'px';
    popover.hidden = false;
  });
  document.addEventListener('click', (e) => { if (!popover.contains(e.target)) hideInvite(); });

  socket.on('room-invite', ({ from, roomId: rid, title, locked }) => {
    toast({
      avatar: from.avatar, title: `${from.username} зовёт вас смотреть вместе`,
      text: title ? `Комната «${title}»` : `Комната ${rid}`, timeout: 20000,
      actions: [
        { label: 'Присоединиться', primary: true, onClick: () => {
          if (roomId && roomId !== rid) { leaveRoom(); setTimeout(() => go(rid), 150); } else if (!roomId) go(rid);
        } },
        { label: 'Позже' }
      ]
    });
  });

  // ── Жизненный цикл ────────────────────────────────────────────────────────
  window.addEventListener('wave:user', (e) => {
    currentUser = e.detail;
    if (!currentUser) {
      settings = null; deepLinkDone = false;
      friends = { friends: [], incoming: [], outgoing: [] };
      closeFriends(); hideInvite(); closeConfig(); closePasswordModal();
      $('my-rooms-section').hidden = true; $('public-rooms-section').hidden = true;
      updateBadge();
      return;
    }
    loadFriends();
    loadRooms();
    // Ссылка-приглашение вида /#код — заходим сразу, без лишних окон
    const hash = window.location.hash.replace(/^#/, '');
    if (hash && !deepLinkDone && !roomId) { deepLinkDone = true; go(hash); }
  });

  // Возврат в лобби из комнаты — освежаем списки
  new MutationObserver(() => { if (lobbyScreen.classList.contains('active')) { loadRooms(); loadFriends(); } })
    .observe(lobbyScreen, { attributes: true, attributeFilter: ['class'] });
})();
