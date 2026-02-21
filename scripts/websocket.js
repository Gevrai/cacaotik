const { WebSocketServer } = require('ws');
const path = require('path');
const { watchMaps } = require('./map-watcher');
const { applyPlayerMove } = require('./movement');
const { createActionManager } = require('./actions');

// Grid config
const GRID_SIZE = 32;
const GRID_COLS = 20;
const GRID_ROWS = 15;

const CHARACTER_KEYS = ['red', 'blue', 'white', 'yellow'];
const CHARACTER_COLORS = {
  red:    '#e74c3c',
  blue:   '#3498db',
  white:  '#ffffff',
  yellow: '#f1c40f',
};

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });
  const players = {}; // id -> { id, name, character, color, gridX, gridY, ws }
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
        name: p.name,
        character: p.character,
        color: p.color,
        gridX: p.gridX,
        gridY: p.gridY,
      })),
    };
    broadcast(state);
  }

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
        player = {
          id,
          name: (msg.name || `Joueur ${id}`).slice(0, 16),
          character: char,
          color: CHARACTER_COLORS[char],
          gridX: 2 + idx * 3,
          gridY: 2,
          ws,
        };
        players[id] = player;

        ws.send(JSON.stringify({
          type: 'init',
          id,
          name: player.name,
          character: player.character,
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

        console.log(`Player ${id} (${player.name}, ${char}) joined. Total: ${Object.keys(players).length}`);
        broadcastState();
        actionManager.handleRosterChange(players);
        return;
      }

      if (!player) return; // ignore messages before join

      if (msg.type === 'move') {
        const result = applyPlayerMove(player, msg.dir, {
          gridCols: GRID_COLS,
          gridRows: GRID_ROWS,
          playersById: players,
          blockedCells: null,
        });
        if (result.moved) broadcastState();
      }

      if (msg.type === 'interact') {
        actionManager.tryInteract(id, players);
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
