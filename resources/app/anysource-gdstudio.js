const crypto = require('crypto');

const MAIN_API_URL = 'https://music-api.gdstudio.xyz/api.php';
const ORG_API_URL = 'https://music.gdstudio.org/api.php';
const PLAYER_JS_URL = 'https://music.gdstudio.org/js/player.js';
const TIME_URL = 'https://music.gdstudio.org/time';
const HOST = 'music.gdstudio.org';
const NO_URL_PLACEHOLDER = './gdstudio-no-url';
const NO_PIC_PLACEHOLDER = './gdstudio-no-pic';

const MAIN_API_SOURCES = new Set(['netease', 'kuwo', 'joox', 'bilibili']);
const SOURCE_LABELS = {
  netease: 'GD 网易云',
  kuwo: 'GD 酷我',
  joox: 'GD JOOX',
  tencent: 'GD QQ',
  tidal: 'GD TIDAL',
  qobuz: 'GD QOBUZ',
  bilibili: 'GD 哔哩哔哩',
  apple: 'GD Apple Music',
  ytmusic: 'GD YouTube Music',
  spotify: 'GD Spotify',
};

let cachedVersion = '';
let cachedPaddedVersion = '';
const picUrlCache = new Map();
const picGettingPromises = new Map();

function md5(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex');
}

function padVersion(version) {
  return String(version || '').split('.').map(part => part.padStart(2, '0')).join('');
}

function shouldUseMainApi(source) {
  return MAIN_API_SOURCES.has(String(source || ''));
}

function buildGdApiQuery(obj) {
  return Object.keys(obj || {})
    .filter(key => obj[key] !== null && obj[key] !== undefined && obj[key] !== '')
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(String(obj[key])))
    .join('&');
}

async function fetchText(url, opts) {
  const response = await fetch(url, opts || {});
  const text = await response.text();
  if (!response.ok) {
    const err = new Error('HTTP ' + response.status + ' from ' + url);
    err.statusCode = response.status;
    err.body = text;
    throw err;
  }
  return text;
}

async function getGdVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    const body = await fetchText(PLAYER_JS_URL, { headers: gdHeaders(), signal: AbortSignal.timeout(10000) });
    const match = body.match(/version\s*:\s*"([^"]+)"/);
    if (match) {
      cachedVersion = match[1];
      cachedPaddedVersion = padVersion(cachedVersion);
      return cachedVersion;
    }
  } catch (err) {
    console.warn('[AnySource:GD] version lookup failed:', err.message);
  }
  return '';
}

async function getGdServerTimestamp() {
  try {
    const body = await fetchText(TIME_URL, {
      headers: gdHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    const timestamp = parseInt(String(body).trim(), 10);
    return Number.isFinite(timestamp) ? timestamp : Date.now();
  } catch (err) {
    return Date.now();
  }
}

async function buildGdSign(keyword) {
  await getGdVersion();
  if (!cachedPaddedVersion) throw new Error('GDStudio version unavailable');
  const ts = await getGdServerTimestamp();
  const raw = HOST + '|' + cachedPaddedVersion + '|' + String(ts).slice(0, 9) + '|' + encodeURIComponent(keyword);
  return md5(raw).slice(-8).toUpperCase();
}

function gdHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://music.gdstudio.org/',
  };
}

