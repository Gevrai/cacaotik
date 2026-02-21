const fs = require('fs');
const { toCellKey } = require('./movement');

function flattenLayers(layers, parentPath = [], out = []) {
    for (const layer of layers || []) {
        const name = String(layer.name || '').trim();
        const path = [...parentPath, name.toLowerCase()];

        if (layer.type === 'group') {
            flattenLayers(layer.layers || [], path, out);
            continue;
        }

        out.push({
            layer,
            path,
        });
    }

    return out;
}

function isCollisionPath(pathParts) {
    const pathText = pathParts.join(' ');
    return (
        pathText.includes('border') ||
        pathText.includes('collision') ||
        pathText.includes('solid') ||
        pathText.includes('wall') ||
        pathText.includes('palisade')
    );
}

function addObjectRectToBlockedCells(blockedCells, object, tileWidth, tileHeight) {
    const x = Number(object.x) || 0;
    const y = Number(object.y) || 0;
    const width = Number(object.width) || 0;
    const height = Number(object.height) || 0;

    const minX = Math.floor(x / tileWidth);
    const minY = Math.floor(y / tileHeight);
    const maxX = Math.floor((x + Math.max(1, width) - 1) / tileWidth);
    const maxY = Math.floor((y + Math.max(1, height) - 1) / tileHeight);

    for (let gridY = minY; gridY <= maxY; gridY += 1) {
        for (let gridX = minX; gridX <= maxX; gridX += 1) {
            blockedCells.add(toCellKey(gridX, gridY));
        }
    }
}

function loadMapNavigation(mapFilePath) {
    const raw = fs.readFileSync(mapFilePath, 'utf8');
    const map = JSON.parse(raw);

    const gridCols = Number(map.width) || 20;
    const gridRows = Number(map.height) || 15;
    const flatLayers = flattenLayers(map.layers || []);

    const tileLayers = flatLayers.filter(entry => entry.layer.type === 'tilelayer');
    const collisionTileLayers = tileLayers.filter(entry => isCollisionPath(entry.path));
    const layersToUse = collisionTileLayers.length > 0 ? collisionTileLayers : tileLayers.slice(1);
    const blockedCells = new Set();

    for (const entry of layersToUse) {
        const { layer } = entry;
        if (!Array.isArray(layer.data)) continue;
        for (let index = 0; index < layer.data.length; index += 1) {
            const gid = Number(layer.data[index]) || 0;
            if (gid <= 0) continue;
            const x = index % gridCols;
            const y = Math.floor(index / gridCols);
            blockedCells.add(toCellKey(x, y));
        }
    }

    const tileWidth = Number(map.tilewidth) || 16;
    const tileHeight = Number(map.tileheight) || 16;
    const objectLayers = flatLayers.filter(entry => entry.layer.type === 'objectgroup');
    const collisionObjectLayers = objectLayers.filter(entry => isCollisionPath(entry.path));
    const objectLayersToUse = collisionObjectLayers.length > 0 ? collisionObjectLayers : objectLayers;

    for (const entry of objectLayersToUse) {
        const { layer } = entry;
        const objects = Array.isArray(layer.objects) ? layer.objects : [];
        for (const object of objects) {
            addObjectRectToBlockedCells(blockedCells, object, tileWidth, tileHeight);
        }
    }

    return {
        gridCols,
        gridRows,
        blockedCells,
    };
}

module.exports = {
    loadMapNavigation,
};
