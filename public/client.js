

window.addEventListener('error', (e) => {
  const errorMsg = `[JS Error] ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`;
  console.error(errorMsg);
  const chatMessages = document.getElementById('chat-messages');
  if (chatMessages) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble system';
    bubble.style.color = '#ff6b6b';
    bubble.style.fontWeight = 'bold';
    bubble.textContent = errorMsg;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  let errDiv = document.getElementById('debug-error-bar');
  if (!errDiv) {
    errDiv = document.createElement('div');
    errDiv.id = 'debug-error-bar';
    errDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#e74c3c;color:#fff;padding:8px;z-index:999999;font-size:12px;font-family:monospace;word-break:break-all;';
    document.body.appendChild(errDiv);
  }
  errDiv.textContent = errorMsg;
});

window.addEventListener('unhandledrejection', (e) => {
  const errorMsg = `[Promise Rejection] ${e.reason}`;
  console.error(errorMsg);
  const chatMessages = document.getElementById('chat-messages');
  if (chatMessages) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble system';
    bubble.style.color = '#ff6b6b';
    bubble.style.fontWeight = 'bold';
    bubble.textContent = errorMsg;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  let errDiv = document.getElementById('debug-error-bar');
  if (!errDiv) {
    errDiv = document.createElement('div');
    errDiv.id = 'debug-error-bar';
    errDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#e74c3c;color:#fff;padding:8px;z-index:999999;font-size:12px;font-family:monospace;word-break:break-all;';
    document.body.appendChild(errDiv);
  }
  errDiv.textContent = errorMsg;
});


function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debugLog(msg) {
  console.log(msg);
}


const socket = io({
  reconnection:      true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  reconnectionAttempts: Infinity
});
window.socket = socket;


let _reconnecting = false;
let _reconnectToast = null;

socket.on('disconnect', (reason) => {
  
  if (reason === 'io server disconnect' || reason === 'transport close' && !roomId) {
    _goToLobbyOnDisconnect();
    return;
  }
  
  if (roomId && !_reconnecting) {
    _reconnecting = true;
    _showReconnectingBanner();
  }
});

socket.on('connect', () => {
  if (_reconnecting && roomId) {
    
    socket.emit('join-room', { roomId, user: username, avatar: avatarData || selectedAvatarId });
    _reconnecting = false;
    _hideReconnectingBanner();
  }
});

socket.on('connect_error', () => {
  if (roomId && !_reconnecting) {
    _reconnecting = true;
    _showReconnectingBanner();
  }
});

function resetScrollPosition() {
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  const gridArea = document.querySelector('.grid-content-area');
  if (gridArea) gridArea.scrollTop = 0;
}

function _goToLobbyOnDisconnect() {
  _reconnecting = false;
  _hideReconnectingBanner();
  username = '';
  roomId   = '';
  currentVideo = null;
  hasUserActivated = false;
  resetScrollPosition();
  if (roomScreen)      roomScreen.classList.remove('active');
  if (lobbyScreen)     lobbyScreen.classList.add('active');
  if (roomNameDisplay) roomNameDisplay.textContent = '...';
  if (usersCountVal)   usersCountVal.textContent = '0';
  if (usersListDropdown) usersListDropdown.innerHTML = '';
  if (chatMessages)    chatMessages.innerHTML = '';
  alert('Соединение потеряно. Вы возвращены в лобби 🚪');
}

function _showReconnectingBanner() {
  if (_reconnectToast) return;
  _reconnectToast = document.createElement('div');
  _reconnectToast.id = 'reconnect-toast';
  _reconnectToast.style.cssText = [
    'position:fixed', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
    'background:rgba(15,23,42,0.95)', 'border:1px solid rgba(245,158,11,0.4)',
    'color:#f59e0b', 'padding:10px 20px', 'border-radius:12px', 'font-size:0.9rem',
    'font-weight:600', 'z-index:9999', 'backdrop-filter:blur(10px)',
    'box-shadow:0 8px 32px rgba(0,0,0,0.5)', 'display:flex', 'align-items:center', 'gap:8px'
  ].join(';');
  _reconnectToast.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i> Переподключение...';
  document.body.appendChild(_reconnectToast);
}

function _hideReconnectingBanner() {
  if (_reconnectToast) { _reconnectToast.remove(); _reconnectToast = null; }
}


var username = '';
let roomId = '';
let isApplyingRemoteAction = false;
let remoteActionTimeout = null;
let lastSeekTargetTime = null;
let isWaitingForSeekAlignment = false;
let seekStartTime = 0;
let currentVideo = null; 
let isYTApiReady = false;
let isDraggingTimeline = false;
let hasUserActivated = false; 

function updateVideoTitleDisplay(title) {
  const titleEl = document.getElementById('player-video-title');
  if (titleEl) {
    titleEl.textContent = title || 'Видео';
  }
}

function disableYTSubtitles() {
  try {
    if (ytPlayer) {
      if (typeof ytPlayer.unloadModule === 'function') {
        ytPlayer.unloadModule('captions');
        ytPlayer.unloadModule('cc');
      }
      if (typeof ytPlayer.setOption === 'function') {
        ytPlayer.setOption('captions', 'track', {});
        ytPlayer.setOption('captions', 'displaySettings', {
          "backgroundOpacity": 0,
          "charOpacity": 0,
          "windowOpacity": 0
        });
      }
    }
  } catch (e) {
    console.warn("Could not disable YT subtitles", e);
  }
}


document.addEventListener('click', () => {
  
  if (roomScreen && roomScreen.classList.contains('active')) {
    hasUserActivated = true;
  }
}, { capture: true, passive: true });


if (window.YT && window.YT.Player) {
  isYTApiReady = true;
} else {
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }
}


window.onYouTubeIframeAPIReady = () => {
  isYTApiReady = true;
  console.log("YouTube API is ready");
  if (currentVideo && currentVideo.type === 'youtube' && playerManager.activeType === 'youtube') {
    playerManager.initYouTube(currentVideo.id);
  }
};


let lastObservedTime = 0;
let lastObservedAt = Date.now();


let ytPlayer = null;

let vkPlayer = null;

let rutubePlayer = {
  iframe: null,
  videoId: null,
  isReady: false,
  shouldPlayOnReady: false,
  isPlaying: false,
  state: 'unstarted',
  currentTime: 0,
  duration: 0,
  lastTimeUpdate: 0,
  muted: false,
  post(type, data = {}) {
    if (this.iframe && this.iframe.contentWindow) {
      try {
        const payload = { type, data: { ...data } };
        if (this.videoId && !payload.data.videoId) {
          payload.data.videoId = this.videoId;
        }
        this.iframe.contentWindow.postMessage(JSON.stringify(payload), '*');
      } catch (e) {
        console.warn('rutube postMessage error:', e);
      }
    }
  },
  play() {
    this.shouldPlayOnReady = true;
    this.isPlaying = true;
    this.post('player:play');
  },
  pause() {
    this.shouldPlayOnReady = false;
    this.isPlaying = false;
    this.post('player:pause');
  },
  seek(time) {
    this.currentTime = time;
    this.lastTimeUpdate = Date.now();
    this.post('player:setCurrentTime', { time: Math.max(0, time) });
  }
};

window.addEventListener('message', (event) => {
  let message;
  try {
    message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch (e) {
    return;
  }
  if (!message || !message.type) return;

  if (typeof playerManager !== 'undefined' && playerManager.activeType === 'rutube') {
    if (message.type === 'player:ready') {
      debugLog('Rutube player ready');
      rutubePlayer.isReady = true;
      if (!isMobile() || hasUserActivated) {
        rutubePlayer.post('player:unMute');
        rutubePlayer.post('player:setVolume', { volume: 1 });
      }
      if (rutubePlayer.shouldPlayOnReady) {
        rutubePlayer.post('player:play');
      }
    } else if (message.type === 'player:changeState') {
      const data = message.data || {};
      const state = String(data.state || data.status || '');
      const isPlaying = typeof data.isPlaying === 'boolean' ? data.isPlaying : (state === 'playing');
      debugLog('Rutube changeState: ' + state + ', isPlaying: ' + isPlaying);
      if (rutubePlayer) {
        rutubePlayer.state = state;
        rutubePlayer.isPlaying = isPlaying;
      }
      if (state === 'playing' || (isPlaying && state !== 'buffering' && state !== 'seeking' && state !== 'loading')) {
        onLocalPlay();
      } else if (state === 'pause' || state === 'paused' || state === 'stopped') {
        onLocalPause();
      }
    } else if (message.type === 'player:playStart') {
      debugLog('Rutube playStart');
      if (rutubePlayer) {
        rutubePlayer.isPlaying = true;
        rutubePlayer.state = 'playing';
      }
      onLocalPlay();
    } else if (message.type === 'player:currentTime') {
      if (message.data) {
        if (typeof message.data.time === 'number') {
          rutubePlayer.currentTime = message.data.time;
          rutubePlayer.lastTimeUpdate = Date.now();
        }
        if (typeof message.data.duration === 'number' && message.data.duration > 0) {
          rutubePlayer.duration = message.data.duration;
        }
      }
    } else if (message.type === 'player:durationChange') {
      if (message.data && typeof message.data.duration === 'number') {
        rutubePlayer.duration = message.data.duration;
      }
    }
  }
});


let ignoreNextPlay = false;
let ignoreNextPause = false;
let ignorePlayTimeout = null;
let ignorePauseTimeout = null;

function setIgnoreNextPlay() {
  ignoreNextPlay = true;
  if (ignorePlayTimeout) clearTimeout(ignorePlayTimeout);
  ignorePlayTimeout = setTimeout(() => {
    ignoreNextPlay = false;
  }, 1500);
}

function setIgnoreNextPause() {
  ignoreNextPause = true;
  if (ignorePauseTimeout) clearTimeout(ignorePauseTimeout);
  ignorePauseTimeout = setTimeout(() => {
    ignoreNextPause = false;
  }, 1500);
}


const html5Player = document.getElementById('html5-player');


const lobbyScreen = document.getElementById('lobby-screen');
const roomScreen = document.getElementById('room-screen');
const lobbyForm = document.getElementById('lobby-form');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const btnRandomRoom = document.getElementById('btn-random-room');
const roomNameDisplay = document.getElementById('room-name-display');
const btnCopyLink = document.getElementById('btn-copy-link');
const btnRoomLogoHome = document.getElementById('btn-room-logo-home');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const usersCountVal = document.getElementById('users-count-val');
const usersCount = document.getElementById('users-count');
const usersListDropdown = document.getElementById('users-list-dropdown');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const videoLinkForm = document.getElementById('video-link-form');
const videoUrlInput = document.getElementById('video-url-input');
const vkSearchInput = document.getElementById('vk-search-input');
const btnVkSearch = document.getElementById('btn-vk-search');
const searchResultsContainer = document.getElementById('search-results-container');
const btnResync = document.getElementById('btn-resync');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const btnTriggerAddVideo = document.getElementById('btn-trigger-add-video');
const tabAddVideoBtn = document.getElementById('tab-add-video-btn');
const autoplayOverlay = document.getElementById('autoplay-overlay');
const btnAutoplaySync = document.getElementById('btn-autoplay-sync');
const linkSetupToken = document.getElementById('link-setup-token');
const tokenModal = document.getElementById('token-modal');
const btnCloseModal = document.getElementById('btn-close-modal');


if (window.location.hash) {
  roomInput.value = window.location.hash.substring(1);
}


btnRandomRoom.addEventListener('click', () => {
  const words = ['kino', 'film', 'love', 'date', 'watch', 'wave', 'stream', 'sweet', 'chill', 'popcorn'];
  const num = Math.floor(Math.random() * 9000) + 1000;
  const word1 = words[Math.floor(Math.random() * words.length)];
  const word2 = words[Math.floor(Math.random() * words.length)];
  roomInput.value = `${word1}-${word2}-${num}`;
});


const PROFILE_KEY = 'wave_profile_v1';

function saveProfile() {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      username: username,
      avatarData: avatarData
    }));
  } catch(e) {}
}

function loadSavedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

let pendingInitialVideo = null;
let selectedVideoForModal = null;