async function gdApiCall(params, signKey) {
  const source = String(params && params.source || '');
  const requestParams = shouldUseMainApi(source)
    ? params
    : { ...params, s: await buildGdSign(signKey || params.id || params.name || '') };
  const query = buildGdApiQuery(requestParams);
  const text = shouldUseMainApi(source)
    ? await fetchText(MAIN_API_URL + '?' + query, { method: 'GET', signal: AbortSignal.timeout(15000) })
    : await fetchText(ORG_API_URL, {
        method: 'POST',
        headers: { ...gdHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: query,
        signal: AbortSignal.timeout(15000),
      });
  return JSON.parse(text);
}

function parseArtist(artist) {
  if (Array.isArray(artist)) return artist.filter(Boolean).join(' / ');
  return String(artist || '')
    .split(/[、;,_/，]/)
    .map(item => item.trim())
    .filter(Boolean)
    .join(' / ');
}

function formatInterval(seconds) {
  const value = Number(seconds || 0);
  if (!value) return '';
  const h = Math.floor(value / 3600);
  const m = Math.floor(value % 3600 / 60);
  const s = Math.floor(value % 60);
  if (h > 0) return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function parseDurationMs(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value > 10000 ? Math.round(value) : Math.round(value * 1000);
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    return n > 10000 ? Math.round(n) : Math.round(n * 1000);
  }
  const parts = text.split(':').map(part => Number(part));
  if (parts.some(part => !Number.isFinite(part))) return 0;
  let seconds = 0;
  parts.forEach(part => { seconds = seconds * 60 + part; });
  return Math.round(seconds * 1000);
}

function gdBrToMineradioQuality(br) {
  br = Number(br) || 0;
  if (br >= 999) return 'hires';
  if (br >= 740) return 'lossless';
  if (br >= 320) return 'exhigh';
  return 'standard';
}

function gdQualityToMineradio(value) {
  const raw = String(value || '').toLowerCase();
  if (raw === 'flac24bit' || raw === 'master' || raw === 'wav' || raw === 'ape') return 'hires';
  if (raw === 'flac') return 'lossless';
  if (raw === '320k') return 'exhigh';
  return 'standard';
}

function qualityToGdBr(value) {
  const raw = String(value || '').toLowerCase();
  if (raw === 'jymaster' || raw === 'hires') return 999;
  if (raw === 'lossless') return 740;
  if (raw === 'exhigh') return 320;
  if (raw === 'standard') return 128;
  return 999;
}

function firstHttpUrl() {
  for (const value of arguments) {
    const text = String(value || '').trim();
    if (!text || text === NO_PIC_PLACEHOLDER) continue;
    if (/^https?:\/\//i.test(text)) return text;
  }
  return '';
}

function buildPicCacheKey(source, musicId) {
  return String(source || '') + '|' + String(musicId || '');
}

function normalizePicUrl(data) {
  return firstHttpUrl(data && data.url, data && data.pic, data && data.picUrl, data && data.cover, data && data.coverUrl);
}

async function fetchAnySourceMusicPic(source, musicInfo) {
  musicInfo = musicInfo || {};
  const meta = musicInfo.meta || {};
  const musicId = String(musicInfo.id || meta.musicId || '');
  const cacheKey = buildPicCacheKey(source, musicId);
  const existing = firstHttpUrl(meta.picUrl, musicInfo.pic, musicInfo.picUrl, musicInfo.cover, musicInfo.coverUrl);
  if (existing) {
    if (cacheKey.trim()) picUrlCache.set(cacheKey, existing);
    return existing;
  }
  if (!source || !musicId) return '';
  const cached = picUrlCache.get(cacheKey);
  if (cached) return cached;
  const getting = picGettingPromises.get(cacheKey);
  if (getting) return getting;
  const promise = (async () => {
    let picId = String(meta._picId || musicInfo.pic_id || '');
    if (!picId) {
      try {
        const artist = String(musicInfo.singer || musicInfo.artist || '').trim();
        const queryName = [musicInfo.name || '', artist].filter(Boolean).join(' ').trim();
        const searchData = queryName ? await gdApiCall({ types: 'search', count: '1', source, pages: '1', name: queryName }, queryName) : [];
        const first = Array.isArray(searchData) ? searchData[0] : null;
        picId = String(first && first.pic_id || '');
      } catch (err) {
        picId = '';
      }
    }
    if (!picId) return '';
    const data = await gdApiCall({ types: 'pic', source, id: picId, size: '500' }, picId);
    const url = normalizePicUrl(data);
    if (url) picUrlCache.set(cacheKey, url);
    return url;
  })().finally(() => picGettingPromises.delete(cacheKey));
  picGettingPromises.set(cacheKey, promise);
  return promise;
}

async function hydrateAnySourceCover(song) {
  if (!song || song.cover) return song;
  try {
    const picUrl = await fetchAnySourceMusicPic(song.anySource, song.anySourceMusicInfo);
    if (picUrl) {
      song.cover = picUrl;
      if (song.anySourceMusicInfo && song.anySourceMusicInfo.meta) song.anySourceMusicInfo.meta.picUrl = picUrl;
    }
  } catch (err) {}
  return song;
}

async function hydrateAnySourceCovers(songs, maxCount) {
  const limit = Math.max(0, Math.min(Number(maxCount) || songs.length, songs.length));
  await Promise.all(songs.slice(0, limit).map(song => hydrateAnySourceCover(song)));
  return songs;
}

function buildAnySourceMusicInfo(item, source) {
  item = item || {};
  const duration = item.duration || item.interval;
  const cover = firstHttpUrl(
    item.pic,
    item.picUrl,
    item.cover,
    item.coverUrl,
    item.albumPic,
    item.album && (item.album.pic || item.album.picUrl || item.album.cover || item.album.coverUrl)
  );
  return {
    id: String(item.id || ''),
    name: String(item.name || ''),
    singer: parseArtist(item.artist),
    interval: formatInterval(duration),
    isLocal: false,
    meta: {
      musicId: String(item.id || ''),
      albumName: String(item.album || ''),
      picUrl: cover,
      source,
      _picId: item.pic_id ? String(item.pic_id) : '',
    },
  };
}

function mapAnySourceMusicInfo(musicInfo, provider) {
  musicInfo = musicInfo || {};
  const meta = musicInfo.meta || {};
  const source = String(meta.source || musicInfo.source || '');
  const id = String(musicInfo.id || meta.musicId || '');
  const cover = firstHttpUrl(
    meta.picUrl,
    meta.pic,
    meta.cover,
    meta.coverUrl,
    musicInfo.pic,
    musicInfo.picUrl,
    musicInfo.cover,
    musicInfo.coverUrl,
    musicInfo.albumPic,
    musicInfo.album && (musicInfo.album.pic || musicInfo.album.picUrl || musicInfo.album.cover || musicInfo.album.coverUrl)
  );
  return {
    provider: 'anysource',
    source: (provider || 'gdstudio') + ':' + source,
    type: 'song',
    id,
    anySourceProvider: provider || 'gdstudio',
    anySource: source,
    anySourceLabel: SOURCE_LABELS[source] || source || 'Any Listen',
    anySourceMusicInfo: musicInfo,
    name: String(musicInfo.name || ''),
    artist: String(musicInfo.singer || musicInfo.artist || ''),
    artists: String(musicInfo.singer || musicInfo.artist || '').split(/\s*\/\s*/).filter(Boolean).map(name => ({ name })),
    album: String(meta.albumName || ''),
    cover,
    duration: parseDurationMs(musicInfo.interval || musicInfo.duration),
    fee: 0,
  };
}

function normalizeAnySourceUrlResponse(data, options) {
  options = options || {};
  data = data || {};
  const rawUrl = String(data.url || '');
  const playable = !!rawUrl && rawUrl !== NO_URL_PLACEHOLDER && rawUrl !== NO_PIC_PLACEHOLDER && /^https?:\/\//i.test(rawUrl);
  const level = gdQualityToMineradio(data.quality || options.requestedQuality);
  if (!playable) {
    return {
      provider: 'anysource',
      url: '',
      playable: false,
      trial: false,
      reason: 'url_unavailable',
      message: 'Any Listen 源没有返回可播放地址',
      source: options.source || '',
      requestedQuality: options.requestedQuality || '',
    };
  }
  return {
    provider: 'anysource',
    url: rawUrl,
    playable: true,
    trial: false,
    level,
    quality: data.quality || level,
    source: options.source || '',
    requestedQuality: options.requestedQuality || '',
    cover: firstHttpUrl(data.cover, data.picUrl, data.pic) || '',
  };
}

async function searchAnySource(keywords, options) {
  options = options || {};
  const source = String(options.source || 'kuwo');
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 20));
  const q = String(keywords || '').trim();
  if (!q) return [];
  const data = await gdApiCall({
    types: 'search',
    count: String(limit),
    source,
    pages: String(Math.max(1, Number(options.page) || 1)),
    name: q,
  }, q);
  const list = Array.isArray(data) ? data : [];
  const songs = list.map(item => mapAnySourceMusicInfo(buildAnySourceMusicInfo(item, source), 'gdstudio')).filter(song => song.id && song.name);
  return hydrateAnySourceCovers(songs, Math.min(limit, 8));
}

