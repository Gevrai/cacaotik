const { WebSocketServer } = require('ws');
const path = require('path');
const { watchMaps } = require('./map-watcher');
const { applyPlayerMove } = require('./movement');
const { createActionManager } = require('./actions');

// Grid config
const GRID_SIZE = 32;
const GRID_COLS = 20;
const GRID_ROWS = 15;

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });
  const players = {}; // id -> { id, color, gridX, gridY, ws }
  let nextId = 1;

  function broadcast(payload) {
    const msg = JSON.stringify(payload);
    for (const ws of wss.clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  const actionManager = createActionManager({
    onActionChange: (action) => {
      broadcast({
        type: 'action_update',
        action,
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
        color: p.color,
        gridX: p.gridX,
        gridY: p.gridY,
      })),
    };
    broadcast(state);
  }

  wss.on('connection', (ws) => {
    const id = nextId++;
    const colorIndex = (Object.keys(players).length) % PLAYER_COLORS.length;
    const player = {
      id,
      color: PLAYER_COLORS[colorIndex],
      gridX: 2 + (colorIndex * 3),
      gridY: 2,
      ws,
    };
    players[id] = player;

    ws.send(JSON.stringify({
      type: 'init',
      id,
      color: player.color,
      gridX: player.gridX,
      gridY: player.gridY,
      gridSize: GRID_SIZE,
      gridCols: GRID_COLS,
      gridRows: GRID_ROWS,
    }));

    ws.send(JSON.stringify({
      type: 'action_update',
      action: actionManager.getPublicActionState(),
      serverTime: Date.now(),
    }));

    console.log(`Player ${id} connected. Total: ${Object.keys(players).length}`);
    broadcastState();
    actionManager.handleRosterChange(players);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'move') {
        const p = players[id];
        if (!p) return;
        const result = applyPlayerMove(p, msg.dir, {
          gridCols: GRID_COLS,
          gridRows: GRID_ROWS,
          playersById: players,
          blockedCells: null,
        });

        if (result.moved) {
          broadcastState();
        }
      }

      if (msg.type === 'interact') {
        actionManager.tryInteract(id, players);
      }
    });

    ws.on('close', () => {
      console.log(`Player ${id} disconnected.`);
      delete players[id];
      broadcastState();
      actionManager.handleRosterChange(players);
    });
  });

  // Watch assets/ for map changes and broadcast hot-reload to all clients
  const assetsDir = path.join(__dirname, '..', 'public', 'assets');
  watchMaps(assetsDir, (filename) => {
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