const ALL_CURATED_VIDEOS = [
  {
    type: 'youtube',
    id: 'P1_TGLibPR0',
    url: 'https://www.youtube.com/watch?v=P1_TGLibPR0',
    title: 'ПЫТАЕМСЯ ИГРАТЬ В Paralives С БРАЙНОМ (сломали игру)',
    channelName: 'Anastasiz',
    channelAvatar: '/assets/avatars/P1_TGLibPR0.svg',
    thumb: '/assets/thumbnails/P1_TGLibPR0.jpg',
    duration: '14:32',
    views: '9.4 млн просмотров',
    date: '8 месяцев назад'
  },
  {
    type: 'youtube',
    id: 'bg-Y0I8rRFc',
    url: 'https://www.youtube.com/watch?v=bg-Y0I8rRFc',
    title: 'ФИНАЛ ► Cheap Car Repair #5',
    channelName: 'Kuplinov ► Play',
    channelAvatar: '/assets/avatars/bg-Y0I8rRFc.svg',
    thumb: '/assets/thumbnails/bg-Y0I8rRFc.jpg',
    duration: '38:14',
    views: '2.1 млн просмотров',
    date: '3 недели назад'
  },
  {
    type: 'youtube',
    id: 'ovIxZKkdqSY',
    url: 'https://www.youtube.com/watch?v=ovIxZKkdqSY',
    title: 'ТЫ ЗАПЛАЧЕШЬ ОТ ЭТОГО ФНАФА',
    channelName: 'windy31',
    channelAvatar: '/assets/avatars/ovIxZKkdqSY.svg',
    thumb: '/assets/thumbnails/ovIxZKkdqSY.jpg',
    duration: '25:08',
    views: '3.7 млн просмотров',
    date: '5 месяцев назад'
  },
  {
    type: 'youtube',
    id: 'WZmyc5iLCtY',
    url: 'https://www.youtube.com/watch?v=WZmyc5iLCtY',
    title: 'Ночь на Заброшке Японской Секты! Сталкеры с Utopia Show, Масленников, Чернец, Даник',
    channelName: 'Дима Масленников',
    channelAvatar: '/assets/avatars/WZmyc5iLCtY.svg',
    thumb: '/assets/thumbnails/WZmyc5iLCtY.jpg',
    duration: '48:20',
    views: '5.2 млн просмотров',
    date: '2 месяца назад'
  },
  {
    type: 'youtube',
    id: 'JrGvbX5vV9c',
    url: 'https://www.youtube.com/watch?v=JrGvbX5vV9c',
    title: 'iPhone 17 Pro за 46750 рублей из ОАЭ',
    channelName: 'Wylsacom',
    channelAvatar: '/assets/avatars/JrGvbX5vV9c.svg',
    thumb: '/assets/thumbnails/JrGvbX5vV9c.jpg',
    duration: '22:55',
    views: '1.9 млн просмотров',
    date: '4 месяца назад'
  },
  {
    type: 'youtube',
    id: 'XEZPStdB78s',
    url: 'https://www.youtube.com/watch?v=XEZPStdB78s',
    title: 'Теперь городом правит пёс 👑 (ИИ в Скайриме)',
    channelName: 'Marmok',
    channelAvatar: '/assets/avatars/XEZPStdB78s.svg',
    thumb: '/assets/thumbnails/XEZPStdB78s.jpg',
    duration: '44:20',
    views: '4.8 млн просмотров',
    date: '1 год назад'
  },
  {
    type: 'youtube',
    id: 'UfCL9xrZRS8',
    url: 'https://www.youtube.com/watch?v=UfCL9xrZRS8',
    title: 'ДИПИНС ПРОВЕРИЛ САМЫЕ СТРАШНЫЕ САЙТЫ В МИРЕ / АЙСБЕРГ САЙТОВ',
    channelName: 'DEEPINS STREAM',
    channelAvatar: '/assets/avatars/UfCL9xrZRS8.svg',
    thumb: '/assets/thumbnails/UfCL9xrZRS8.jpg',
    duration: '18:03',
    views: '7.1 млн просмотров',
    date: '6 месяцев назад'
  },
  {
    type: 'youtube',
    id: 'ngNl_XaIOs8',
    url: 'https://www.youtube.com/watch?v=ngNl_XaIOs8',
    title: 'Toxi$ — о меме «возьми телефон», расставании с Генсухой и пересадке волос [ft. OG Buda]',
    channelName: 'ВПИСКА',
    channelAvatar: '/assets/avatars/ngNl_XaIOs8.svg',
    thumb: '/assets/thumbnails/ngNl_XaIOs8.jpg',
    duration: '31:44',
    views: '6.3 млн просмотров',
    date: '10 месяцев назад'
  }
];

function renderLobbyVideoGrid() {
  const container = document.getElementById('video-grid');
  if (!container) return;
  container.innerHTML = '';

  
  const pool = [...ALL_CURATED_VIDEOS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  
  const selected8 = pool.slice(0, 8);

  selected8.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'video-card';
    const isYt = item.type === 'youtube';
    const isRutube = item.type === 'rutube';
    const pClass = isYt ? 'youtube' : (isRutube ? 'rutube' : 'vk');
    const pIcon = isYt ? 'fa-brands fa-youtube' : 'fa-solid fa-play';
    const pLabel = isYt ? 'YouTube' : (isRutube ? 'Rutube' : 'VK Видео');

    const thumbFallback = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MDAiIGhlaWdodD0iMzM3IiB2aWV3Qm94PSIwIDAgNjAwIDMzNyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFlMWIyZSIvPjxjaXJjbGUgY3g9IjMwMCIgY3k9IjE2OCIgcj0iNDAiIGZpbGw9IiM4YjVjZjYiIG9wYWNpdHk9IjAuOCIvPjxwb2x5Z29uIHBvaW50cz0iMjg4LDE0OCAzMjQsMTY4IDI4OCwxODgiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4=";
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];
    const colorIndex = (item.channelName.charCodeAt(0) || 0) % colors.length;
    const bg = colors[colorIndex];
    const avatarSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${bg}"/><text x="50" y="65" font-family="sans-serif" font-size="44" font-weight="bold" fill="#ffffff" text-anchor="middle">${item.channelName.charAt(0).toUpperCase()}</text></svg>`;
    const avatarFallback = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(avatarSvg)))}`;

    card.innerHTML = `
      <div class="video-thumb-wrap">
        <img class="video-thumb" src="${item.thumb}" alt="" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${thumbFallback}';">
        <span class="duration-pill">${item.duration}</span>
        <span class="platform-badge ${pClass}">
          <i class="${pIcon}"></i>
          ${pLabel}
        </span>
      </div>
      <div class="video-card-body">
        <img class="channel-avatar" src="${item.channelAvatar}" alt="" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${avatarFallback}';">
        <div class="video-card-info">
          <div class="video-title">${item.title}</div>
          <div class="channel-name">${item.channelName}</div>
          <div class="video-meta">${item.views} • ${item.date}</div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      
      openCreateVideoModal(item);
    });

    container.appendChild(card);
  });
}

function openCreateVideoModal(videoItem) {
  selectedVideoForModal = videoItem;
  const modal = document.getElementById('create-with-video-modal');
  const thumb = document.getElementById('modal-video-thumb');
  const title = document.getElementById('modal-video-title');
  const badge = document.getElementById('modal-video-badge');
  const input = document.getElementById('create-video-room-input');

  if (thumb) thumb.src = videoItem.thumb;
  if (title) title.textContent = videoItem.title;
  if (badge) {
    const isYt = videoItem.type === 'youtube';
    const isRutube = videoItem.type === 'rutube';
    const pClass = isYt ? 'youtube' : (isRutube ? 'rutube' : 'vk');
    const pIcon = isYt ? 'fa-brands fa-youtube' : 'fa-solid fa-play';
    const pLabel = isYt ? 'YouTube' : (isRutube ? 'Rutube' : 'VK Видео');
    badge.className = `platform-badge ${pClass}`;
    badge.innerHTML = `<i class="${pIcon}"></i> ${pLabel}`;
  }

  
  const generatedCode = 'room-' + Math.floor(100 + Math.random() * 900);
  if (input) input.value = generatedCode;

  if (modal) modal.style.display = 'flex';
}

function updateProfileBar() {
  const nameLabel = document.getElementById('saved-profile-name-label');
  const thumb = document.getElementById('saved-profile-avatar-thumb');
  if (nameLabel) nameLabel.textContent = username;
  if (thumb && username) {
    if (avatarData) {
      const img = document.createElement('img');
      img.src = avatarData;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
      thumb.innerHTML = '';
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;color:#fff;background:linear-gradient(135deg,#8b5cf6,#ec4899)">${username.charAt(0).toUpperCase()}</div>`;
    }
  }
}

function switchToGridHub() {
  const lobbyScreen = document.getElementById('lobby-screen');
  const wizardCard = document.getElementById('lobby-wizard-card');
  const gridHub = document.getElementById('lobby-grid-hub');

  updateProfileBar();

  if (lobbyScreen) lobbyScreen.classList.add('grid-mode');
  if (wizardCard) wizardCard.style.display = 'none';
  if (gridHub) gridHub.style.display = 'flex';

  renderLobbyVideoGrid();
}

function clearProfile() {
  localStorage.removeItem(PROFILE_KEY);
  username = '';
  avatarData = null;
  selectedAvatarId = 'avatar-1';
  usernameInput.value = '';

  const previewImg = document.getElementById('avatar-preview-img');
  if (previewImg) {
    previewImg.src = '';
    previewImg.style.display = 'none';
  }
  document.getElementById('avatar-letter-canvas').style.display = 'none';
  document.getElementById('avatar-upload-circle').classList.remove('has-image');
  document.getElementById('btn-remove-avatar').style.display = 'none';

  const lobbyScreen = document.getElementById('lobby-screen');
  const wizardCard = document.getElementById('lobby-wizard-card');
  const gridHub = document.getElementById('lobby-grid-hub');

  if (lobbyScreen) lobbyScreen.classList.remove('grid-mode');
  if (wizardCard) wizardCard.style.display = 'block';
  if (gridHub) gridHub.style.display = 'none';

  document.querySelectorAll('.wizard-stage').forEach(s => s.classList.remove('active'));
  document.getElementById('stage-nickname').classList.add('active');
}

function applyProfile(profile) {
  username = profile.username;
  avatarData = profile.avatarData;
  selectedAvatarId = avatarData || selectedAvatarId;
  usernameInput.value = username;

  const thumb = document.getElementById('saved-profile-avatar-thumb');
  if (thumb) {
    if (avatarData) {
      const img = document.createElement('img');
      img.src = avatarData;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
      thumb.innerHTML = '';
      thumb.appendChild(img);

      const previewImg = document.getElementById('avatar-preview-img');
      if (previewImg) {
        previewImg.src = avatarData;
        previewImg.style.display = 'block';
      }
      document.getElementById('avatar-upload-circle').classList.add('has-image');
      document.getElementById('btn-remove-avatar').style.display = 'flex';
    } else {
      thumb.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;color:#fff;background:linear-gradient(135deg,#8b5cf6,#ec4899)">${username.charAt(0).toUpperCase()}</div>`;
    }
  }
  document.getElementById('saved-profile-name-label').textContent = username;
  switchToGridHub();
}


function submitLobby() {
  username = usernameInput.value.trim() || username;
  roomId = roomInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

  if (!username || !roomId) {
    alert('Пожалуйста, введите ваше имя и ID комнаты!');
    return;
  }

  
  saveProfile();

  
  window.location.hash = roomId;

  
  resetScrollPosition();
  lobbyScreen.classList.remove('active');
  roomScreen.classList.add('active');
  roomNameDisplay.textContent = roomId;

  
  socket.emit('join-room', { roomId, user: username, avatar: avatarData || selectedAvatarId });

  
  if (pendingInitialVideo) {
    setTimeout(() => {
      socket.emit('video-change', pendingInitialVideo);
      pendingInitialVideo = null;
    }, 300);
  }
}

let selectedAvatarId = 'avatar-1';
let avatarData = null;

function initAvatarPicker() {
  const uploadCircle = document.getElementById('avatar-upload-circle');
  const fileInput    = document.getElementById('avatar-file-input');
  const previewImg   = document.getElementById('avatar-preview-img');
  const removeBtn    = document.getElementById('btn-remove-avatar');

  
  uploadCircle.addEventListener('contextmenu', e => e.preventDefault());

  
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => openCropModal(e.target.result);
    reader.readAsDataURL(file);
    
    fileInput.value = '';
  });

  
  removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    previewImg.src = '';
    previewImg.style.display = 'none';
    avatarData = null;
    uploadCircle.classList.remove('has-image');
    removeBtn.style.display = 'none';
  });
}


let cropImg = new Image();
let cropScale = 1, cropMinScale = 1;
let cropOffX = 0, cropOffY = 0;
let cropDragging = false, cropLastX = 0, cropLastY = 0;
let cropLastPinchDist = 0;

const CROP_SIZE = 320;   
const CROP_R   = 130;   

