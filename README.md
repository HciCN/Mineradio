# Mineradio

Mineradio is an immersive Electron music player with online music search, playback, lyrics, cover-driven particle visuals, and source extension support.

This repository contains the editable app source extracted under `resources/app`.

## Development Notes

- App server entry: `resources/app/server.js`
- Electron desktop entry: `resources/app/desktop/main.js`
- Main frontend: `resources/app/public/index.html`
- Any Listen / GDStudio source adapter: `resources/app/anysource-gdstudio.js`
- Regression tests: `resources/app/tests`

## Checks

```powershell
node resources\app\tests\anysource-gdstudio.test.js
node resources\app\tests\fixed-source-search.test.js
node --check resources\app\server.js
node --check resources\app\anysource-gdstudio.js
```
