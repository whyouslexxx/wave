const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'public', 'assets');
const thumbsDir = path.join(assetsDir, 'thumbnails');
const avatarsDir = path.join(assetsDir, 'avatars');

fs.mkdirSync(thumbsDir, { recursive: true });
fs.mkdirSync(avatarsDir, { recursive: true });

const items = [
  { id: 'a9K0_5v8v8v', label: 'BrianMaps', initials: 'BM', bg: 'linear-gradient(135deg, #FF512F 0%, #DD2476 100%)', sub: 'ПОСЛЕДНИЙ ДЕНЬ В ШКОЛЕ' },
  { id: 'uB_Z_9J1Q2w', label: 'Kuplinov Play', initials: 'KP', bg: 'linear-gradient(135deg, #1D976C 0%, #93F9B9 100%)', sub: 'СМЕШНЫЕ ХОРРОРЫ' },
  { id: '1bFfV6d4yMo', label: 'Windy31', initials: 'W3', bg: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)', sub: 'РЕАЛЬНАЯ ЖИЗНЬ FNAF' },
  { id: 'K1b3qVj5uMo', label: 'Масленников', initials: 'ДМ', bg: 'linear-gradient(135deg, #7F00FF 0%, #E100FF 100%)', sub: 'НОЧЬ В ЗАМКЕ' },
  { id: 'u24-7wW7_y8', label: 'Wylsacom', initials: 'WY', bg: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)', sub: 'ОБЗОР IPHONE 16' },
  { id: 'bZ5N-0Sg7bE', label: 'MrMarmok', initials: 'MM', bg: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', sub: 'БАГИ И ПРИКОЛЫ' },
  { id: 'v1B2c3D4e5F', label: 'AcademeG', initials: 'AC', bg: 'linear-gradient(135deg, #3a7bd5 0%, #3a6073 100%)', sub: 'ПОНТОРЕЗ ТЕСТ-ДРАЙВ' },
  { id: 'y1Z2x3C4v5B', label: 'ВПИСКА', initials: 'ВП', bg: 'linear-gradient(135deg, #e55d87 0%, #5fc3e4 100%)', sub: 'МЕЛЛСТРОЙ ИНТЕРВЬЮ' }
];

function makeThumbSVG(item) {
  const gradId = `grad-${item.id}`;
  const match = item.bg.match(/#([A-Fa-f0-9]{6})/g) || ['#8b5cf6', '#ec4899'];
  const col1 = match[0];
  const col2 = match[1] || match[0];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${col1}" />
        <stop offset="100%" stop-color="${col2}" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="15" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#${gradId})" />
    <rect width="100%" height="100%" fill="rgba(0,0,0,0.12)" />
    <rect x="15" y="15" width="610" height="330" rx="16" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" />
    <circle cx="320" cy="180" r="55" fill="rgba(255,255,255,0.12)" />
    <circle cx="320" cy="180" r="45" fill="#ffffff" filter="url(#glow)" opacity="0.9" />
    <polygon points="310,160 340,180 310,200" fill="#0f172a" />
    <text x="320" y="295" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,sans-serif" font-size="28" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">${item.label.toUpperCase()}</text>
    <text x="320" y="325" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,sans-serif" font-size="14" font-weight="700" fill="rgba(255,255,255,0.7)" text-anchor="middle" letter-spacing="1">${item.sub}</text>
  </svg>`;
}

function makeAvatarSVG(item) {
  const gradId = `grad-av-${item.id}`;
  const match = item.bg.match(/#([A-Fa-f0-9]{6})/g) || ['#8b5cf6', '#ec4899'];
  const col1 = match[0];
  const col2 = match[1] || match[0];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${col1}" />
        <stop offset="100%" stop-color="${col2}" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#${gradId})" />
    <text x="50" y="64" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,sans-serif" font-size="42" font-weight="bold" fill="#ffffff" text-anchor="middle">${item.initials}</text>
  </svg>`;
}

items.forEach(item => {
  fs.writeFileSync(path.join(thumbsDir, `${item.id}.svg`), makeThumbSVG(item));
  fs.writeFileSync(path.join(avatarsDir, `${item.id}.svg`), makeAvatarSVG(item));
});

console.log('Successfully generated local SVG assets!');