function openCropModal(dataUrl) {
  const modal = document.getElementById('avatar-crop-modal');
  modal.style.display = 'flex';

  cropImg = new Image();
  cropImg.onload = () => {
    
    cropMinScale = Math.max(
      (CROP_R * 2) / cropImg.width,
      (CROP_R * 2) / cropImg.height
    );
    cropScale = cropMinScale;
    cropOffX = 0;
    cropOffY = 0;
    const slider = document.getElementById('crop-zoom-slider');
    slider.min   = cropMinScale;
    slider.max   = cropMinScale * 5;
    slider.step  = cropMinScale * 0.05;
    slider.value = cropScale;
    drawCropCanvas();
  };
  cropImg.src = dataUrl;
}

function drawCropCanvas() {
  const canvas = document.getElementById('avatar-crop-canvas');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;

  ctx.clearRect(0, 0, W, H);

  
  const iw = cropImg.width  * cropScale;
  const ih = cropImg.height * cropScale;
  const ix = cx + cropOffX - iw / 2;
  const iy = cy + cropOffY - ih / 2;

  ctx.globalAlpha = 0.45;
  ctx.drawImage(cropImg, ix, iy, iw, ih);
  ctx.globalAlpha = 1;

  
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);

  
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, CROP_R, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(cropImg, ix, iy, iw, ih);
  ctx.restore();

  
  ctx.beginPath();
  ctx.arc(cx, cy, CROP_R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function clampCrop() {
  const cx = CROP_SIZE / 2, cy = CROP_SIZE / 2;
  const iw = cropImg.width  * cropScale;
  const ih = cropImg.height * cropScale;
  
  const maxX = iw / 2 - CROP_R;
  const maxY = ih / 2 - CROP_R;
  cropOffX = Math.max(-maxX, Math.min(maxX, cropOffX));
  cropOffY = Math.max(-maxY, Math.min(maxY, cropOffY));
}

function initCropModal() {
  const modal  = document.getElementById('avatar-crop-modal');
  const canvas = document.getElementById('avatar-crop-canvas');
  const slider = document.getElementById('crop-zoom-slider');

  
  slider.addEventListener('input', () => {
    cropScale = parseFloat(slider.value);
    clampCrop();
    drawCropCanvas();
  });

  document.getElementById('btn-crop-zoom-in').addEventListener('click', () => {
    cropScale = Math.min(parseFloat(slider.max), cropScale + parseFloat(slider.step) * 4);
    slider.value = cropScale;
    clampCrop(); drawCropCanvas();
  });
  document.getElementById('btn-crop-zoom-out').addEventListener('click', () => {
    cropScale = Math.max(parseFloat(slider.min), cropScale - parseFloat(slider.step) * 4);
    slider.value = cropScale;
    clampCrop(); drawCropCanvas();
  });

  
  canvas.addEventListener('mousedown', e => {
    cropDragging = true;
    cropLastX = e.clientX; cropLastY = e.clientY;
  });
  window.addEventListener('mousemove', e => {
    if (!cropDragging) return;
    cropOffX += e.clientX - cropLastX;
    cropOffY += e.clientY - cropLastY;
    cropLastX = e.clientX; cropLastY = e.clientY;
    clampCrop(); drawCropCanvas();
  });
  window.addEventListener('mouseup', () => { cropDragging = false; });

  
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    cropScale = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), cropScale + delta * cropScale));
    slider.value = cropScale;
    clampCrop(); drawCropCanvas();
  }, { passive: false });

  
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) {
      cropDragging = true;
      cropLastX = e.touches[0].clientX;
      cropLastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      cropDragging = false;
      cropLastPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && cropDragging) {
      cropOffX += e.touches[0].clientX - cropLastX;
      cropOffY += e.touches[0].clientY - cropLastY;
      cropLastX = e.touches[0].clientX;
      cropLastY = e.touches[0].clientY;
      clampCrop(); drawCropCanvas();
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (cropLastPinchDist > 0) {
        const ratio = dist / cropLastPinchDist;
        cropScale = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), cropScale * ratio));
        slider.value = cropScale;
        clampCrop(); drawCropCanvas();
      }
      cropLastPinchDist = dist;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    cropDragging = false;
    cropLastPinchDist = 0;
  });

  
  document.getElementById('btn-crop-save').addEventListener('click', () => {
    const out = document.createElement('canvas');
    out.width = 256; out.height = 256;
    const ctx = out.getContext('2d');

    
    const cx = CROP_SIZE / 2, cy = CROP_SIZE / 2;
    const iw = cropImg.width  * cropScale;
    const ih = cropImg.height * cropScale;
    const ix = cx + cropOffX - iw / 2;
    const iy = cy + cropOffY - ih / 2;

    
    const srcX = ((cx - CROP_R) - ix) / cropScale;
    const srcY = ((cy - CROP_R) - iy) / cropScale;
    const srcS = (CROP_R * 2) / cropScale;

    
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(cropImg, srcX, srcY, srcS, srcS, 0, 0, 256, 256);

    const dataUrl = out.toDataURL('image/jpeg', 0.92);

    
    const previewImg  = document.getElementById('avatar-preview-img');
    const uploadCircle = document.getElementById('avatar-upload-circle');
    const removeBtn   = document.getElementById('btn-remove-avatar');
    previewImg.src = dataUrl;
    previewImg.style.display = 'block';
    document.getElementById('avatar-letter-canvas').style.display = 'none';
    uploadCircle.classList.add('has-image');
    removeBtn.style.display = 'flex';
    avatarData = dataUrl;

    modal.style.display = 'none';
  });

  
  document.getElementById('btn-crop-cancel').addEventListener('click', () => {
    modal.style.display = 'none';
  });
}


function generateLetterAvatar(name) {
  const canvas = document.getElementById('avatar-letter-canvas');
  const ctx = canvas.getContext('2d');
  const colors = ['#ff6b6b', '#feca57', '#1dd1a1', '#54a0ff', '#5f27cd'];
  const bg = colors[Math.floor(Math.random() * colors.length)];
  const letter = name.charAt(0).toUpperCase();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = '70px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, canvas.width / 2, canvas.height / 2);
  canvas.style.display = 'block';
  document.getElementById('avatar-preview-img').style.display = 'none';
  document.getElementById('avatar-upload-circle').classList.remove('has-image');
  avatarData = canvas.toDataURL();
}

const btnWizardNext1 = document.getElementById('btn-wizard-next-1');
if (btnWizardNext1) {
  btnWizardNext1.addEventListener('click', (e) => {
    if (e) e.preventDefault();
    const nick = usernameInput ? usernameInput.value.trim() : '';
    if (!nick) {
      alert('Пожалуйста, введите ваше имя!');
      return;
    }
    username = nick;
    try {
      if (!avatarData) {
        generateLetterAvatar(username);
      }
    } catch(err) {
      console.warn('Avatar gen error', err);
    }
    selectedAvatarId = avatarData || selectedAvatarId;
    saveProfile();
    switchToGridHub();
  });
}

document.getElementById('btn-wizard-back-2').onclick = () => {
  document.getElementById('stage-avatar').classList.remove('active');
  document.getElementById('stage-nickname').classList.add('active');
};

document.getElementById('btn-wizard-next-2').onclick = () => {
  if (!avatarData) {
    generateLetterAvatar(username);
  }
  selectedAvatarId = avatarData || selectedAvatarId;
  saveProfile();
  switchToGridHub();
};

document.getElementById('btn-wizard-submit').onclick = () => {
  const modal = document.getElementById('join-room-modal');
  if (modal) modal.style.display = 'none';
  submitLobby();
};


const btnQuickCreate = document.getElementById('btn-quick-create');
const createRoomModal = document.getElementById('create-room-modal');
const btnCloseCreateRoomModal = document.getElementById('btn-close-create-room-modal');
const btnRandomCreateRoom = document.getElementById('btn-random-create-room');
const btnSubmitCreateRoom = document.getElementById('btn-submit-create-room');
const createRoomCodeInput = document.getElementById('create-room-code-input');

if (btnQuickCreate && createRoomModal) {
  btnQuickCreate.onclick = () => {
    if (createRoomCodeInput) {
      createRoomCodeInput.value = 'wave-' + Math.floor(1000 + Math.random() * 9000);
    }
    createRoomModal.style.display = 'flex';
  };
}

if (btnCloseCreateRoomModal && createRoomModal) {
  btnCloseCreateRoomModal.onclick = () => {
    createRoomModal.style.display = 'none';
  };
}

if (createRoomModal) {
  createRoomModal.addEventListener('click', (e) => {
    if (e.target === createRoomModal) {
      createRoomModal.style.display = 'none';
    }
  });
}

if (btnRandomCreateRoom && createRoomCodeInput) {
  btnRandomCreateRoom.onclick = () => {
    createRoomCodeInput.value = 'wave-' + Math.floor(1000 + Math.random() * 9000);
  };
}

function submitCreateRoom() {
  if (!createRoomCodeInput) return;
  const roomCode = createRoomCodeInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!roomCode) {
    alert('Пожалуйста, введите код комнаты!');
    return;
  }
  roomInput.value = roomCode;
  if (createRoomModal) createRoomModal.style.display = 'none';
  submitLobby();
}

if (btnSubmitCreateRoom) {
  btnSubmitCreateRoom.onclick = submitCreateRoom;
}

if (createRoomCodeInput) {
  createRoomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCreateRoom();
    }
  });
}


const btnOpenJoinModal = document.getElementById('btn-open-join-modal');
const joinModal = document.getElementById('join-room-modal');
const btnCloseJoinModal = document.getElementById('btn-close-join-modal');

if (btnOpenJoinModal && joinModal) {
  btnOpenJoinModal.onclick = () => {
    joinModal.style.display = 'flex';
  };
}

if (btnCloseJoinModal && joinModal) {
  btnCloseJoinModal.onclick = () => {
    joinModal.style.display = 'none';
  };
}


if (joinModal) {
  joinModal.addEventListener('click', (e) => {
    if (e.target === joinModal) {
      joinModal.style.display = 'none';
    }
  });
}


const createVideoModal = document.getElementById('create-with-video-modal');
const btnCloseCreateVideoModal = document.getElementById('btn-close-create-video-modal');
const btnRandomCreateVideoRoom = document.getElementById('btn-random-create-video-room');
const btnSubmitCreateVideoRoom = document.getElementById('btn-submit-create-video-room');
const createVideoRoomInput = document.getElementById('create-video-room-input');

if (btnCloseCreateVideoModal && createVideoModal) {
  btnCloseCreateVideoModal.onclick = () => {
    createVideoModal.style.display = 'none';
  };
}

if (createVideoModal) {
  createVideoModal.addEventListener('click', (e) => {
    if (e.target === createVideoModal) {
      createVideoModal.style.display = 'none';
    }
  });
}

if (btnRandomCreateVideoRoom && createVideoRoomInput) {
  btnRandomCreateVideoRoom.onclick = () => {
    createVideoRoomInput.value = 'room-' + Math.floor(100 + Math.random() * 900);
  };
}

function submitCreateWithVideoRoom() {
  if (!createVideoRoomInput) return;
  const roomCode = createVideoRoomInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!roomCode) {
    alert('Пожалуйста, введите код комнаты!');
    return;
  }
  roomInput.value = roomCode;
  pendingInitialVideo = selectedVideoForModal;
  if (createVideoModal) createVideoModal.style.display = 'none';
  submitLobby();
}

if (btnSubmitCreateVideoRoom) {
  btnSubmitCreateVideoRoom.onclick = submitCreateWithVideoRoom;
}

if (createVideoRoomInput) {
  createVideoRoomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCreateWithVideoRoom();
    }
  });
}


usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-wizard-next-1').click();
  }
});

roomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitLobby();
  }
});


btnCopyLink.addEventListener('click', () => {
  const inviteUrl = `${window.location.origin}/#${roomId}`;
  navigator.clipboard.writeText(inviteUrl).then(() => {
    btnCopyLink.innerHTML = `<i class="fa-solid fa-check"></i> Скопировано!`;
    setTimeout(() => {
      btnCopyLink.innerHTML = `<i class="fa-solid fa-share-nodes"></i> Поделиться`;
    }, 2000);
  }).catch(err => {
    console.error('Could not copy text: ', err);
  });
});


if (btnRoomLogoHome) {
  btnRoomLogoHome.addEventListener('click', () => {
    leaveRoom();
  });
}

if (btnToggleSidebar) {
  btnToggleSidebar.addEventListener('click', () => {
    roomScreen.classList.toggle('sidebar-collapsed');
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 320);
  });
}

function leaveRoom() {
  if (!roomId) return;
  socket.emit('leave-room');
  roomId = '';
  history.pushState("", document.title, window.location.pathname + window.location.search);
  try { playerManager.destroy(); } catch (e) {}
  resetScrollPosition();
  roomScreen.classList.remove('active');
  lobbyScreen.classList.add('active');
  roomNameDisplay.textContent = '...';
  usersCountVal.textContent = '0';
  usersListDropdown.innerHTML = '';
  chatMessages.innerHTML = '';
  switchToGridHub();
}

