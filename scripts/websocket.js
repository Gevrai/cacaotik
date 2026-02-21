const { WebSocketServer } = require('ws');
const path = require('path');
const { watchMaps } = require('./map-watcher');
const { tickPlayer, velocityFromDirection, GRID_SIZE } = require('./movement');
const { createActionManager } = require('./actions');
const { loadMapNavigation } = require('./map-nav');

const CHARACTER_KEYS = ['red', 'blue', 'white', 'yellow'];
const CHARACTER_COLORS = {
  red: '#e74c3c',
  blue: '#3498db',
  white: '#ffffff',
  yellow: '#f1c40f',
};

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

  reloadNavigation();

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
      well: { x: 15, y: 2 },
      plants: { x: 8, y: 4 },
      harvest: { x: 9, y: 4 },
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

    let anyMoving = false;
    for (const player of Object.values(players)) {
      const hardBlocked = new Set(nav.blockedCells);
      for (const cell of dynamicPlantBlocked) hardBlocked.add(cell);

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

        tickPlayer(player, dt, {
          gridCols: nav.gridCols,
          gridRows: nav.gridRows,
          blockedCells: mergedBlocked,
        });
        anyMoving = true;
      }
    }

    if (anyMoving) {
      broadcastState();
      actionManager.handleRosterChange(players);
    }
  }, TICK_MS);

  wss.on('connection', (ws) => {
    const id = nextId++;
    let player = null; // assigned after 'join'

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'join' && !player) {
        // Assign character: honour preference if available, else first free
        const takenChars = Object.values(players).map(p => p.character);
        const preferred = msg.character;
        const char = (CHARACTER_KEYS.includes(preferred) && !takenChars.includes(preferred))
          ? preferred
          : CHARACTER_KEYS.find(c => !takenChars.includes(c));

        if (!char) {
          ws.send(JSON.stringify({ type: 'error', message: 'Partie pleine (max 4 joueurs).' }));
          ws.close();
          return;
        }

        const idx = CHARACTER_KEYS.indexOf(char);
        const startGridX = 2 + idx * 3;
        const startGridY = 2;
        player = {
          id,
          name: (msg.name || `Joueur ${id}`).slice(0, 16),
          character: char,
          color: CHARACTER_COLORS[char],
          x: startGridX * GRID_SIZE + GRID_SIZE / 2,
          y: startGridY * GRID_SIZE + GRID_SIZE / 2,
          vx: 0,
          vy: 0,
          gridX: startGridX,
          gridY: startGridY,
          ws,
        };
        players[id] = player;

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
