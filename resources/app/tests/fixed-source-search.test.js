const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function extractFunction(startName, endName) {
  const start = html.indexOf(`function ${startName}`);
  const end = html.indexOf(`function ${endName}`, start + 1);
  assert.notStrictEqual(start, -1, `missing function ${startName}`);
  assert.notStrictEqual(end, -1, `missing following function ${endName}`);
  return html.slice(start, end);
}

test('adds a fixed Any Listen search tab', () => {
  assert(html.includes('id="search-mode-anysource"'));
  assert(html.includes("setSearchMode('anysource')"));
});

test('keeps anysource as an explicit search mode', () => {
  const setSearchMode = extractFunction('setSearchMode', 'podcastMetaText');
  const updateSearchModeTabs = extractFunction('updateSearchModeTabs', 'setSearchMode');
  assert(setSearchMode.includes("mode === 'anysource'"));
  assert(updateSearchModeTabs.includes("searchMode === 'anysource'"));
});

test('default all search does not query Any Listen sources', () => {
  const fetchMusicSearchResults = extractFunction('fetchMusicSearchResults', 'renderSongSearchResults');
  assert(fetchMusicSearchResults.includes("if (mode === 'anysource')"));
  const allSearchBlock = fetchMusicSearchResults.slice(fetchMusicSearchResults.indexOf('var result = await Promise.allSettled'));
  assert(!allSearchBlock.includes('/api/anysource/search?source=all'));
});

test('Any Listen playback failures use Any Listen internal fallback only', () => {
  const fallbackFunction = extractFunction('tryAutoPlaybackFallback', 'handlePlaybackUnavailable');
  assert(fallbackFunction.includes("return tryAnySourcePlaybackFallback(song"));
  const anyFallbackFunction = extractFunction('tryAnySourcePlaybackFallback', 'tryAutoPlaybackFallback');
  const anySearchFunction = extractFunction('searchAlternateAnySourceSong', 'markQueueItemPlaybackFailed');
  assert(anyFallbackFunction.includes("searchAlternateAnySourceSong(song"));
  assert(anySearchFunction.includes('/api/anysource/song/url'));
  assert(anyFallbackFunction.includes("songProviderKey(alternate) !== 'anysource'"));
});

test('Any Listen cover urls are not resized with NetEase query params', () => {
  const songCoverSrc = extractFunction('songCoverSrc', 'cssImageUrl');
  assert(songCoverSrc.includes("songProviderKey(song) === 'anysource'"));
  assert(songCoverSrc.includes('return cover'));
});

test('Any Listen playback URL cover is written back before visual load', () => {
  const playQueueAtBody = extractFunction('playQueueAt', 'renderMiniQueue');
  assert(playQueueAtBody.includes('isAnySourcePlayback && data.cover && !song.cover'));
  assert(playQueueAtBody.includes('song.anySourceMusicInfo.meta.picUrl = data.cover'));
  assert(playQueueAtBody.includes('loadCoverFromUrl(songCoverSrc(song, 400)'));
});

test('Wallpaper Engine background import has a visible entry point', () => {
  assert(html.includes('openWallpaperEnginePicker()'));
  assert(html.includes('壁纸引擎'));
});