usersCount.addEventListener('click', (e) => {
  e.stopPropagation();
  usersListDropdown.classList.toggle('active');
});
document.addEventListener('click', () => {
  usersListDropdown.classList.remove('active');
});


document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

btnTriggerAddVideo.addEventListener('click', () => {
  tabAddVideoBtn.click();
});


linkSetupToken.addEventListener('click', (e) => {
  e.preventDefault();
  tokenModal.classList.add('active');
});
btnCloseModal.addEventListener('click', () => {
  tokenModal.classList.remove('active');
});
tokenModal.addEventListener('click', (e) => {
  if (e.target === tokenModal) {
    tokenModal.classList.remove('active');
  }
});


const PRESET_AVATARS = {
  'avatar-1': `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#ffedd5"/><path d="M30 40 L25 15 L45 30 Z" fill="#f97316"/><path d="M70 40 L75 15 L55 30 Z" fill="#f97316"/><circle cx="38" cy="45" r="5" fill="#0f172a"/><circle cx="62" cy="45" r="5" fill="#0f172a"/><path d="M46 54 L54 54 L50 58 Z" fill="#f43f5e"/><path d="M35 60 C40 65, 45 65, 50 60 C55 65, 60 65, 65 60" stroke="#0f172a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  'avatar-2': `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#e2e8f0"/><rect x="25" y="30" width="50" height="40" rx="10" fill="#64748b"/><rect x="32" y="38" width="36" height="24" rx="5" fill="#22d3ee"/><circle cx="43" cy="50" r="4" fill="#0f172a"/><circle cx="57" cy="50" r="4" fill="#0f172a"/><rect x="47" y="20" width="6" height="10" fill="#475569"/><circle cx="50" cy="18" r="5" fill="#fb7185"/></svg>`,
  'avatar-3': `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#dbeafe"/><circle cx="50" cy="50" r="35" fill="#f8fafc" stroke="#94a3b8" stroke-width="3"/><rect x="25" y="35" width="50" height="30" rx="15" fill="#818cf8"/><ellipse cx="50" cy="48" rx="20" ry="12" fill="#1e1b4b"/></svg>`,
  'avatar-4': `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#f1f5f9"/><circle cx="50" cy="50" r="45" fill="#0f172a"/><rect x="20" y="38" width="60" height="20" rx="10" fill="#1e293b"/><ellipse cx="38" cy="48" rx="6" ry="3" fill="#38bdf8"/><ellipse cx="62" cy="48" rx="6" ry="3" fill="#38bdf8"/></svg>`,
  'avatar-5': `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#f0fdf4"/><path d="M50 20 C25 20, 25 65, 50 80 C75 65, 75 20, 50 20 Z" fill="#4ade80"/><ellipse cx="38" cy="48" rx="8" ry="12" fill="#0f172a" transform="rotate(-15 38 48)"/><ellipse cx="62" cy="48" rx="8" ry="12" fill="#0f172a" transform="rotate(15 62 48)"/><path d="M45 65 C48 68, 52 68, 55 65" stroke="#0f172a" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="35" cy="20" r="4" fill="#22c55e"/><path d="M35 20 L42 30" stroke="#22c55e" stroke-width="3"/><circle cx="65" cy="20" r="4" fill="#22c55e"/><path d="M65 20 L58 30" stroke="#22c55e" stroke-width="3"/></svg>`,
  'avatar-6': `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#fff7ed"/><path d="M25 40 L15 15 L40 32 Z" fill="#ea580c"/><path d="M75 40 L85 15 L60 32 Z" fill="#ea580c"/><path d="M20 40 Q50 90 80 40 Z" fill="#f97316"/><path d="M20 40 Q50 90 50 90 Z" fill="#fff"/><path d="M80 40 Q50 90 50 90 Z" fill="#fff" transform="scale(-1, 1) translate(-100, 0)"/><circle cx="36" cy="45" r="5" fill="#0f172a"/><circle cx="64" cy="45" r="5" fill="#0f172a"/><circle cx="50" cy="68" r="6" fill="#0f172a"/></svg>`,
  'avatar-7': `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#fafafa"/><circle cx="28" cy="28" r="14" fill="#18181b"/><circle cx="72" cy="28" r="14" fill="#18181b"/><circle cx="50" cy="55" r="35" fill="#fff" stroke="#18181b" stroke-width="2"/><ellipse cx="38" cy="48" rx="8" ry="12" fill="#18181b" transform="rotate(-15 38 48)"/><ellipse cx="62" cy="48" rx="8" ry="12" fill="#18181b" transform="rotate(15 62 48)"/><circle cx="38" cy="46" r="3" fill="#fff"/><circle cx="62" cy="46" r="3" fill="#fff"/><ellipse cx="50" cy="62" rx="6" ry="4" fill="#18181b"/></svg>`,
  'avatar-8': `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#f3f4f6"/><circle cx="25" cy="35" r="16" fill="#9ca3af"/><circle cx="75" cy="35" r="16" fill="#9ca3af"/><circle cx="25" cy="35" r="10" fill="#e5e7eb"/><circle cx="75" cy="35" r="10" fill="#e5e7eb"/><circle cx="50" cy="56" r="32" fill="#d1d5db"/><circle cx="38" cy="48" r="4" fill="#111827"/><circle cx="62" cy="48" r="4" fill="#111827"/><ellipse cx="50" cy="58" rx="6" ry="10" fill="#1f2937"/></svg>`
};


function getAvatarHtml(avatar, className = '') {
  if (!avatar) {
    return PRESET_AVATARS['avatar-1'];
  }
  if (avatar.startsWith('data:') || avatar.startsWith('http') || avatar.length > 50) {
    return `<img src="${avatar}" class="${className}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;">`;
  }
  return PRESET_AVATARS[avatar] || PRESET_AVATARS['avatar-1'];
}


let replyingToMsg = null;


let _lastMsgAt = 0;
const CHAT_THROTTLE_MS = 500;


let lastTypingSent = 0;
let stopTypingTimeout = null;

chatInput.addEventListener('input', () => {
  if (chatInput.value.trim() === '') {
    if (stopTypingTimeout) clearTimeout(stopTypingTimeout);
    socket.emit('stop-typing');
    return;
  }
  const now = Date.now();
  if (now - lastTypingSent > 1500) {
    socket.emit('typing');
    lastTypingSent = now;
  }
  if (stopTypingTimeout) clearTimeout(stopTypingTimeout);
  stopTypingTimeout = setTimeout(() => {
    socket.emit('stop-typing');
  }, 2000);
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  const now = Date.now();
  if (now - _lastMsgAt < CHAT_THROTTLE_MS) return; 
  _lastMsgAt = now;

  if (stopTypingTimeout) clearTimeout(stopTypingTimeout);
  socket.emit('stop-typing');

  if (replyingToMsg) {
    socket.emit('chat-message', { text, replyTo: replyingToMsg });
    clearReplyState();
  } else {
    socket.emit('chat-message', text);
  }

  chatInput.value = '';
});


