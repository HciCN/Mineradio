const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  listWallpaperEngineItems,
  resolveWallpaperEngineMedia,
  isPlayableWallpaperVideo,
} = require('../wallpaper-engine');

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

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-'));
  const steamRoot = path.join(root, 'Steam');
  const workshopRoot = path.join(steamRoot, 'steamapps', 'workshop', 'content', '431960');
  const engineRoot = path.join(steamRoot, 'steamapps', 'common', 'wallpaper_engine');
  const cacheDir = path.join(engineRoot, 'bin');
  const videoDir = path.join(workshopRoot, '100');
  const sceneDir = path.join(workshopRoot, '200');
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(sceneDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(videoDir, 'loop.mp4'), 'fake-video');
  fs.writeFileSync(path.join(sceneDir, 'scene.pkg'), 'fake-scene');
  fs.writeFileSync(path.join(cacheDir, 'workshopcache.json'), JSON.stringify({
    100: {
      title: 'Video Wall',
      type: 'Video',
      file: path.join(videoDir, 'loop.mp4'),
      preview: path.join(videoDir, 'preview.jpg'),
    },
    200: {
      title: 'Scene Wall',
      type: 'Scene',
      file: path.join(sceneDir, 'scene.pkg'),
    },
  }));
  return { root, engineRoot, workshopRoot };
}

test('recognizes browser-playable Wallpaper Engine video files', () => {
  assert.strictEqual(isPlayableWallpaperVideo('demo.mp4'), true);
  assert.strictEqual(isPlayableWallpaperVideo('demo.webm'), true);
  assert.strictEqual(isPlayableWallpaperVideo('demo.mov'), true);
  assert.strictEqual(isPlayableWallpaperVideo('scene.pkg'), false);
});

test('lists video wallpapers as directly playable and scene wallpapers as export-only', () => {
  const fixture = makeFixture();
  const items = listWallpaperEngineItems({
    engineRoot: fixture.engineRoot,
    workshopRoot: fixture.workshopRoot,
  });

  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].title, 'Video Wall');
  assert.strictEqual(items[0].kind, 'video');
  assert.strictEqual(items[0].playable, true);
  assert.strictEqual(items[0].mediaUrl, '/api/wallpaper-engine/media?id=' + encodeURIComponent(items[0].id));
  assert.strictEqual(items[1].title, 'Scene Wall');
  assert.strictEqual(items[1].kind, 'scene');
  assert.strictEqual(items[1].playable, false);
});

test('resolves media only for playable files inside the Wallpaper Engine workshop', () => {
  const fixture = makeFixture();
  const items = listWallpaperEngineItems({
    engineRoot: fixture.engineRoot,
    workshopRoot: fixture.workshopRoot,
  });
  const playable = items.find(item => item.playable);
  const resolved = resolveWallpaperEngineMedia(playable.id, {
    engineRoot: fixture.engineRoot,
    workshopRoot: fixture.workshopRoot,
  });

  assert.strictEqual(resolved.path.endsWith(path.join('100', 'loop.mp4')), true);
  assert.strictEqual(resolved.mime, 'video/mp4');
  assert.throws(() => resolveWallpaperEngineMedia(items.find(item => !item.playable).id, {
    engineRoot: fixture.engineRoot,
    workshopRoot: fixture.workshopRoot,
  }), /not playable/i);
  assert.throws(() => resolveWallpaperEngineMedia('missing', {
    engineRoot: fixture.engineRoot,
    workshopRoot: fixture.workshopRoot,
  }), /not found/i);
});
