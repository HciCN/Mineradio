const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createAnySourceLibrary,
  normalizeAnySourceLibrarySong,
} = require('../anysource-library');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function tempLibrary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-anysource-'));
  return createAnySourceLibrary(path.join(dir, 'library.json'));
}

function gdSong(overrides) {
  return Object.assign({
    provider: 'anysource',
    source: 'gdstudio:kuwo',
    id: '12345',
    anySource: 'kuwo',
    anySourceProvider: 'gdstudio',
    anySourceLabel: 'GD 酷我音乐',
    name: '迟迟',
    artist: '薛之谦',
    album: '天外来物',
    cover: 'https://img.example/cover.jpg',
    duration: 255000,
    anySourceMusicInfo: {
      id: '12345',
      name: '迟迟',
      singer: '薛之谦',
      interval: '04:15',
      meta: { source: 'kuwo', musicId: '12345', albumName: '天外来物' },
    },
  }, overrides || {});
}

test('normalizes GDStudio songs for local ANY persistence', () => {
  const song = normalizeAnySourceLibrarySong(gdSong());
  assert.strictEqual(song.provider, 'anysource');
  assert.strictEqual(song.anySource, 'kuwo');
  assert.strictEqual(song.source, 'gdstudio:kuwo');
  assert.strictEqual(song.name, '迟迟');
});

test('creates default heard playlist and custom playlists', () => {
  const library = tempLibrary();
  const initial = library.listPlaylists();
  assert.strictEqual(initial.length, 1);
  assert.strictEqual(initial[0].id, 'heard');
  assert.strictEqual(initial[0].name, '我听过的 ANY');

  const created = library.createPlaylist('车里听');
  assert.strictEqual(created.name, '车里听');
  assert.strictEqual(library.listPlaylists().length, 2);
});

test('adds songs to ANY playlists with dedupe', () => {
  const library = tempLibrary();
  library.addSongToPlaylist('heard', gdSong());
  library.addSongToPlaylist('heard', gdSong({ name: '迟迟 Live' }));
  const tracks = library.getPlaylistTracks('heard');
  assert.strictEqual(tracks.length, 1);
  assert.strictEqual(tracks[0].name, '迟迟');
});

test('records listened ANY songs into heard playlist', () => {
  const library = tempLibrary();
  library.recordHeard(gdSong({ id: '1', name: 'A' }));
  library.recordHeard(gdSong({ id: '2', name: 'B' }));
  const tracks = library.getPlaylistTracks('heard');
  assert.deepStrictEqual(tracks.map(song => song.name), ['B', 'A']);
  assert.strictEqual(library.listPlaylists()[0].trackCount, 2);
});

test('deletes custom ANY playlists without removing heard songs', () => {
  const library = tempLibrary();
  const created = library.createPlaylist('To delete');
  const song = gdSong({ id: '42', name: 'Keep Me' });
  library.recordHeard(song);
  library.addSongToPlaylist(created.id, song);
  const result = library.deletePlaylist(created.id);
  assert.strictEqual(result.success, true);
  assert.strictEqual(library.getPlaylist(created.id), null);
  assert.deepStrictEqual(library.getPlaylistTracks('heard').map(item => item.name), ['Keep Me']);
});

test('does not delete the default heard ANY playlist', () => {
  const library = tempLibrary();
  assert.throws(() => library.deletePlaylist('heard'), /Cannot delete default playlist/);
  assert.strictEqual(library.getPlaylist('heard').id, 'heard');
});