function appendMessage(msg) {
  const { id, username: msgUser, avatar: msgAvatar, text, system, timestamp, reactions, replyTo } = msg;
  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (system) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble system';
    bubble.textContent = `[${timeStr}] ${text}`;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return;
  }

  
  const wrapper = document.createElement('div');
  const isMine = msgUser === username;
  wrapper.className = `chat-message-wrapper ${isMine ? 'mine' : 'user'}`;
  if (id) {
    wrapper.id = `msg-wrapper-${id}`;
  }

  
  const avatarDiv = document.createElement('div');
  avatarDiv.className = 'chat-message-avatar';
  avatarDiv.innerHTML = getAvatarHtml(msgAvatar);
  wrapper.appendChild(avatarDiv);

  
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isMine ? 'mine' : 'user'}`;
  if (id) {
    bubble.id = `bubble-${id}`;
  }

  
  let lastTap = 0;
  const handleLike = () => {
    if (!id) return;
    socket.emit('message-reaction', { messageId: id, reactionType: 'heart' });
    showFloatingHeart(bubble);
  };

  bubble.addEventListener('touchstart', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (tapLength < 300 && tapLength > 0) {
      e.preventDefault();
      handleLike();
    }
    lastTap = currentTime;
  });

  bubble.addEventListener('dblclick', (e) => {
    e.preventDefault();
    handleLike();
  });

  
  let pressTimer;
  const showMenu = (clientX, clientY) => {
    if (!id) return;
    openContextMenu(id, msgUser, text, clientX, clientY);
  };

  bubble.addEventListener('touchstart', (e) => {
    
    e.preventDefault();
    pressTimer = setTimeout(() => {
      const touch = e.touches[0] || e.changedTouches[0];
      showMenu(touch.clientX, touch.clientY);
    }, 500);
  }, { passive: false });
  bubble.addEventListener('touchend', () => clearTimeout(pressTimer));
  bubble.addEventListener('touchmove', () => clearTimeout(pressTimer));

  bubble.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY);
  });

  
  if (replyTo) {
    const replyDiv = document.createElement('div');
    replyDiv.className = 'bubble-reply';
    
    replyDiv.innerHTML = `
      <div class="bubble-reply-user">${escHtml(replyTo.username)}</div>
      <div class="bubble-reply-text">${escHtml(replyTo.text)}</div>
    `;
    replyDiv.onclick = (e) => {
      e.stopPropagation();
      
      const targetWrapper = document.getElementById(`msg-wrapper-${id}`);
      if (targetWrapper) {
        targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetWrapper.classList.add('highlight-animation');
        setTimeout(() => targetWrapper.classList.remove('highlight-animation'), 1000);
      }
    };
    bubble.appendChild(replyDiv);
  }

  
  const meta = document.createElement('div');
  meta.className = 'bubble-meta';
  meta.textContent = isMine ? `Вы • ${timeStr}` : `${msgUser} • ${timeStr}`;
  bubble.appendChild(meta);

  
  const textSpan = document.createElement('div');
  textSpan.className = 'bubble-text';
  textSpan.textContent = text;
  bubble.appendChild(textSpan);

  
  const reactionsDiv = document.createElement('div');
  reactionsDiv.className = 'bubble-reaction-container';
  bubble.appendChild(reactionsDiv);

  wrapper.appendChild(bubble);
  chatMessages.appendChild(wrapper);

  if (reactions) {
    window.renderReactions(id, reactions);
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
}


socket.on('chat-message', (data) => {
  appendMessage(data);
});

const typingUsers = new Map();

socket.on('user-typing', ({ username }) => {
  if (typingUsers.has(username)) {
    clearTimeout(typingUsers.get(username));
  }
  
  const timeoutId = setTimeout(() => {
    removeTypingUser(username);
  }, 3500);
  
  typingUsers.set(username, timeoutId);
  updateTypingIndicator();
});

socket.on('user-stop-typing', ({ username }) => {
  removeTypingUser(username);
});

function removeTypingUser(username) {
  if (typingUsers.has(username)) {
    clearTimeout(typingUsers.get(username));
    typingUsers.delete(username);
  }
  updateTypingIndicator();
}

function updateTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (!indicator) return;
  
  if (typingUsers.size === 0) {
    indicator.style.display = 'none';
    indicator.innerHTML = '';
  } else {
    const list = Array.from(typingUsers.keys());
    let text = '';
    if (list.length === 1) {
      text = `${list[0]} печатает...`;
    } else if (list.length === 2) {
      text = `${list[0]} и ${list[1]} печатают...`;
    } else {
      text = `${list.slice(0, -1).join(', ')} и ${list[list.length - 1]} печатают...`;
    }
    
    indicator.innerHTML = `
      <span class="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </span>
      <span>${text}</span>
    `;
    indicator.style.display = 'block';
  }
}


function renderReactions(messageId, reactions) {
  const bubble = document.getElementById(`bubble-${messageId}`);
  if (!bubble) return;

  let reactionsPill = bubble.querySelector('.bubble-reactions');
  if (reactionsPill) {
    reactionsPill.remove();
  }

  if (reactions && reactions.heart && reactions.heart.length > 0) {
    reactionsPill = document.createElement('div');
    reactionsPill.className = 'bubble-reactions';
    reactionsPill.title = 'Лайкнули: ' + reactions.heart.join(', ');
    reactionsPill.innerHTML = `
      <i class="fa-solid fa-heart"></i>
      <span class="reaction-count">${reactions.heart.length}</span>
    `;
    
    reactionsPill.onclick = (e) => {
      e.stopPropagation();
      socket.emit('message-reaction', { messageId, reactionType: 'heart' });
    };

    
    
    
    reactionsPill.addEventListener('touchstart', (e) => {
      e.stopPropagation(); 
    }, { passive: true });
    reactionsPill.addEventListener('touchend', (e) => {
      e.stopPropagation();
      e.preventDefault();
      socket.emit('message-reaction', { messageId, reactionType: 'heart' });
    }, { passive: false });

    bubble.appendChild(reactionsPill);
  }
}


function showFloatingHeart(element) {
  const heart = document.createElement('div');
  heart.className = 'floating-heart';
  heart.innerHTML = '<i class="fa-solid fa-heart"></i>';
  heart.style.left = '50%';
  heart.style.top = '50%';
  element.appendChild(heart);
  setTimeout(() => heart.remove(), 800);
}


function openContextMenu(messageId, msgUser, msgText, clientX, clientY) {
  const menu = document.getElementById('chat-context-menu');
  if (!menu) return;
  menu.style.display = 'block';
  menu.style.left = `${clientX}px`;
  menu.style.top = `${clientY}px`;

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }

  const btnReply = document.getElementById('btn-context-reply');
  btnReply.onclick = () => {
    setReplyState(msgUser, msgText);
    closeContextMenu();
  };

  const btnReactHeart = document.getElementById('btn-context-react-heart');
  if (btnReactHeart) {
    btnReactHeart.onclick = () => {
      socket.emit('message-reaction', { messageId, reactionType: 'heart' });
      const targetBubble = document.getElementById(`bubble-${messageId}`);
      if (targetBubble) showFloatingHeart(targetBubble);
      closeContextMenu();
    };
  }

  setTimeout(() => {
    document.addEventListener('click', closeContextMenuOnOutsideClick);
  }, 50);
}

function closeContextMenu() {
  const menu = document.getElementById('chat-context-menu');
  if (menu) menu.style.display = 'none';
  document.removeEventListener('click', closeContextMenuOnOutsideClick);
}

function closeContextMenuOnOutsideClick(e) {
  const menu = document.getElementById('chat-context-menu');
  if (menu && !menu.contains(e.target)) {
    closeContextMenu();
  }
}


function setReplyState(username, text) {
  replyingToMsg = { username, text };
  const preview = document.getElementById('chat-reply-preview');
  const previewUser = document.getElementById('reply-user-name');
  const previewText = document.getElementById('reply-text-content');

  previewUser.textContent = username;
  previewText.textContent = text;
  preview.style.display = 'flex';
  chatInput.focus();
}

function clearReplyState() {
  replyingToMsg = null;
  const preview = document.getElementById('chat-reply-preview');
  if (preview) preview.style.display = 'none';
}

document.getElementById('btn-close-reply').onclick = () => {
  clearReplyState();
};


socket.on('message-reaction-updated', ({ messageId, reactions }) => {
  window.renderReactions(messageId, reactions);
});


function updateUsersList(users) {
  usersCountVal.textContent = users.length;
  usersListDropdown.innerHTML = '';
  users.forEach(user => {
    const el = document.createElement('div');
    el.className = 'user-item';
    const avatarHtml = user.avatar
      ? `<div class="user-avatar-small">${getAvatarHtml(user.avatar)}</div>`
      : `<span class="user-avatar-dot"></span>`;

    el.innerHTML = `${avatarHtml} <span>${user.username} ${user.id === socket.id ? '(Вы)' : ''}</span>`;
    usersListDropdown.appendChild(el);
  });
}

socket.on('user-joined', ({ username, users }) => {
  updateUsersList(users);
});

socket.on('user-left', ({ username, users }) => {
  updateUsersList(users);
});




const playerManager = {
  activeType: 'none', 

  hlsInstance: null,

  stopAllPlayers() {
    try {
      if (this.hlsInstance) {
        this.hlsInstance.destroy();
        this.hlsInstance = null;
      }
    } catch (e) {}
    try {
      if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    } catch (e) {}
    try {
      if (rutubePlayer) {
        if (rutubePlayer.pause) rutubePlayer.pause();
        rutubePlayer.iframe = null;
        rutubePlayer.isPlaying = false;
        rutubePlayer.isReady = false;
        rutubePlayer.shouldPlayOnReady = false;
        rutubePlayer.state = 'unstarted';
      }
      const rutubeContainer = document.getElementById('rutube-player-container');
      if (rutubeContainer) rutubeContainer.innerHTML = '';
    } catch (e) {}
    try {
      if (vkPlayer && vkPlayer.pause) vkPlayer.pause();
    } catch (e) {}
    try {
      if (html5Player) {
        html5Player.pause();
        html5Player.removeAttribute('src'); 
        html5Player.load();
      }
    } catch (e) {}
  },

  
  changeSource(videoData, callback) {
    if (!videoData) {
      this.destroy();
      return;
    }
    
    
    this.stopAllPlayers();
    
    currentVideo = videoData;
    this.activeType = videoData.type;

    const pContainer = document.querySelector('.player-container');
    if (pContainer) {
      if (videoData.type === 'vk') {
        pContainer.classList.add('vk-active');
      } else {
        pContainer.classList.remove('vk-active');
      }
    }


    
    let initialTitle = videoData.title || 'Видео';
    if (videoData.type === 'direct' && videoData.url) {
      try {
        const urlObj = new URL(videoData.url);
        initialTitle = decodeURIComponent(urlObj.pathname.substring(urlObj.pathname.lastIndexOf('/') + 1)) || 'Прямая ссылка';
      } catch (e) {
        initialTitle = 'Прямая ссылка';
      }
    } else if (videoData.type === 'rutube' && (!videoData.title || videoData.title === 'Видео' || videoData.title === 'Rutube Видео')) {
      initialTitle = videoData.title || 'Rutube Видео';
      fetch(`/api/rutube-info?id=${encodeURIComponent(videoData.id)}`)
        .then(r => r.json())
        .then(data => {
          if (data && data.title) {
            updateVideoTitleDisplay(data.title);
            if (rutubePlayer && data.duration) {
              rutubePlayer.duration = data.duration;
            }
          }
        })
        .catch(() => {});
    }
    updateVideoTitleDisplay(initialTitle);

    
    document.getElementById('player-placeholder').classList.remove('active');

    
    document.getElementById('yt-player-container').classList.remove('active');
    document.getElementById('rutube-player-container')?.classList.remove('active');
    document.getElementById('vk-player-container').classList.remove('active');
    document.getElementById('html5-player-container').classList.remove('active');

    
    this.pause();

    if (this.activeType === 'youtube') {
      document.getElementById('yt-player-container').classList.add('active');
      this.initYouTube(videoData.id, callback);
    } else if (this.activeType === 'rutube') {
      document.getElementById('rutube-player-container').classList.add('active');
      this.initRutube(videoData.playerUrl || `https://rutube.ru/play/embed/${videoData.id}`, callback);
    } else if (this.activeType === 'vk') {
      document.getElementById('vk-player-container').classList.add('active');
      this.initVK(videoData.playerUrl, callback);
    } else if (this.activeType === 'direct') {
      document.getElementById('html5-player-container').classList.add('active');
      this.initHTML5(videoData.url, callback);
    }
  },

  initRutube(playerUrl, callback) {
    debugLog("initRutube called with url: " + playerUrl);
    const container = document.getElementById('rutube-player-container');
    if (!container) return;

    rutubePlayer.state = 'unstarted';
    rutubePlayer.isPlaying = false;
    rutubePlayer.isReady = false;
    rutubePlayer.currentTime = 0;
    rutubePlayer.duration = 0;
    rutubePlayer.lastTimeUpdate = Date.now();

    const match = playerUrl.match(/\/embed\/([a-zA-Z0-9_-]+)/) || playerUrl.match(/\/video\/([a-zA-Z0-9_-]+)/);
    if (match) {
      rutubePlayer.videoId = match[1];
    }

    let cleanUrl = playerUrl;
    const sep = cleanUrl.includes('?') ? '&' : '?';
    cleanUrl = cleanUrl + sep + 'skinColor=6366f1';
    if (isMobile() && !hasUserActivated) {
      cleanUrl = cleanUrl + '&autoStart=1&mute=1';
    }

    container.innerHTML = `<iframe id="rutube-player" src="${cleanUrl}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
    const iframe = document.getElementById('rutube-player');
    rutubePlayer.iframe = iframe;

    iframe.onload = () => {
      debugLog("Rutube iframe loaded");
      resetSeekBaseline();
      if (callback) callback();
    };
  },

  initYouTube(videoId, callback) {
    debugLog("initYouTube called with id: " + videoId + ", isYTApiReady=" + isYTApiReady);
    const initYT = () => {
      if (ytPlayer && ytPlayer.cueVideoById) {
        
        try {
          debugLog("cueVideoById called for id: " + videoId);
          ytPlayer.cueVideoById(videoId);
          resetSeekBaseline();
          if (callback) callback();
        } catch (e) {
          debugLog("Error cueing video, recreating player: " + e.message);
          console.warn("Error cueing video, recreating player", e);
          ytPlayer = null;
          initYT();
        }
      } else {
        
        debugLog("Creating new YT.Player for id: " + videoId);
        ytPlayer = new YT.Player('yt-player', {
          height: '100%',
          width: '100%',
          videoId: videoId,
          playerVars: {
            'autoplay': isMobile() ? 1 : 0,
            'mute': isMobile() ? 1 : 0,
            'controls': 1, 
            'rel': 0,
            'origin': window.location.origin,
            'cc_load_policy': 0, 
            'iv_load_policy': 3, 
            'modestbranding': 1  
          },
          events: {
            'onReady': () => {
              debugLog("YT.Player onReady fired");
              resetSeekBaseline();
              
              try {
                if (ytPlayer && typeof ytPlayer.getVideoData === 'function') {
                  const data = ytPlayer.getVideoData();
                  if (data && data.title) {
                    updateVideoTitleDisplay(data.title);
                  }
                }
              } catch (e) {
                console.warn("Could not get YT video data onReady", e);
              }
              
              disableYTSubtitles();
              setTimeout(disableYTSubtitles, 1000); 
              if (callback) callback();
            },
            'onStateChange': (event) => {
              debugLog("YT.Player onStateChange fired: " + event.data);
              
              try {
                if (ytPlayer && typeof ytPlayer.getVideoData === 'function') {
                  const data = ytPlayer.getVideoData();
                  if (data && data.title) {
                    updateVideoTitleDisplay(data.title);
                  }
                }
              } catch (e) {
                console.warn("Could not get YT video data onStateChange", e);
              }
              
              disableYTSubtitles();
              onYouTubeStateChange(event);
            }
          }
        });
      }
    };

    if (isYTApiReady) {
      initYT();
    } else {
      debugLog("Waiting for YT API to be ready...");
      
      const checkYTApi = setInterval(() => {
        if (isYTApiReady || (window.YT && window.YT.Player)) {
          isYTApiReady = true;
          debugLog("YT API ready in polling check. Initializing player.");
          clearInterval(checkYTApi);
          initYT();
        }
      }, 100);
    }
  },

  initVK(playerUrl, callback) {
    debugLog("initVK called with url: " + playerUrl);
    
    const container = document.getElementById('vk-player-container');
    
    let cleanUrl = playerUrl.replace(/[?&]mute=1/g, '').replace(/[?&]no_audio=1/g, '');
    if (isMobile() && !hasUserActivated) {
      const sep = cleanUrl.includes('?') ? '&' : '?';
      cleanUrl = cleanUrl + sep + 'autoplay=1&mute=1';
      debugLog("VK mobile detected, loaded muted URL: " + cleanUrl);
    }
    container.innerHTML = `<iframe id="vk-player" src="${cleanUrl}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;

    const iframe = document.getElementById('vk-player');
    iframe.onload = () => {
      
      try {
        vkPlayer = VK.VideoPlayer(iframe);

        let unmuteOnFirstPlay = true;

        vkPlayer.on('inited', () => {
          debugLog("VK player inited event fired");
          if (!isMobile() || hasUserActivated) {
            try { vkPlayer.setVolume(1); } catch(e) {}
          } else {
            try { vkPlayer.setVolume(0); } catch(e) {}
          }
        });

        
        vkPlayer.on('started', () => {
          debugLog("VK player started event fired");
          onLocalPlay();
          if (!isMobile() || hasUserActivated) {
            try { vkPlayer.setVolume(1); } catch(e) {}
          } else {
            try { vkPlayer.setVolume(0); } catch(e) {}
          }
          unmuteOnFirstPlay = false;
        });

        
        vkPlayer.on('resumed', () => {
          debugLog("VK player resumed event fired");
          onLocalPlay();
          if (unmuteOnFirstPlay) {
            unmuteOnFirstPlay = false;
            if (!isMobile() || hasUserActivated) {
              try { vkPlayer.setVolume(1); } catch(e) {}
            } else {
              try { vkPlayer.setVolume(0); } catch(e) {}
            }
          }
        });

        
        vkPlayer.on('paused', () => {
          debugLog("VK player paused event fired");
          onLocalPause();
        });

        resetSeekBaseline();
        if (callback) callback();
      } catch (err) {
        console.error('VK.VideoPlayer init error:', err);
      }

    };
  },

  initHTML5(url, callback) {
    debugLog("initHTML5 called with url: " + url);
    html5Player.controls = true;
    if (isMobile() && !hasUserActivated) {
      html5Player.muted = true;
      debugLog("HTML5 player muted initially");
    }

    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }

    const isM3u8 = /\.m3u8(?:\?|$)/i.test(url) || url.includes('.m3u8') || url.includes('/x/');
    const streamSource = (isM3u8 && url.startsWith('http')) ? `/api/hls-proxy?url=${encodeURIComponent(url)}` : url;

    if (isM3u8 && typeof Hls !== 'undefined' && Hls.isSupported()) {
      debugLog("Using Hls.js to play stream via proxy: " + streamSource);
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90
      });
      this.hlsInstance = hls;

      hls.loadSource(streamSource);
      hls.attachMedia(html5Player);

      let initialCallbackFired = false;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        debugLog("HLS Manifest parsed successfully");
        resetSeekBaseline();
        if (!initialCallbackFired && callback) {
          initialCallbackFired = true;
          callback();
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn("HLS event error:", data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              debugLog("Fatal network error in HLS, attempting recovery...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              debugLog("Fatal media error in HLS, attempting recovery...");
              hls.recoverMediaError();
              break;
            default:
              console.error("Unrecoverable HLS error, destroying instance");
              hls.destroy();
              break;
          }
        }
      });
    } else {
      // Native HTML5 video or Apple Safari native HLS
      html5Player.src = streamSource;
      html5Player.load();
      
      html5Player.onloadedmetadata = () => {
        resetSeekBaseline();
        if (callback) callback();
      };
    }
    
    html5Player.onplay = () => onLocalPlay();
    html5Player.onpause = () => onLocalPause();
  },

  
  play() {
    try {
      if (this.activeType !== 'rutube' && this.isPlaying()) {
        return; 
      }
      if (this.activeType === 'youtube' && ytPlayer && ytPlayer.playVideo) {
        ytPlayer.playVideo();
      } else if (this.activeType === 'rutube' && rutubePlayer) {
        rutubePlayer.play();
      } else if (this.activeType === 'vk' && vkPlayer) {
        vkPlayer.play();
      } else if (this.activeType === 'direct' && html5Player) {
        html5Player.play().catch(err => {
          console.warn('HTML5 play blocked', err);
          showAutoplayOverlay();
        });
      }
    } catch (e) {
      console.error(e);
    }
  },

  pause() {
    try {
      if (this.activeType !== 'rutube' && !this.isPlaying()) {
        return; 
      }
      if (this.activeType === 'youtube' && ytPlayer && ytPlayer.pauseVideo) {
        ytPlayer.pauseVideo();
      } else if (this.activeType === 'rutube' && rutubePlayer) {
        rutubePlayer.pause();
      } else if (this.activeType === 'vk' && vkPlayer) {
        vkPlayer.pause();
      } else if (this.activeType === 'direct' && html5Player) {
        html5Player.pause();
      }
    } catch (e) {
      console.error(e);
    }
  },




  seekTo(seconds) {
    try {
      lastSeekTargetTime = seconds;
      isWaitingForSeekAlignment = true;
      seekStartTime = Date.now();
      if (this.activeType === 'youtube' && ytPlayer && ytPlayer.seekTo) {
        ytPlayer.seekTo(seconds, true);
      } else if (this.activeType === 'rutube' && rutubePlayer) {
        rutubePlayer.seek(seconds);
      } else if (this.activeType === 'vk' && vkPlayer) {
        vkPlayer.seek(seconds);
      } else if (this.activeType === 'direct' && html5Player) {
        html5Player.currentTime = seconds;
      }
    } catch (e) {
      console.error(e);
    }
  },

  getCurrentTime() {
    try {
      if (this.activeType === 'youtube' && ytPlayer && ytPlayer.getCurrentTime) {
        return ytPlayer.getCurrentTime();
      } else if (this.activeType === 'rutube' && rutubePlayer) {
        if (rutubePlayer.isPlaying || rutubePlayer.state === 'playing') {
          const elapsed = (Date.now() - (rutubePlayer.lastTimeUpdate || Date.now())) / 1000;
          return (rutubePlayer.currentTime || 0) + Math.max(0, elapsed);
        }
        return rutubePlayer.currentTime || 0;
      } else if (this.activeType === 'vk' && vkPlayer && vkPlayer.getCurrentTime) {
        return vkPlayer.getCurrentTime();
      } else if (this.activeType === 'direct' && html5Player) {
        return html5Player.currentTime;
      }
    } catch (e) {
      
    }
    return 0;
  },

  getDuration() {
    try {
      if (this.activeType === 'youtube' && ytPlayer && ytPlayer.getDuration) {
        return ytPlayer.getDuration();
      } else if (this.activeType === 'rutube' && rutubePlayer) {
        return rutubePlayer.duration || 0;
      } else if (this.activeType === 'vk' && vkPlayer && vkPlayer.getDuration) {
        return vkPlayer.getDuration();
      } else if (this.activeType === 'direct' && html5Player) {
        return html5Player.duration || 0;
      }
    } catch (e) {
      
    }
    return 0;
  },

  isPlaying() {
    try {
      if (this.activeType === 'youtube' && ytPlayer && ytPlayer.getPlayerState) {
        const PLAYING = (window.YT && window.YT.PlayerState && window.YT.PlayerState.PLAYING) !== undefined ? window.YT.PlayerState.PLAYING : 1;
        return ytPlayer.getPlayerState() === PLAYING;
      } else if (this.activeType === 'rutube' && rutubePlayer) {
        return !!rutubePlayer.isPlaying || rutubePlayer.state === 'playing';
      } else if (this.activeType === 'vk' && vkPlayer && vkPlayer.getState) {
        
        return vkPlayer.getState() === 'playing';
      } else if (this.activeType === 'direct' && html5Player) {
        return !html5Player.paused;
      }
    } catch (e) {
      
    }
    return false;
  },

  isBuffering() {
    try {
      if (this.activeType === 'youtube' && ytPlayer && ytPlayer.getPlayerState) {
        const state = ytPlayer.getPlayerState();
        
        return state === 3;
      } else if (this.activeType === 'rutube' && rutubePlayer) {
        return rutubePlayer.state === 'buffering' || rutubePlayer.state === 'loading';
      } else if (this.activeType === 'vk' && vkPlayer && vkPlayer.getState) {
        const state = vkPlayer.getState();
        return state === 'buffering' || state === 'loading';
      } else if (this.activeType === 'direct' && html5Player) {
        
        return html5Player.readyState > 0 && html5Player.readyState < 3;
      }
    } catch (e) {
      
    }
    return false;
  },

  destroy() {
    this.activeType = 'none';
    currentVideo = null;
    
    const pContainer = document.querySelector('.player-container');
    if (pContainer) {
      pContainer.classList.remove('vk-active');
    }

    
    
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }

    if (html5Player) {
      html5Player.pause();
      html5Player.src = '';
    }
    
    
    document.getElementById('vk-player-container').innerHTML = '';
    vkPlayer = null;

    const rutubeContainer = document.getElementById('rutube-player-container');
    if (rutubeContainer) rutubeContainer.innerHTML = '';
    rutubePlayer.iframe = null;
    rutubePlayer.state = 'unstarted';
    rutubePlayer.currentTime = 0;

    
    if (ytPlayer && ytPlayer.stopVideo) {
      ytPlayer.stopVideo();
    }

    document.getElementById('player-placeholder').classList.add('active');
  }
};






