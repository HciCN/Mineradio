const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PLAYLIST_ID = 'heard';
const DEFAULT_PLAYLIST_NAME = '我听过的 ANY';

function now() {
  return Date.now();
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(String(text || '')); }
  catch (e) { return fallback; }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function stableId(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16);
}

function songKey(song) {
  song = song || {};
  if (song.id) return [song.anySourceProvider || 'gdstudio', song.anySource || '', song.id || ''].join('|');
  return [
    song.anySourceProvider || 'gdstudio',
    song.anySource || '',
    song.id || '',
    song.name || '',
    song.artist || '',
  ].join('|');
}

function normalizeAnySourceLibrarySong(song) {
  song = song || {};
  const anySource = String(song.anySource || '').trim();
  const id = String(song.id || song.anySourceMusicInfo && (song.anySourceMusicInfo.id || song.anySourceMusicInfo.meta && song.anySourceMusicInfo.meta.musicId) || '').trim();
  const name = String(song.name || '').trim();
  if (!anySource || !id || !name) return null;
  const source = /^gdstudio:/.test(String(song.source || '')) ? song.source : 'gdstudio:' + anySource;
  return {
    provider: 'anysource',
    type: 'song',
    source,
    id,
    anySourceProvider: song.anySourceProvider || 'gdstudio',
    anySource,
    anySourceLabel: song.anySourceLabel || anySource || 'GDStudio',
    anySourceMusicInfo: song.anySourceMusicInfo || null,
    name,
    artist: String(song.artist || '').trim(),
    artists: Array.isArray(song.artists) ? song.artists : String(song.artist || '').split(/\s*\/\s*/).filter(Boolean).map(name => ({ name })),
    album: String(song.album || '').trim(),
    cover: String(song.cover || '').trim(),
    duration: Number(song.duration || 0) || 0,
    fee: 0,
  };
}

function emptyStore() {
  const ts = now();
  return {
    version: 1,
    playlists: [{
      id: DEFAULT_PLAYLIST_ID,
      name: DEFAULT_PLAYLIST_NAME,
      createdAt: ts,
      updatedAt: ts,
      trackKeys: [],
    }],
    songs: {},
  };
}

function publicPlaylist(pl, songs) {
  const keys = Array.isArray(pl.trackKeys) ? pl.trackKeys : [];
  const firstSong = keys.map(key => songs[key]).find(Boolean) || null;
  return {
    id: pl.id,
    name: pl.name,
    provider: 'anysource',
    source: 'anysource',
    creator: 'ANY 本地',
    cover: firstSong && firstSong.cover || '',
    trackCount: keys.filter(key => songs[key]).length,
    playCount: 0,
    subscribed: false,
    specialType: pl.id === DEFAULT_PLAYLIST_ID ? 1 : 0,
    createdAt: pl.createdAt || 0,
    updatedAt: pl.updatedAt || 0,
  };
}

function createAnySourceLibrary(filePath) {
  function readStore() {
    if (!fs.existsSync(filePath)) return emptyStore();
    const store = safeJsonParse(fs.readFileSync(filePath, 'utf8'), null) || emptyStore();
    if (!Array.isArray(store.playlists)) store.playlists = [];
    if (!store.songs || typeof store.songs !== 'object') store.songs = {};
    if (!store.playlists.some(pl => pl.id === DEFAULT_PLAYLIST_ID)) {
      store.playlists.unshift(emptyStore().playlists[0]);
    }
    return store;
  }

  function writeStore(store) {
    ensureDir(filePath);
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
  }

  function listPlaylists() {
    const store = readStore();
    return store.playlists.map(pl => publicPlaylist(pl, store.songs));
  }

  function createPlaylist(name) {
    name = String(name || '').trim();
    if (!name) throw new Error('Missing playlist name');
    const store = readStore();
    const existing = store.playlists.find(pl => pl.name.toLowerCase() === name.toLowerCase());
    if (existing) return publicPlaylist(existing, store.songs);
    const ts = now();
    const playlist = {
      id: 'any-' + stableId(name + '|' + ts),
      name,
      createdAt: ts,
      updatedAt: ts,
      trackKeys: [],
    };
    store.playlists.push(playlist);
    writeStore(store);
    return publicPlaylist(playlist, store.songs);
  }

  function addSongToPlaylist(playlistId, song) {
    const normalized = normalizeAnySourceLibrarySong(song);
    if (!normalized) throw new Error('Invalid ANY song');
    const store = readStore();
    const playlist = store.playlists.find(pl => pl.id === playlistId);
    if (!playlist) throw new Error('Playlist not found');
    const key = songKey(normalized);
    if (!store.songs[key]) store.songs[key] = normalized;
    if (!Array.isArray(playlist.trackKeys)) playlist.trackKeys = [];
    if (!playlist.trackKeys.includes(key)) playlist.trackKeys.unshift(key);
    playlist.updatedAt = now();
    writeStore(store);
    return { success: true, playlist: publicPlaylist(playlist, store.songs), song: store.songs[key], key };
  }

  function recordHeard(song) {
    return addSongToPlaylist(DEFAULT_PLAYLIST_ID, song);
  }

  function getPlaylistTracks(playlistId) {
    const store = readStore();
    const playlist = store.playlists.find(pl => pl.id === playlistId);
    if (!playlist) return [];
    return (playlist.trackKeys || []).map(key => store.songs[key]).filter(Boolean);
  }

  function getPlaylist(playlistId) {
    const store = readStore();
    const playlist = store.playlists.find(pl => pl.id === playlistId);
    return playlist ? publicPlaylist(playlist, store.songs) : null;
  }

  function deletePlaylist(playlistId) {
    playlistId = String(playlistId || '').trim();
    if (!playlistId) throw new Error('Missing playlist id');
    if (playlistId === DEFAULT_PLAYLIST_ID) throw new Error('Cannot delete default playlist');
    const store = readStore();
    const index = store.playlists.findIndex(pl => pl.id === playlistId);
    if (index < 0) throw new Error('Playlist not found');
    const playlist = store.playlists.splice(index, 1)[0];
    writeStore(store);
    return { success: true, playlist: publicPlaylist(playlist, store.songs) };
  }

  return {
    listPlaylists,
    createPlaylist,
    addSongToPlaylist,
    recordHeard,
    getPlaylistTracks,
    getPlaylist,
    deletePlaylist,
  };
}

module.exports = {
  DEFAULT_PLAYLIST_ID,
  DEFAULT_PLAYLIST_NAME,
  createAnySourceLibrary,
  normalizeAnySourceLibrarySong,
};
