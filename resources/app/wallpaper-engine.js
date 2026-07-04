const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VIDEO_MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
};

function normalizeLocalPath(input) {
  if (!input) return '';
  return path.normalize(String(input).replace(/\//g, path.sep));
}

function defaultEngineRoot() {
  const candidates = [
    process.env.WALLPAPER_ENGINE_DIR,
    'E:\\Steam\\steamapps\\common\\wallpaper_engine',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine',
    'D:\\Steam\\steamapps\\common\\wallpaper_engine',
  ].filter(Boolean);
  return candidates.find(dir => {
    try { return fs.existsSync(dir); } catch (e) { return false; }
  }) || candidates[0];
}

function defaultWorkshopRoot(engineRoot) {
  if (process.env.WALLPAPER_ENGINE_WORKSHOP_DIR) return process.env.WALLPAPER_ENGINE_WORKSHOP_DIR;
  const normalized = normalizeLocalPath(engineRoot || '');
  const marker = path.join('steamapps', 'common', 'wallpaper_engine');
  const lower = normalized.toLowerCase();
  const idx = lower.lastIndexOf(marker.toLowerCase());
  if (idx >= 0) {
    return path.join(normalized.slice(0, idx), 'steamapps', 'workshop', 'content', '431960');
  }
  return 'E:\\Steam\\steamapps\\workshop\\content\\431960';
}

function isPlayableWallpaperVideo(file) {
  return !!VIDEO_MIME[path.extname(String(file || '')).toLowerCase()];
}

function mimeForVideo(file) {
  return VIDEO_MIME[path.extname(String(file || '')).toLowerCase()] || 'application/octet-stream';
}

function readJson(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

function cacheEntriesFrom(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.wallpapers)) return raw.wallpapers;
  if (raw.wallpapers && typeof raw.wallpapers === 'object') return Object.keys(raw.wallpapers).map(key => {
    const item = raw.wallpapers[key] || {};
    if (item && typeof item === 'object' && !item.workshopid) item.workshopid = key;
    return item;
  });
  return Object.keys(raw).map(key => {
    const item = raw[key] || {};
    if (item && typeof item === 'object' && !item.workshopid) item.workshopid = key;
    return item;
  }).filter(item => item && typeof item === 'object');
}

function hashId(file) {
  return crypto.createHash('sha1').update(normalizeLocalPath(file).toLowerCase()).digest('hex').slice(0, 16);
}

function isPathInside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function kindFor(entry, file) {
  const explicit = String(entry.type || '').toLowerCase();
  if (explicit === 'video') return 'video';
  if (explicit === 'scene') return 'scene';
  if (explicit === 'web') return 'web';
  if (isPlayableWallpaperVideo(file)) return 'video';
  if (path.basename(file).toLowerCase() === 'scene.pkg') return 'scene';
  return explicit || 'unknown';
}

function normalizePreview(preview) {
  const raw = String(preview || '');
  const internal = raw.match(/^https?:\/\/wpx\.internal\/__file\/(.+)$/i);
  if (internal) {
    try { return normalizeLocalPath(decodeURIComponent(internal[1])); } catch (e) { return ''; }
  }
  return raw;
}

function listWallpaperEngineItems(options) {
  options = options || {};
  const engineRoot = normalizeLocalPath(options.engineRoot || defaultEngineRoot());
  const workshopRoot = normalizeLocalPath(options.workshopRoot || defaultWorkshopRoot(engineRoot));
  const cacheFile = options.cacheFile || path.join(engineRoot, 'bin', 'workshopcache.json');
  const entries = cacheEntriesFrom(readJson(cacheFile));
  const seen = new Set();
  const items = [];

  entries.forEach(entry => {
    const file = normalizeLocalPath(entry.file || entry.project || '');
    if (!file || seen.has(file.toLowerCase())) return;
    seen.add(file.toLowerCase());
    const kind = kindFor(entry, file);
    const playable = kind === 'video' && isPlayableWallpaperVideo(file) && isPathInside(file, workshopRoot) && fs.existsSync(file);
    const id = hashId(file);
    items.push({
      id,
      workshopId: String(entry.workshopid || entry.id || ''),
      title: String(entry.title || path.basename(path.dirname(file)) || path.basename(file) || 'Wallpaper Engine'),
      type: String(entry.type || kind),
      kind,
      fileName: path.basename(file),
      size: Number(entry.filesize || 0),
      sizeLabel: String(entry.filesizelabel || ''),
      tags: String(entry.tags || ''),
      preview: normalizePreview(entry.previewsmall || entry.preview || ''),
      playable,
      reason: playable ? '' : (kind === 'scene' ? 'scene_pkg' : 'unsupported_media'),
      mediaUrl: playable ? '/api/wallpaper-engine/media?id=' + encodeURIComponent(id) : '',
    });
  });

  items.sort((a, b) => Number(b.playable) - Number(a.playable) || a.title.localeCompare(b.title));
  return items;
}

function resolveWallpaperEngineMedia(id, options) {
  options = options || {};
  const engineRoot = normalizeLocalPath(options.engineRoot || defaultEngineRoot());
  const workshopRoot = normalizeLocalPath(options.workshopRoot || defaultWorkshopRoot(engineRoot));
  const cacheFile = options.cacheFile || path.join(engineRoot, 'bin', 'workshopcache.json');
  const entries = cacheEntriesFrom(readJson(cacheFile));
  const match = entries.find(entry => hashId(entry.file || entry.project || '') === String(id || ''));
  if (!match) throw new Error('Wallpaper Engine media not found');
  const file = normalizeLocalPath(match.file || match.project || '');
  if (!isPathInside(file, workshopRoot) || !fs.existsSync(file) || !isPlayableWallpaperVideo(file)) {
    throw new Error('Wallpaper Engine media is not playable');
  }
  return {
    path: file,
    mime: mimeForVideo(file),
    title: String(match.title || path.basename(file)),
  };
}

module.exports = {
  defaultEngineRoot,
  defaultWorkshopRoot,
  isPlayableWallpaperVideo,
  listWallpaperEngineItems,
  resolveWallpaperEngineMedia,
};
