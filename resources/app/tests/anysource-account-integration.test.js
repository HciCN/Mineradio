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

test('account modal exposes ANY local library entry', () => {
  assert(html.includes('id="user-provider-anysource"'));
  assert(html.includes('openAnySourceLibraryPanel()'));
  assert(html.includes("provider === 'anysource'"));
});

test('user playlist refresh still loads ANY playlists when music accounts are logged out', () => {
  const refreshUserPlaylists = extractFunction('refreshUserPlaylists', 'playlistPanelKey');
  const anysourceFetchIndex = refreshUserPlaylists.indexOf('/api/anysource/library/playlists');
  const loggedOutBranchStart = refreshUserPlaylists.indexOf('if (!hasLoggedInMusicAccount)');
  const loggedOutBranchEnd = refreshUserPlaylists.indexOf('  if (force)', loggedOutBranchStart);
  const loggedOutBranch = refreshUserPlaylists.slice(loggedOutBranchStart, loggedOutBranchEnd);
  assert.notStrictEqual(anysourceFetchIndex, -1, 'missing ANY playlist fetch');
  assert.notStrictEqual(loggedOutBranchStart, -1, 'missing logged-out branch');
  assert(!loggedOutBranch.includes('return;'), 'logged-out branch returns before ANY playlists can load');
  assert(loggedOutBranchEnd < anysourceFetchIndex, 'ANY playlist fetch should run after logged-out hint');
});

test('ANY playlist cards can open details and load into queue', () => {
  const renderUserPlaylistsList = extractFunction('renderUserPlaylistsList', 'renderMyPodcastCollections');
  const openPlaylistPanelDetail = extractFunction('openPlaylistPanelDetail', 'playPlaylistPanelDetail');
  const loadPlaylistIntoQueueById = extractFunction('loadPlaylistIntoQueueById', 'normalizePlaybackDurationSeconds');
  assert(renderUserPlaylistsList.includes("provider === 'anysource'"));
  assert(openPlaylistPanelDetail.includes('/api/anysource/library/playlist/tracks?id='));
  assert(loadPlaylistIntoQueueById.includes("indexOf('anysource:')"));
  assert(loadPlaylistIntoQueueById.includes('/api/anysource/library/playlist/tracks?id='));
});

test('heard ANY tracking keeps the account playlist cache in sync', () => {
  const recordAnySourceHeard = extractFunction('recordAnySourceHeard', 'updateLikeButtons');
  assert(recordAnySourceHeard.includes('anySourcePlaylists = anySourcePlaylists.map')); 
  assert(recordAnySourceHeard.includes('userPlaylists = userPlaylists')); 
});

test('ANY custom playlists expose a delete action', () => {
  const renderUserPlaylistsList = extractFunction('renderUserPlaylistsList', 'renderMyPodcastCollections');
  const clickHandler = html.slice(html.indexOf("document.getElementById('pl-list').addEventListener"), html.indexOf('var podcastListEl', html.indexOf("document.getElementById('pl-list').addEventListener")));
  assert(renderUserPlaylistsList.includes('data-anysource-delete-playlist'));
  assert(renderUserPlaylistsList.includes("provider === 'anysource' && pl.id !== 'heard'"));
  assert(clickHandler.includes('/api/anysource/library/playlist/delete'));
});