function onYouTubeStateChange(event) {
  const PLAYING = (window.YT && window.YT.PlayerState && window.YT.PlayerState.PLAYING) !== undefined ? window.YT.PlayerState.PLAYING : 1;
  const PAUSED = (window.YT && window.YT.PlayerState && window.YT.PlayerState.PAUSED) !== undefined ? window.YT.PlayerState.PAUSED : 2;

  if (event.data === PLAYING) {
    onLocalPlay();
  } else if (event.data === PAUSED) {
    onLocalPause();
  }
}


function onLocalPlay() {
  if (document.hidden) return; 
  if (ignoreNextPlay) {
    ignoreNextPlay = false;
    if (ignorePlayTimeout) clearTimeout(ignorePlayTimeout);
    return;
  }
  if (playerManager.activeType === 'direct' && html5Player) {
    if (html5Player.error || html5Player.readyState < 2) {
      return;
    }
  }
  const time = playerManager.getCurrentTime();
  resetSeekBaseline();
  console.log('Local action: play at', time);
  socket.emit('client-action', { action: 'play', time });
}


function onLocalPause() {
  if (document.hidden) return; 
  if (ignoreNextPause) {
    ignoreNextPause = false;
    if (ignorePauseTimeout) clearTimeout(ignorePauseTimeout);
    return;
  }
  if (playerManager.activeType === 'direct' && html5Player) {
    if (html5Player.error || html5Player.readyState < 2 || !hasUserActivated) {
      console.warn('Ignoring local pause: player is unready or errored');
      return;
    }
  }
  const time = playerManager.getCurrentTime();
  resetSeekBaseline();
  console.log('Local action: pause at', time);
  socket.emit('client-action', { action: 'pause', time });
}



function applyRemoteAction(fn, lockDuration = 1200) {
  isApplyingRemoteAction = true;
  if (remoteActionTimeout) clearTimeout(remoteActionTimeout);
  
  fn();
  
  
  remoteActionTimeout = setTimeout(() => {
    isApplyingRemoteAction = false;
    resetSeekBaseline();
  }, lockDuration);
}

let pendingUserSeekTime = null;
let userSeekDebounceTimer = null;

function performUserSeek(targetTime) {
  const duration = playerManager.getDuration();
  if (duration > 0) {
    targetTime = Math.min(duration, Math.max(0, targetTime));
  } else {
    targetTime = Math.max(0, targetTime);
  }

  pendingUserSeekTime = targetTime;

  // Immediately update UI for instant responsive feedback
  if (duration > 0) {
    const pct = (targetTime / duration) * 100;
    const fill = document.getElementById('timeline-fill');
    const slider = document.getElementById('timeline-slider');
    if (fill) fill.style.width = `${pct}%`;
    if (slider) slider.value = pct;
    lastUiState.percentage = pct;
  }
  const timeDisplay = document.getElementById('time-display');
  if (timeDisplay && duration > 0) {
    timeDisplay.textContent = `${formatDuration(targetTime)} / ${formatDuration(duration)}`;
  }

  // Debounce actual execution & broadcast by 200ms
  // If user presses repeatedly, only the final target seek is executed and sent
  if (userSeekDebounceTimer) clearTimeout(userSeekDebounceTimer);
  userSeekDebounceTimer = setTimeout(() => {
    const finalSeekTime = pendingUserSeekTime;
    pendingUserSeekTime = null;
    userSeekDebounceTimer = null;
    if (finalSeekTime !== null && isFinite(finalSeekTime)) {
      applyRemoteAction(() => {
        playerManager.seekTo(finalSeekTime);
      }, 1500);
      socket.emit('client-action', { action: 'seek', time: finalSeekTime });
      resetSeekBaseline();
    }
  }, 200);
}

function resetSeekBaseline() {
  lastObservedTime = playerManager.getCurrentTime();
  lastObservedAt = Date.now();
}


setInterval(() => {
  if (document.hidden) {
    resetSeekBaseline();
    return;
  }
  if (isApplyingRemoteAction || playerManager.activeType === 'none' || playerManager.isBuffering()) {
    resetSeekBaseline();
    return;
  }

  const currentTime = playerManager.getCurrentTime();

  if (isWaitingForSeekAlignment) {
    if (Date.now() - seekStartTime > 3500) {
      isWaitingForSeekAlignment = false;
      console.log('Seek alignment timeout. Resuming seek detection.');
    } else {
      const diff = Math.abs(currentTime - lastSeekTargetTime);
      if (Date.now() - seekStartTime > 300 && diff <= 2.0) {
        isWaitingForSeekAlignment = false;
        console.log('Seek alignment achieved! Resuming seek detection.');
      }
      resetSeekBaseline();
      return;
    }
  }

  const isPlaying = playerManager.isPlaying();
  const now = Date.now();
  const elapsed = (now - lastObservedAt) / 1000;

  if (isPlaying) {
    const expectedTime = lastObservedTime + elapsed;
    if (Math.abs(currentTime - expectedTime) > 4.5) {
      console.log('Local seek detected (playing): from', expectedTime, 'to', currentTime);
      socket.emit('client-action', { action: 'seek', time: currentTime });
      lastSeekTargetTime = currentTime;
      isWaitingForSeekAlignment = true;
      seekStartTime = Date.now();
      resetSeekBaseline();
    }
  } else {
    if (Math.abs(currentTime - lastObservedTime) > 3.0) {
      console.log('Local seek detected (paused): from', lastObservedTime, 'to', currentTime);
      socket.emit('client-action', { action: 'seek', time: currentTime });
      lastSeekTargetTime = currentTime;
      isWaitingForSeekAlignment = true;
      seekStartTime = Date.now();
      resetSeekBaseline();
    }
  }

  lastObservedTime = currentTime;
  lastObservedAt = now;
}, 500);






