const fs = require('fs');
const path = require('path');

/**
 * Watch assetsDir for .tmj file changes.
 * Calls onChanged(filename) with a 150ms debounce to handle Tiled's atomic saves.
 */
function watchMaps(assetsDir, onChanged) {
  if (!fs.existsSync(assetsDir)) {
    console.log(`[map-watcher] assets dir not found, skipping watch: ${assetsDir}`);
    return;
  }

  let debounce = null;

  fs.watch(assetsDir, { recursive: false }, (event, filename) => {
    if (!filename || !filename.endsWith('.tmj')) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      console.log(`[map-watcher] ${filename} changed — broadcasting reload`);
      onChanged(filename);
    }, 150);
  });

  console.log(`[map-watcher] watching ${assetsDir}`);
}

module.exports = { watchMaps };
