const GRID_SIZE = 32;
const PLAYER_SPEED = 96; // px/s — 3 tiles/s
const PLAYER_RADIUS = 10; // px — hitbox half-size

const DIRECTION_VECS = {
  up:           { x:  0, y: -1 },
  'up-right':   { x:  1, y: -1 },
  right:        { x:  1, y:  0 },
  'down-right': { x:  1, y:  1 },
  down:         { x:  0, y:  1 },
  'down-left':  { x: -1, y:  1 },
  left:         { x: -1, y:  0 },
  'up-left':    { x: -1, y: -1 },
};

function toCellKey(x, y) {
  return `${x},${y}`;
}

// Returns true if the given pixel point is inside a blocked or out-of-bounds cell
function isPointBlocked(px, py, blockedCells, gridCols, gridRows) {
  const cx = Math.floor(px / GRID_SIZE);
  const cy = Math.floor(py / GRID_SIZE);
  if (cx < 0 || cy < 0 || cx >= gridCols || cy >= gridRows) return true;
  return blockedCells ? blockedCells.has(toCellKey(cx, cy)) : false;
}

// Returns true if the player's bounding box (square hitbox) overlaps any blocked cell
function isPositionBlocked(x, y, blockedCells, gridCols, gridRows) {
  const corners = [
    [x - PLAYER_RADIUS, y - PLAYER_RADIUS],
    [x + PLAYER_RADIUS, y - PLAYER_RADIUS],
    [x - PLAYER_RADIUS, y + PLAYER_RADIUS],
    [x + PLAYER_RADIUS, y + PLAYER_RADIUS],
  ];
  for (const [px, py] of corners) {
    if (isPointBlocked(px, py, blockedCells, gridCols, gridRows)) return true;
  }
  return false;
}

// Advance player position by dt milliseconds, with axis-separated collision sliding
function tickPlayer(player, dtMs, context) {
  const { gridCols, gridRows, blockedCells } = context;
  const dt = dtMs / 1000;

  const dx = player.vx * dt;
  const dy = player.vy * dt;

  // Try X axis
  let nx = player.x + dx;
  let ny = player.y;
  if (isPositionBlocked(nx, ny, blockedCells, gridCols, gridRows)) {
    nx = player.x;
  }

  // Try Y axis
  ny = player.y + dy;
  if (isPositionBlocked(nx, ny, blockedCells, gridCols, gridRows)) {
    ny = player.y;
  }

  // Clamp to map bounds
  const minX = PLAYER_RADIUS;
  const maxX = gridCols * GRID_SIZE - PLAYER_RADIUS;
  const minY = PLAYER_RADIUS;
  const maxY = gridRows * GRID_SIZE - PLAYER_RADIUS;
  player.x = Math.max(minX, Math.min(maxX, nx));
  player.y = Math.max(minY, Math.min(maxY, ny));

  // Keep derived grid cell in sync (used by action system)
  player.gridX = Math.floor(player.x / GRID_SIZE);
  player.gridY = Math.floor(player.y / GRID_SIZE);
}

// Convert a direction string to a velocity vector {vx, vy}
function velocityFromDirection(dir) {
  const vec = DIRECTION_VECS[dir];
  if (!vec) return { vx: 0, vy: 0 };
  const len = Math.hypot(vec.x, vec.y);
  return {
    vx: (vec.x / len) * PLAYER_SPEED,
    vy: (vec.y / len) * PLAYER_SPEED,
  };
}

module.exports = { tickPlayer, velocityFromDirection, toCellKey, GRID_SIZE, PLAYER_SPEED };
