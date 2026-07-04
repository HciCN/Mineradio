const assert = require('assert');

const {
  mapAnySourceMusicInfo,
  normalizeAnySourceUrlResponse,
  qualityToGdBr,
  buildGdApiQuery,
} = require('../anysource-gdstudio');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (err) {
    console.error('not ok - ' + name);
    console.error(err && err.stack || err);
    process.exitCode = 1;
  }
}

test('maps GDStudio musicInfo into Mineradio song shape', () => {
  const song = mapAnySourceMusicInfo({
    id: '184202',
    name: 'Test Song',
    singer: 'Alice / Bob',
    interval: '03:25',
    meta: {
      source: 'kuwo',
      albumName: 'Test Album',
      picUrl: 'https://img.example/cover.jpg',
      musicId: '184202',
      qualitys: { '320k': {}, flac: {} },
    },
  }, 'gdstudio');

  assert.strictEqual(song.provider, 'anysource');
  assert.strictEqual(song.source, 'gdstudio:kuwo');
  assert.strictEqual(song.anySourceProvider, 'gdstudio');
  assert.strictEqual(song.anySource, 'kuwo');
  assert.strictEqual(song.id, '184202');
  assert.strictEqual(song.name, 'Test Song');
  assert.strictEqual(song.artist, 'Alice / Bob');
  assert.strictEqual(song.album, 'Test Album');
  assert.strictEqual(song.cover, 'https://img.example/cover.jpg');
  assert.strictEqual(song.duration, 205000);
});

test('maps Any source cover from alternate metadata fields', () => {
  const song = mapAnySourceMusicInfo({
    id: 'cover-fallback',
    name: 'Cover Fallback',
    singer: 'Alice',
    pic: 'https://img.example/root-pic.jpg',
    meta: {
      source: 'kuwo',
      albumName: 'Test Album',
    },
  }, 'gdstudio');

  assert.strictEqual(song.cover, 'https://img.example/root-pic.jpg');
});

test('normalizes playable GDStudio URL responses with cover', () => {
  const result = normalizeAnySourceUrlResponse({
    url: 'https://music-api.gdstudio.xyz/song.mp3',
    quality: '320k',
    cover: 'https://img.example/cover.jpg',
  }, { source: 'kuwo', requestedQuality: 'exhigh' });

  assert.strictEqual(result.cover, 'https://img.example/cover.jpg');
});

test('normalizes playable GDStudio URL responses', () => {
  const result = normalizeAnySourceUrlResponse({
    url: 'https://music-api.gdstudio.xyz/song.mp3',
    quality: 'flac',
  }, { source: 'kuwo', requestedQuality: 'lossless' });

  assert.strictEqual(result.provider, 'anysource');
  assert.strictEqual(result.playable, true);
  assert.strictEqual(result.url, 'https://music-api.gdstudio.xyz/song.mp3');
  assert.strictEqual(result.level, 'lossless');
});

test('marks placeholder URL responses as unavailable', () => {
  const result = normalizeAnySourceUrlResponse({
    url: './gdstudio-no-url',
    quality: '128k',
  }, { source: 'kuwo', requestedQuality: 'hires' });

  assert.strictEqual(result.playable, false);
  assert.strictEqual(result.url, '');
  assert.strictEqual(result.reason, 'url_unavailable');
});

test('maps Mineradio quality names to GDStudio bitrate requests', () => {
  assert.strictEqual(qualityToGdBr('jymaster'), 999);
  assert.strictEqual(qualityToGdBr('hires'), 999);
  assert.strictEqual(qualityToGdBr('lossless'), 740);
  assert.strictEqual(qualityToGdBr('exhigh'), 320);
  assert.strictEqual(qualityToGdBr('standard'), 128);
});

test('builds encoded GDStudio query strings without empty values', () => {
  assert.strictEqual(
    buildGdApiQuery({ types: 'search', name: '周杰伦 晴天', empty: '', nil: null }),
    'types=search&name=%E5%91%A8%E6%9D%B0%E4%BC%A6%20%E6%99%B4%E5%A4%A9'
  );
});
