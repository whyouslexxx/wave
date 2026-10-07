const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const videos = [
  { id: 'P1_TGLibPR0', name: 'Anastasiz' },
  { id: 'bg-Y0I8rRFc', name: 'Kuplinov' },
  { id: 'ovIxZKkdqSY', name: 'Windy31' },
  { id: 'WZmyc5iLCtY', name: 'Maslennikov' },
  { id: 'JrGvbX5vV9c', name: 'Wylsacom' },
  { id: 'XEZPStdB78s', name: 'Marmok' },
  { id: 'UfCL9xrZRS8', name: 'Deepins' },
  { id: 'ngNl_XaIOs8', name: 'Vpiska' }
];

const thumbnailsDir = path.join(__dirname, '..', 'public', 'assets', 'thumbnails');
const avatarsDir = path.join(__dirname, '..', 'public', 'assets', 'avatars');

// Ensure directories exist
if (!fs.existsSync(thumbnailsDir)) fs.mkdirSync(thumbnailsDir, { recursive: true });
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

function curlDownload(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} -> ${destPath}`);
    execFile('curl.exe', [
      '-sL', '--max-time', '15',
      '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      '-e', 'https://www.youtube.com/',
      '-o', destPath,
      url
    ], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function curlGetText(url) {
  return new Promise((resolve, reject) => {
    execFile('curl.exe', [
      '-sL', '--max-time', '15',
      '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      '-e', 'https://www.youtube.com/',
      url
    ], (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.toString('utf8'));
    });
  });
}

async function run() {
  for (const v of videos) {
    console.log(`\n=== Processing Video ${v.id} (${v.name}) ===`);
    
    // 1. Download thumbnail
    const thumbUrl = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
    const thumbDest = path.join(thumbnailsDir, `${v.id}.jpg`);
    try {
      await curlDownload(thumbUrl, thumbDest);
      console.log(`Saved thumbnail for ${v.id}`);
    } catch (err) {
      console.error(`Failed to download thumbnail for ${v.id}:`, err.message);
    }

    // 2. Fetch channel page to get avatar URL
    try {
      const oembedText = await curlGetText(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${v.id}`);
      const oembed = JSON.parse(oembedText);
      const authorUrl = oembed.author_url;
      if (!authorUrl) throw new Error('No author URL in oembed');

      console.log(`Author URL: ${authorUrl}`);
      const channelHtml = await curlGetText(authorUrl);

      let avatarUrl = null;
      const m1 = channelHtml.match(/"avatar":\{"thumbnails":\[.*?"url":"(https:\/\/yt3\.ggpht\.com\/[^"]+)"/);
      if (m1) avatarUrl = m1[1];
      if (!avatarUrl) {
        const all = channelHtml.match(/https:\/\/yt3\.ggpht\.com\/[^"\\=\s]+/g);
        if (all && all.length > 0) avatarUrl = all[0];
      }

      if (!avatarUrl) throw new Error('No avatar URL found in channel page HTML');

      // Request larger size (240x240)
      avatarUrl = avatarUrl.replace(/=s\d+/, '=s240').replace(/=w\d+-h\d+/, '=s240');

      const avatarDest = path.join(avatarsDir, `${v.id}.jpg`);
      await curlDownload(avatarUrl, avatarDest);
      console.log(`Saved avatar for ${v.id}`);
    } catch (err) {
      console.error(`Failed to download avatar for ${v.id}:`, err.message);
      // Create a fallback SVG avatar
      const avatarDestSvg = path.join(avatarsDir, `${v.id}.svg`);
      const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];
      const color = colors[v.id.charCodeAt(0) % colors.length];
      const letter = v.name.charAt(0).toUpperCase();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${color}"/><text x="50" y="63" font-size="44" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="bold" fill="#ffffff" text-anchor="middle">${letter}</text></svg>`;
      fs.writeFileSync(avatarDestSvg, svg);
      console.log(`Saved fallback SVG avatar for ${v.id}`);
    }
  }
  console.log('\n=== Finished asset download! ===');
}

run();