socket.on('room-status', ({ video, isPlaying, time, users, messages }) => {
  updateUsersList(users);

  if (messages && Array.isArray(messages)) {
    chatMessages.innerHTML = '';
    messages.forEach(msg => {
      appendMessage(msg);
    });
  }

  if (video) {
    playerManager.changeSource(video, () => {
      applyRemoteAction(() => {
        playerManager.seekTo(time);
        if (isPlaying) {
          setIgnoreNextPlay();
          playerManager.play();
        } else {
          setIgnoreNextPause();
          playerManager.pause();
        }
      }, 1500); 
      
      
      if (isPlaying && isMobile()) {
        showAutoplayOverlay();
      }
    });
  }
});


socket.on('video-changed', (videoData) => {
  hasUserActivated = false; 
  playerManager.changeSource(videoData, () => {
    
    applyRemoteAction(() => {
      setIgnoreNextPlay();
      playerManager.play();
      playerManager.seekTo(0);
    }, 1500); 
    
    
    if (isMobile()) {
      showAutoplayOverlay();
    }
  });
});


socket.on('server-action', ({ action, time, force }) => {
  if (action === 'seek') {
    // ALWAYS apply remote seek! Never drop incoming seeks from other users
    console.log(`Applying remote seek to ${time}`);
    applyRemoteAction(() => {
      playerManager.seekTo(time);
    }, 1200);
    return;
  }

  if (isApplyingRemoteAction && !force) return;

  applyRemoteAction(() => {
    console.log(`Applying remote action: ${action} at ${time}`);

    if (action === 'play') {
      const curTime = playerManager.getCurrentTime() || 0;
      if (Math.abs(time - curTime) > 4.0) {
        playerManager.seekTo(time);
      }
      setIgnoreNextPlay();
      playerManager.play();
      hideAutoplayOverlay();
    } else if (action === 'pause') {
      setIgnoreNextPause();
      playerManager.pause();
    }
  }, 800);
});


socket.on('sync-heartbeat', ({ isPlaying, time }) => {
  if (isApplyingRemoteAction || playerManager.activeType === 'none') return;
  if (isWaitingForSeekAlignment && Date.now() - seekStartTime < 3000) return;
  if (playerManager.isBuffering()) return;

  const localTime = playerManager.getCurrentTime();
  const localPlaying = playerManager.isPlaying();

  // 1. Sync play/pause state if mismatched
  if (localPlaying !== isPlaying) {
    if (statusIndicator) statusIndicator.className = 'status-indicator lagging';
    if (statusText) statusText.textContent = 'Рассинхронизация...';
    if (isPlaying && !localPlaying && isMobile() && !hasUserActivated) {
      if (isPlayerReady()) showAutoplayOverlay();
    } else {
      applyRemoteAction(() => {
        if (isPlaying) {
          setIgnoreNextPlay();
          playerManager.play();
        } else {
          setIgnoreNextPause();
          playerManager.pause();
        }
      }, 1000);
    }
    return;
  }

  // 2. Check time drift in BOTH directions (ahead or behind)
  const timeDiff = time - localTime;
  if (Math.abs(timeDiff) > 3.5) {
    console.log(`Time drift: ${timeDiff > 0 ? 'behind' : 'ahead'} by ${Math.abs(timeDiff).toFixed(2)}s (server: ${time.toFixed(2)}, local: ${localTime.toFixed(2)}) → syncing`);
    if (statusIndicator) statusIndicator.className = 'status-indicator lagging';
    if (statusText) statusText.textContent = 'Подстройка времени...';
    applyRemoteAction(() => {
      playerManager.seekTo(time);
    }, 1200);
  } else {
    if (statusIndicator) statusIndicator.className = 'status-indicator';
    if (statusText) statusText.textContent = 'Синхронизировано';
  }
});

if (btnResync) {
  btnResync.addEventListener('click', () => {
    socket.emit('request-sync');
  });
}




function isMobile() {
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isIPadOS = navigator.userAgent.includes('Macintosh') && isTouch;
  return isIPadOS || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isPlayerReady() {
  if (playerManager.activeType === 'youtube') {
    return !!(ytPlayer && typeof ytPlayer.playVideo === 'function' && typeof ytPlayer.getPlayerState === 'function');
  }
  if (playerManager.activeType === 'rutube') {
    return !!(rutubePlayer && rutubePlayer.iframe);
  }
  if (playerManager.activeType === 'vk') {
    return !!(vkPlayer && typeof vkPlayer.play === 'function' && typeof vkPlayer.getState === 'function');
  }
  if (playerManager.activeType === 'direct') {
    return !!(html5Player && html5Player.readyState >= 1);
  }
  return false;
}

function showAutoplayOverlay() {
  autoplayOverlay.classList.add('active');
}

function hideAutoplayOverlay() {
  autoplayOverlay.classList.remove('active');
}

btnAutoplaySync.addEventListener('click', () => {
  debugLog("btnAutoplaySync clicked. Unmuting and calling playerManager.play()");
  hideAutoplayOverlay();
  hasUserActivated = true; 
  setIgnoreNextPlay();
  setIgnoreNextPause();
  
  if (html5Player) {
    html5Player.muted = false;
  }
  if (ytPlayer && typeof ytPlayer.unMute === 'function') {
    try { ytPlayer.unMute(); } catch(e) {}
  }
  if (rutubePlayer && playerManager.activeType === 'rutube') {
    try {
      rutubePlayer.post('player:unMute');
      rutubePlayer.post('player:setVolume', { volume: 1 });
    } catch(e) {}
  }
  if (vkPlayer && typeof vkPlayer.setVolume === 'function') {
    try { vkPlayer.setVolume(1); } catch(e) {}
  }
  
  playerManager.play();
  
  setTimeout(() => {
    socket.emit('request-sync');
  }, 300);
});




videoLinkForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = videoUrlInput.value.trim();
  if (!input) return;

  const parsed = parseVideoInput(input);
  if (parsed) {
    socket.emit('video-change', parsed);
    videoUrlInput.value = '';
  } else {
    
    if (input.includes('vk.com/video') || input.includes('vk.ru/video')) {
      alert('Внимание! Обычные ссылки на ВК Видео защищены от встраивания.\n\nПожалуйста, скопируйте «Код вставки» из меню «Поделиться» ВК и вставьте его сюда!');
    } else {
      alert('Неподдерживаемый формат ссылки. Укажите прямую ссылку (.mp4), YouTube, Rutube ссылку или код вставки ВК iframe.');
    }
  }
});

function parseVideoInput(input) {
  
  if (input.startsWith('<iframe')) {
    const srcMatch = input.match(/src=["'](https?:\/\/[^"']+)["']/i);
    if (srcMatch) {
      input = srcMatch[1];
    }
  }

  
  const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const ytMatch = input.match(ytRegex);
  if (ytMatch) {
    return {
      type: 'youtube',
      url: input,
      id: ytMatch[1]
    };
  }

  
  const rutubeRegex = /(?:rutube\.ru\/(?:video|play\/embed)(?:\/private)?\/([a-zA-Z0-9]+))/i;
  const rutubeMatch = input.match(rutubeRegex);
  if (rutubeMatch) {
    const videoId = rutubeMatch[1];
    return {
      type: 'rutube',
      url: input,
      id: videoId,
      playerUrl: `https://rutube.ru/play/embed/${videoId}`
    };
  }

  
  const vkExtRegex = /vk\.(?:com|ru)\/video_ext\.php\?([^"'\s>]+)/i;
  const vkExtMatch = input.match(vkExtRegex);
  if (vkExtMatch) {
    let queryParams = vkExtMatch[1];
    if (!queryParams.includes('js_api=')) {
      queryParams += '&js_api=1';
    }
    const fullUrl = `https://vk.com/video_ext.php?${queryParams}`;
    
    const oidMatch = queryParams.match(/oid=(-?\d+)/);
    const idMatch = queryParams.match(/id=(\d+)/);
    const id = `${oidMatch ? oidMatch[1] : ''}_${idMatch ? idMatch[1] : ''}`;

    return {
      type: 'vk',
      url: input,
      id: id,
      playerUrl: fullUrl
    };
  }

  
  const vkRegex = /(?:vk\.com|vk\.ru|vkvideo\.ru)\/(?:video|clip)(-?\d+)_(\d+)/i;
  const vkMatch = input.match(vkRegex);
  if (vkMatch) {
    const oid = vkMatch[1];
    const vid = vkMatch[2];
    return {
      type: 'vk',
      url: input,
      id: `${oid}_${vid}`,
      playerUrl: `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&js_api=1`
    };
  }

  
  const directVideoRegex = /\.(mp4|webm|ogg|m3u8)(?:\?|$)/i;
  if (directVideoRegex.test(input) || input.startsWith('http')) {
    return {
      type: 'direct',
      url: input,
      id: input
    };
  }

  return null;
}






checkTokenConfigured();

async function checkTokenConfigured() {
  try {
    const res  = await fetch('/api/vk-status');
    const data = await res.json();
    const statusDiv = document.getElementById('vk-token-status');
    if (!statusDiv) return;
    if (!data.configured) {
      statusDiv.className = 'vk-token-status';
      statusDiv.innerHTML = `<span class="status-warning"><i class="fa-solid fa-circle-exclamation"></i> Поиск в ВК требует настройки токена. <a href="#" id="link-setup-token-2">Настроить</a></span>`;
      const lnk = document.getElementById('link-setup-token-2');
      if (lnk) lnk.onclick = (e) => { e.preventDefault(); tokenModal.classList.add('active'); };
    } else {
      statusDiv.className = 'vk-token-status configured';
      statusDiv.innerHTML = `<span class="status-success"><i class="fa-solid fa-circle-check"></i> VK API подключен. Поиск работает!</span>`;
    }
  } catch (err) {
    console.warn('[vk-status] check failed:', err.message);
  }
}


btnVkSearch.addEventListener('click', performVkSearch);
vkSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') performVkSearch();
});