async function getAnySourceSongUrl(song, quality) {
  song = song || {};
  const source = String(song.anySource || '').trim();
  const musicInfo = song.anySourceMusicInfo || buildAnySourceMusicInfo({
    id: song.id,
    name: song.name,
    artist: song.artist,
    album: song.album,
    duration: song.duration && song.duration > 10000 ? song.duration / 1000 : song.duration,
  }, source);
  const musicId = String(musicInfo.id || musicInfo.meta && musicInfo.meta.musicId || song.id || '');
  if (!source || !musicId) {
    return normalizeAnySourceUrlResponse(null, { source, requestedQuality: quality });
  }
  let lastError = null;
  const preferred = qualityToGdBr(quality);
  const brs = [preferred, 999, 740, 320, 192, 128].filter((br, index, arr) => arr.indexOf(br) === index);
  for (const br of brs) {
    try {
      const data = await gdApiCall({ types: 'url', source, id: musicId, br: String(br) }, musicId);
      if (data && data.url) {
        const cover = await fetchAnySourceMusicPic(source, musicInfo).catch(() => '');
        return normalizeAnySourceUrlResponse({
          url: String(data.url),
          quality: gdBrToMineradioQuality(data.br != null ? Number(data.br) : br),
          cover,
        }, { source, requestedQuality: quality });
      }
    } catch (err) {
      lastError = err;
    }
  }
  const result = normalizeAnySourceUrlResponse(null, { source, requestedQuality: quality });
  if (lastError) result.error = lastError.message;
  return result;
}

async function getAnySourceLyric(song) {
  song = song || {};
  const source = String(song.anySource || '').trim();
  const musicId = String(song.id || song.anySourceMusicInfo && song.anySourceMusicInfo.id || '');
  if (!source || !musicId) return { lyric: '', tlyric: '', source: 'anysource' };
  try {
    const data = await gdApiCall({ types: 'lyric', source, id: musicId }, musicId);
    return {
      lyric: data && data.lyric ? String(data.lyric) : '',
      tlyric: data && data.tlyric ? String(data.tlyric) : '',
      source: 'anysource:gdstudio',
    };
  } catch (err) {
    return { lyric: '', tlyric: '', source: 'anysource:gdstudio', error: err.message };
  }
}

module.exports = {
  SOURCE_LABELS,
  buildGdApiQuery,
  qualityToGdBr,
  mapAnySourceMusicInfo,
  normalizeAnySourceUrlResponse,
  fetchAnySourceMusicPic,
  hydrateAnySourceCover,
  searchAnySource,
  getAnySourceSongUrl,
  getAnySourceLyric,
};
