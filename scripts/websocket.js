const { WebSocketServer } = require('ws');
const path = require('path');
const { watchMaps } = require('./map-watcher');

// Grid config
const GRID_SIZE = 32;
const GRID_COLS = 20;
const GRID_ROWS = 15;

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });
  const players = {}; // id -> { id, color, gridX, gridY, ws }
  let nextId = 1;

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
    for (const ws of wss.clients) {
      if (ws.readyState === 1) ws.send(JSON.stringify(state));
    }
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

    console.log(`Player ${id} connected. Total: ${Object.keys(players).length}`);
    broadcastState();

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'move') {
        const p = players[id];
        if (!p) return;
        const dir = msg.dir;
        let nx = p.gridX;
        let ny = p.gridY;
        if (dir === 'up') ny -= 1;
        if (dir === 'up-right') { nx += 1; ny -= 1; }
        if (dir === 'down') ny += 1;
        if (dir === 'down-right') { nx += 1; ny += 1; }
        if (dir === 'left') nx -= 1;
        if (dir === 'down-left') { nx -= 1; ny += 1; }
        if (dir === 'right') nx += 1;
        if (dir === 'up-left') { nx -= 1; ny -= 1; }

        nx = Math.max(0, Math.min(GRID_COLS - 1, nx));
        ny = Math.max(0, Math.min(GRID_ROWS - 1, ny));
        p.gridX = nx;
        p.gridY = ny;
        broadcastState();
      }
    });

    ws.on('close', () => {
      console.log(`Player ${id} disconnected.`);
      delete players[id];
      broadcastState();
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