async function performVkSearch() {
  const query = vkSearchInput.value.trim();
  if (!query) return;

  
  searchResultsContainer.innerHTML = `
    <div class="loader-container">
      <div class="loader"></div>
      <p>Ищем в ВК Видео...</p>
    </div>
  `;

  try {
    const response = await fetch(`/api/vk-search?q=${encodeURIComponent(query)}&t=${Date.now()}`);
    const data = await response.json();

    if (data.error) {
      if (data.error === 'VK_SERVICE_TOKEN_MISSING') {
        searchResultsContainer.innerHTML = `
          <div class="search-placeholder">
            <i class="fa-solid fa-key" style="color: #f59e0b"></i>
            <p>Сервисный токен ВК не настроен на сервере.<br>Нажмите «Настроить» выше, чтобы узнать как это сделать.</p>
          </div>
        `;
      } else {
        searchResultsContainer.innerHTML = `
          <div class="search-placeholder">
            <i class="fa-solid fa-circle-xmark" style="color: #ef4444"></i>
            <p>Ошибка: ${data.message || 'Не удалось выполнить поиск'}</p>
          </div>
        `;
      }
      return;
    }

    const videos = data.videos || [];
    if (videos.length === 0) {
      searchResultsContainer.innerHTML = `
        <div class="search-placeholder">
          <i class="fa-solid fa-face-frown"></i>
          <p>Ничего не найдено. Попробуйте другой запрос.</p>
        </div>
      `;
      return;
    }

    searchResultsContainer.innerHTML = '';
    videos.forEach(video => {
      const card = document.createElement('div');
      card.className = 'vk-video-card';
      
      const durationStr = formatDuration(video.duration);
      const viewsStr = formatViews(video.views);

      card.innerHTML = `
        <div class="video-card-preview">
          <img src="${video.preview || 'https://placehold.co/100x60/000000/ffffff?text=VK+Video'}" alt="${video.title}">
          <span class="video-card-duration">${durationStr}</span>
        </div>
        <div class="video-card-info">
          <div class="video-card-title" title="${video.title}">${video.title}</div>
          <div class="video-card-views">${viewsStr}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        
        const videoData = {
          type: 'vk',
          url: video.player,
          id: `${video.owner_id}_${video.id}`,
          playerUrl: `${video.player}&js_api=1`
        };
        socket.emit('video-change', videoData);
      });

      searchResultsContainer.appendChild(card);
    });
  } catch (err) {
    console.error('VK Search request failed', err);
    searchResultsContainer.innerHTML = `
      <div class="search-placeholder">
        <i class="fa-solid fa-wifi" style="color: #ef4444"></i>
        <p>Ошибка связи с сервером. Повторите попытку.</p>
      </div>
    `;
  }
}


function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds - (hrs * 3600)) / 60);
  const secs = totalSeconds - (hrs * 3600) - (mins * 60);
  
  const formattedSecs = secs < 10 ? '0' + secs : secs;
  if (hrs > 0) {
    const formattedMins = mins < 10 ? '0' + mins : mins;
    return `${hrs}:${formattedMins}:${formattedSecs}`;
  }
  return `${mins}:${formattedSecs}`;
}

function formatViews(views) {
  if (views === undefined) return '';
  if (views >= 1000000) {
    return `${(views / 1000000).toFixed(1)} млн просмотров`;
  }
  if (views >= 1000) {
    return `${(views / 1000).toFixed(1)} тыс. просмотров`;
  }
  return `${views} просмотров`;
}






let lastUiState = {
  isPlaying: null,
  timeStr: '',
  percentage: -1
};


function updateCustomControlsUI() {
  if (playerManager.activeType === 'none') {
    return;
  }

  const currentTime = playerManager.getCurrentTime() || 0;
  const duration = playerManager.getDuration() || 0;
  const isPlaying = playerManager.isPlaying();

  
  if (lastUiState.isPlaying !== isPlaying) {
    const playBtn = document.getElementById('btn-custom-play');
    if (playBtn) {
      if (isPlaying) {
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      } else {
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      }
    }
    lastUiState.isPlaying = isPlaying;
  }

  
  const timeStr = `${formatDuration(currentTime)} / ${formatDuration(duration)}`;
  if (lastUiState.timeStr !== timeStr) {
    const timeDisplay = document.getElementById('time-display');
    if (timeDisplay) {
      timeDisplay.textContent = timeStr;
    }
    lastUiState.timeStr = timeStr;
  }

  
  if (!isDraggingTimeline && duration > 0) {
    const percentage = (currentTime / duration) * 100;
    if (Math.abs(lastUiState.percentage - percentage) > 0.1) {
      const fill = document.getElementById('timeline-fill');
      const slider = document.getElementById('timeline-slider');
      if (fill) fill.style.width = `${percentage}%`;
      if (slider) slider.value = percentage;
      lastUiState.percentage = percentage;
    }
  }
}


setInterval(() => {
  if (playerManager.activeType !== 'none') {
    
    if (playerManager.isPlaying() || lastUiState.isPlaying !== false) {
      updateCustomControlsUI();
    }
  }
}, 200);



document.getElementById('btn-custom-play').addEventListener('click', () => {
  if (playerManager.activeType === 'none') return;
  if (playerManager.isPlaying()) {
    playerManager.pause();
  } else {
    playerManager.play();
  }
});


function toggleFullscreen() {
  const container = document.querySelector('.player-container');
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen(); 
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}


document.getElementById('btn-custom-fullscreen').addEventListener('click', toggleFullscreen);


const fullscreenEvents = ['fullscreenchange', 'webkitfullscreenchange'];
fullscreenEvents.forEach(evt => {
  document.addEventListener(evt, () => {
    const icon = document.querySelector('#btn-custom-fullscreen i');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      icon.className = 'fa-solid fa-compress';
    } else {
      icon.className = 'fa-solid fa-expand';
    }
  });
});




document.addEventListener('keydown', (e) => {
  
  if (!roomScreen || !roomScreen.classList.contains('active')) return;
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  if (playerManager.activeType === 'none') return;

  switch (e.code) {
    case 'Space':
    case 'KeyK':
      e.preventDefault();
      if (playerManager.isPlaying()) playerManager.pause();
      else playerManager.play();
      break;
    case 'KeyF':
      e.preventDefault();
      toggleFullscreen();
      break;
    case 'ArrowLeft': {
      e.preventDefault();
      const dur = playerManager.getDuration() || Infinity;
      const base = pendingUserSeekTime !== null ? pendingUserSeekTime : (playerManager.getCurrentTime() || 0);
      const t = Math.max(0, base - 10);
      performUserSeek(t);
      break;
    }
    case 'ArrowRight': {
      e.preventDefault();
      const dur = playerManager.getDuration() || Infinity;
      const base = pendingUserSeekTime !== null ? pendingUserSeekTime : (playerManager.getCurrentTime() || 0);
      const t2 = Math.min(dur, base + 10);
      performUserSeek(t2);
      break;
    }
    case 'KeyM':
      
      if (playerManager.activeType === 'direct' && html5Player) {
        html5Player.muted = !html5Player.muted;
      } else if (playerManager.activeType === 'rutube' && rutubePlayer) {
        rutubePlayer.muted = !rutubePlayer.muted;
        if (rutubePlayer.muted) {
          rutubePlayer.post('player:mute');
        } else {
          rutubePlayer.post('player:unMute');
          rutubePlayer.post('player:setVolume', { volume: 1 });
        }
      }
      break;
  }
});




const timelineSlider = document.getElementById('timeline-slider');
const timelineFill = document.getElementById('timeline-fill');
const progressBarContainer = document.querySelector('.progress-bar-container');

let originalSliderValue = 0;
let hasMovedSlider = false;
let isTouchInteraction = false;
let isMouseDragging = false;
let touchStartX = 0;
let touchStartY = 0;

function getTimelinePercent(clientX) {
  const rect = progressBarContainer.getBoundingClientRect();
  let offsetX = clientX - rect.left;
  if (offsetX < 0) offsetX = 0;
  if (offsetX > rect.width) offsetX = rect.width;
  return (offsetX / rect.width) * 100;
}


function isNearHandle(clientX) {
  const rect = progressBarContainer.getBoundingClientRect();
  const currentPct = parseFloat(timelineSlider.value) || 0;
  const handleX = rect.left + (currentPct / 100) * rect.width;
  return Math.abs(clientX - handleX) <= 55; 
}


progressBarContainer.addEventListener('touchstart', (e) => {
  if (!e.touches || !e.touches[0]) return;
  const clientX = e.touches[0].clientX;
  
  if (!isNearHandle(clientX)) return;
  
  isTouchInteraction = true;
  hasMovedSlider = false;
  isDraggingTimeline = true;
  originalSliderValue = parseFloat(timelineSlider.value) || 0;
  touchStartX = clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

progressBarContainer.addEventListener('touchmove', (e) => {
  if (!isTouchInteraction || !e.touches || !e.touches[0]) return;
  if (e.cancelable) e.preventDefault(); 

  const moveX = e.touches[0].clientX;
  const moveY = e.touches[0].clientY;

  if (!hasMovedSlider) {
    const d = Math.hypot(moveX - touchStartX, moveY - touchStartY);
    if (d > 5) hasMovedSlider = true; 
  }

  if (hasMovedSlider) {
    const pct = getTimelinePercent(moveX);
    timelineSlider.value = pct;
    timelineFill.style.width = `${pct}%`;

    const duration = playerManager.getDuration();
    if (duration > 0) {
      const t = (pct / 100) * duration;
      document.getElementById('time-display').textContent =
        `${formatDuration(t)} / ${formatDuration(duration)}`;
    }
  }
}, { passive: false });

progressBarContainer.addEventListener('touchend', () => {
  if (!isTouchInteraction) return;

  if (!hasMovedSlider) {
    timelineSlider.value = originalSliderValue;
    timelineFill.style.width = `${originalSliderValue}%`;
    isDraggingTimeline = false;
    isTouchInteraction = false;
    updateCustomControlsUI();
    return;
  }

  const pct = parseFloat(timelineSlider.value);
  const duration = playerManager.getDuration();
  if (duration > 0) {
    const seekTime = (pct / 100) * duration;
    performUserSeek(seekTime);
  }
  isDraggingTimeline = false;
  isTouchInteraction = false;
  resetSeekBaseline();
}, { passive: true });

progressBarContainer.addEventListener('touchcancel', () => {
  if (!isTouchInteraction) return;
  timelineSlider.value = originalSliderValue;
  timelineFill.style.width = `${originalSliderValue}%`;
  isDraggingTimeline = false;
  isTouchInteraction = false;
  updateCustomControlsUI();
}, { passive: true });



progressBarContainer.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; 

  isMouseDragging = true;
  hasMovedSlider = false;
  isDraggingTimeline = true;
  originalSliderValue = parseFloat(timelineSlider.value) || 0;
  touchStartX = e.clientX;
  touchStartY = e.clientY;

  const pct = getTimelinePercent(e.clientX);
  timelineSlider.value = pct;
  timelineFill.style.width = `${pct}%`;

  const duration = playerManager.getDuration();
  if (duration > 0) {
    const t = (pct / 100) * duration;
    document.getElementById('time-display').textContent =
      `${formatDuration(t)} / ${formatDuration(duration)}`;
  }
});

window.addEventListener('mousemove', (e) => {
  if (!isMouseDragging) return;

  if (!hasMovedSlider) {
    const d = Math.hypot(e.clientX - touchStartX, e.clientY - touchStartY);
    if (d > 5) hasMovedSlider = true;
  }

  if (hasMovedSlider) {
    const pct = getTimelinePercent(e.clientX);
    timelineSlider.value = pct;
    timelineFill.style.width = `${pct}%`;

    const duration = playerManager.getDuration();
    if (duration > 0) {
      const t = (pct / 100) * duration;
      document.getElementById('time-display').textContent =
        `${formatDuration(t)} / ${formatDuration(duration)}`;
    }
  }
});

window.addEventListener('mouseup', () => {
  if (!isMouseDragging) return;
  isMouseDragging = false;
  isDraggingTimeline = false;

  const pct = parseFloat(timelineSlider.value);
  const duration = playerManager.getDuration();
  if (duration > 0) {
    const seekTime = (pct / 100) * duration;
    performUserSeek(seekTime);
  }
  resetSeekBaseline();
});




const playerContainer = document.querySelector('.player-container');
let controlsTimeout = null;

function showControlsTemporarily() {
  playerContainer.classList.add('show-controls');
  if (controlsTimeout) clearTimeout(controlsTimeout);
  controlsTimeout = setTimeout(() => {
    
    if (playerManager.isPlaying()) {
      playerContainer.classList.remove('show-controls');
    }
  }, 5000);
}

const handleVideoTap = (e) => {
  
  if (e.target.closest('#player-controls-overlay') || 
      e.target.closest('#player-title-bar') || 
      e.target.closest('#player-placeholder')) {
    return;
  }
  
  e.preventDefault();
  
  if (playerContainer.classList.contains('show-controls')) {
    playerContainer.classList.remove('show-controls');
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
      controlsTimeout = null;
    }
  } else {
    showControlsTemporarily();
  }
};

if (isMobile()) {
  playerContainer.addEventListener('touchend', handleVideoTap, { passive: false });
} else {
  playerContainer.addEventListener('click', handleVideoTap);
}


if (!isMobile()) {
  let lastMouseX = 0;
  let lastMouseY = 0;

  playerContainer.addEventListener('mousemove', (e) => {
    const deltaX = Math.abs(e.screenX - lastMouseX);
    const deltaY = Math.abs(e.screenY - lastMouseY);
    
    
    if (deltaX > 4 || deltaY > 4) {
      showControlsTemporarily();
    }
    
    lastMouseX = e.screenX;
    lastMouseY = e.screenY;
  });
}
playerContainer.addEventListener('mouseleave', () => {
  if (playerManager.isPlaying()) {
    playerContainer.classList.remove('show-controls');
  }
});



window.addEventListener('touchmove', (e) => {
  let isScrollable = false;
  let parent = e.target;
  
  while (parent && parent !== document.body && parent !== document.documentElement) {
    
    const overflowY = window.getComputedStyle(parent).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
      isScrollable = true;
      break;
    }
    parent = parent.parentNode;
  }
  
  if (!isScrollable) {
    e.preventDefault();
  }
}, { passive: false });


initAvatarPicker();
initCropModal();


const _savedProfile = loadSavedProfile();
if (_savedProfile && _savedProfile.username) {
  applyProfile(_savedProfile);
}


document.getElementById('btn-logout').addEventListener('click', () => {
  if (confirm('Сбросить профиль и начать заново?')) {
    clearProfile();
  }
});


document.addEventListener('visibilitychange', () => {
  if (!document.hidden && roomId) {
    console.log('Tab became active. Requesting sync.');
    socket.emit('request-sync');
  }
});


if (isMobile()) {
  document.body.classList.add('is-mobile');
  debugLog("Global is-mobile class added to document body");
}

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    if (e.cancelable) e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });



