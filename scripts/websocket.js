const { WebSocketServer } = require('ws');
const path = require('path');
const { watchMaps } = require('./map-watcher');
const { tickPlayer, velocityFromDirection, GRID_SIZE } = require('./movement');
const { createActionManager } = require('./actions');
const { loadMapNavigation } = require('./map-nav');

// Load water cells by reading the 'mare' tile layer from basemap1.tmj
function loadWaterCells(tmjPath) {
  const fs = require('fs');
  const map = JSON.parse(fs.readFileSync(tmjPath, 'utf8'));

  // Flatten nested layer groups to find any tilelayer named with 'mare'
  function collectLayers(layers) {
    const result = [];
    for (const l of layers) {
      if (l.type === 'tilelayer') result.push(l);
      else if (l.layers) result.push(...collectLayers(l.layers));
    }
    return result;
  }

  const mareLayers = collectLayers(map.layers).filter(l => l.name.toLowerCase().includes('mare'));
  const cells = new Set();
  for (const layer of mareLayers) {
    const w = layer.width;
    layer.data.forEach((tile, i) => {
      if (tile !== 0) {
        const gx = i % w;
        const gy = Math.floor(i / w);
        cells.add(`${gx},${gy}`);
      }
    });
  }
  return cells;
}

let WATER_CELLS = new Set();

function isInWater(player) {
  return WATER_CELLS.has(`${player.gridX},${player.gridY}`);
}

const CHARACTER_KEYS = ['red', 'blue', 'white', 'yellow'];
const CHARACTER_COLORS = {
  red: '#e74c3c',
  blue: '#3498db',
  white: '#ffffff',
  yellow: '#f1c40f',
};

const LLAMA_STATIONS = [{ x: 23, y: 15 }, { x: 23, y: 16 }];
const RABBIT_STATIONS = [{ x: 20, y: 14 }, { x: 21, y: 15 }, { x: 22, y: 14 }];

const TICK_MS = 20; // server game loop interval (~20fps)

function toCellKey(x, y) {
  return `${x},${y}`;
}

function findNearestFreeCell(startX, startY, blockedCells, gridCols, gridRows) {
  const startKey = toCellKey(startX, startY);
  if (!blockedCells.has(startKey)) {
    return { x: startX, y: startY };
  }

  const visited = new Set([startKey]);
  const queue = [{ x: startX, y: startY }];
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    for (const dir of directions) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (nx < 0 || ny < 0 || nx >= gridCols || ny >= gridRows) continue;

      const key = toCellKey(nx, ny);
      if (visited.has(key)) continue;
      visited.add(key);

      if (!blockedCells.has(key)) {
        return { x: nx, y: ny };
      }

      queue.push({ x: nx, y: ny });
    }
  }

  return null;
}

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });
  const players = {}; // id -> { id, name, character, color, x, y, vx, vy, gridX, gridY, ws }
  let nextId = 1;
  const assetsDir = path.join(__dirname, '..', 'public', 'assets');
  const mapFilePath = path.join(assetsDir, 'basemap2.tmj');
  const map1FilePath = path.join(assetsDir, 'basemap1.tmj');

  let nav;

  function reloadNavigation() {
    try {
      nav = loadMapNavigation(mapFilePath);
      console.log(`[websocket] navigation loaded from basemap2.tmj (${nav.gridCols}x${nav.gridRows}, blocked=${nav.blockedCells.size})`);
    } catch (error) {
      nav = {
        gridCols: 30,
        gridRows: 20,
        blockedCells: new Set(),
      };
      console.warn('[websocket] failed to load map navigation, using fallback 30x20:', error.message);
    }
  }

  function reloadWaterCells() {
    try {
      WATER_CELLS = loadWaterCells(map1FilePath);
      console.log(`[websocket] water cells loaded from basemap1.tmj (${WATER_CELLS.size} cells)`);
    } catch (error) {
      console.warn('[websocket] failed to load water cells from basemap1.tmj:', error.message);
    }
  }

  reloadNavigation();
  reloadWaterCells();

  function broadcast(payload) {
    const msg = JSON.stringify(payload);
    for (const ws of wss.clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  const actionManager = createActionManager({
    stations: {
      house: { x: 2, y: 2 },
      seed: { x: 7, y: 4 },
      houseZone: { minX: 3, maxX: 5, minY: 1, maxY: 3 },
      well: { x: 15, y: 2 },
      plants: { x: 8, y: 4 },
      harvest: { x: 9, y: 4 },
      llamas: LLAMA_STATIONS,
      rabbits: RABBIT_STATIONS,
    },
    onActionChange: (actionState) => {
      broadcast({
        type: 'action_update',
        ...actionState,
        serverTime: Date.now(),
      });
    },
    onActionResult: (result) => {
      broadcast({
        type: 'action_result',
        ...result,
      });
    },
  });

  function broadcastState() {
    const state = {
      type: 'state',
      players: Object.values(players).map(p => ({
        id: p.id,
        name: p.name,
        character: p.character,
        color: p.color,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        gridX: p.gridX,
        gridY: p.gridY,
        inWater: isInWater(p),
      })),
    };
    broadcast(state);
  }

  // ── Game loop ──────────────────────────────────────────────────────────────
  let lastTick = Date.now();

  setInterval(() => {
    const now = Date.now();
    const dt = now - lastTick;
    lastTick = now;

    const dynamicPlantBlocked = actionManager.getBlockedPlantCellKeys();
    const dynamicLlamaBlocked = actionManager.getBlockedLlamaCellKeys();
    const dynamicHouseBlocked = actionManager.getBlockedHouseCellKeys();

    let anyMoving = false;
    for (const player of Object.values(players)) {
      const hardBlocked = new Set(nav.blockedCells);
      for (const cell of dynamicPlantBlocked) hardBlocked.add(cell);
      for (const cell of dynamicLlamaBlocked) hardBlocked.add(cell);
      for (const cell of dynamicHouseBlocked) hardBlocked.add(cell);

      const currentGridX = Math.floor(player.x / GRID_SIZE);
      const currentGridY = Math.floor(player.y / GRID_SIZE);
      if (hardBlocked.has(toCellKey(currentGridX, currentGridY))) {
        const freeCell = findNearestFreeCell(currentGridX, currentGridY, hardBlocked, nav.gridCols, nav.gridRows);
        if (freeCell) {
          player.gridX = freeCell.x;
          player.gridY = freeCell.y;
          player.x = freeCell.x * GRID_SIZE + GRID_SIZE / 2;
          player.y = freeCell.y * GRID_SIZE + GRID_SIZE / 2;
        }
      }

      if (player.vx !== 0 || player.vy !== 0) {
        const mergedBlocked = new Set(nav.blockedCells);
        for (const cell of dynamicPlantBlocked) {
          if (cell !== `${player.gridX},${player.gridY}`) {
            mergedBlocked.add(cell);
          }
        }
        for (const cell of dynamicLlamaBlocked) {
          mergedBlocked.add(cell);
        }
        for (const cell of dynamicHouseBlocked) {
          mergedBlocked.add(cell);
        }

        tickPlayer(player, dt, {
          gridCols: nav.gridCols,
          gridRows: nav.gridRows,
          blockedCells: mergedBlocked,
          speedMultiplier: isInWater(player) ? 0.45 : 1,
        });
        anyMoving = true;
      }
    }

    if (anyMoving) {
      broadcastState();
      actionManager.handleRosterChange(players);
    }
  }, TICK_MS);

  // reconnectMap: reconnectId -> player snapshot (persists across disconnects)
  const reconnectMap = {};

  wss.on('connection', (ws) => {
    const id = nextId++;
    let player = null; // assigned after 'join'

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'join' && !player) {
        const reconnectId = typeof msg.reconnectId === 'string' ? msg.reconnectId.slice(0, 64) : null;
        const snapshot = reconnectId ? reconnectMap[reconnectId] : null;

        let char, playerName, x, y, gridX, gridY;

        if (snapshot) {
          // Restore previous slot if character is still free (or was theirs)
          const takenChars = Object.values(players).map(p => p.character);
          char = !takenChars.includes(snapshot.character) ? snapshot.character
            : (CHARACTER_KEYS.find(c => !takenChars.includes(c)) ?? CHARACTER_KEYS[(id - 1) % CHARACTER_KEYS.length]);
          playerName = snapshot.name;
          x = snapshot.x; y = snapshot.y;
          gridX = snapshot.gridX; gridY = snapshot.gridY;
          console.log(`Player ${id} (${playerName}) reconnected via reconnectId.`);
        } else {
          // New player
          const takenChars = Object.values(players).map(p => p.character);
          const preferred = msg.character;
          char = (CHARACTER_KEYS.includes(preferred) && !takenChars.includes(preferred))
            ? preferred
            : (CHARACTER_KEYS.find(c => !takenChars.includes(c))
              ?? CHARACTER_KEYS[(id - 1) % CHARACTER_KEYS.length]);
          playerName = (msg.name || `Joueur ${id}`).slice(0, 16);
          const startGridX = 2 + ((id - 1) % 8) * 2;
          const startGridY = 2;
          x = startGridX * GRID_SIZE + GRID_SIZE / 2;
          y = startGridY * GRID_SIZE + GRID_SIZE / 2;
          gridX = startGridX; gridY = startGridY;
        }

        player = {
          id,
          name: playerName,
          character: char,
          color: CHARACTER_COLORS[char],
          x, y,
          vx: 0,
          vy: 0,
          gridX, gridY,
          ws,
          reconnectId,
        };
        players[id] = player;
        if (reconnectId) reconnectMap[reconnectId] = player;

        ws.send(JSON.stringify({
          type: 'init',
          id,
          name: player.name,
          character: player.character,
          color: player.color,
          x: player.x,
          y: player.y,
          gridX: player.gridX,
          gridY: player.gridY,
          gridSize: GRID_SIZE,
          gridCols: nav.gridCols,
          gridRows: nav.gridRows,
        }));

        ws.send(JSON.stringify({
          type: 'action_update',
          ...actionManager.getPublicActionState(players),
          serverTime: Date.now(),
        }));

        console.log(`Player ${id} (${player.name}, ${char}) joined. Total: ${Object.keys(players).length}`);
        broadcastState();
        actionManager.handleRosterChange(players);
        return;
      }

      if (!player) return; // ignore messages before join

      if (msg.type === 'move') {
        const { vx, vy } = velocityFromDirection(msg.dir);
        player.vx = vx;
        player.vy = vy;
      }

      if (msg.type === 'stop') {
        player.vx = 0;
        player.vy = 0;
      }

      if (msg.type === 'interact') {
        actionManager.tryInteract(id, players, msg.key);
      }
    });

    ws.on('close', () => {
      if (player) {
        console.log(`Player ${player.id} (${player.name}) disconnected.`);
        // Save position snapshot for reconnect (keep for 10 minutes)
        if (player.reconnectId) {
          reconnectMap[player.reconnectId] = {
            name: player.name, character: player.character,
            x: player.x, y: player.y, gridX: player.gridX, gridY: player.gridY,
          };
          setTimeout(() => { delete reconnectMap[player.reconnectId]; }, 10 * 60 * 1000);
        }
        delete players[player.id];
        broadcastState();
        actionManager.handleRosterChange(players);
      }
    });
  });

  // Watch assets/ for map changes and broadcast hot-reload to all clients
  watchMaps(assetsDir, (filename) => {
    if (filename === 'basemap2.tmj') {
      reloadNavigation();
    }
    if (filename === 'basemap1.tmj') {
      reloadWaterCells();
    }
    const msg = JSON.stringify({ type: 'reload_map', file: filename });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg);
    }
  });

  return wss;
}

module.exports = {
  setupWebSocket,
};
