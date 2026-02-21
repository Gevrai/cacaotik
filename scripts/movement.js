const DIRECTION_DELTAS = {
  up: { x: 0, y: -1 },
  'up-right': { x: 1, y: -1 },
  right: { x: 1, y: 0 },
  'down-right': { x: 1, y: 1 },
  down: { x: 0, y: 1 },
  'down-left': { x: -1, y: 1 },
  left: { x: -1, y: 0 },
  'up-left': { x: -1, y: -1 },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toCellKey(x, y) {
  return `${x},${y}`;
}

function isBlockedByPlayer(x, y, playersById, ignoreId) {
  for (const player of Object.values(playersById)) {
    if (player.id === ignoreId) continue;
    if (player.gridX === x && player.gridY === y) return true;
  }
  return false;
}

function applyPlayerMove(player, direction, context) {
  const {
    gridCols,
    gridRows,
    playersById,
    blockedCells,
  } = context;

  const delta = DIRECTION_DELTAS[direction];
  if (!delta) {
    return {
      moved: false,
      gridX: player.gridX,
      gridY: player.gridY,
      reason: 'invalid_direction',
    };
  }

  const targetX = clamp(player.gridX + delta.x, 0, gridCols - 1);
  const targetY = clamp(player.gridY + delta.y, 0, gridRows - 1);

  const isDiagonal = delta.x !== 0 && delta.y !== 0;
  if (isDiagonal && blockedCells) {
    const sideAX = player.gridX + delta.x;
    const sideAY = player.gridY;
    const sideBX = player.gridX;
    const sideBY = player.gridY + delta.y;
    if (
      blockedCells.has(toCellKey(sideAX, sideAY)) ||
      blockedCells.has(toCellKey(sideBX, sideBY))
    ) {
      return {
        moved: false,
        gridX: player.gridX,
        gridY: player.gridY,
        reason: 'blocked_corner',
      };
    }
  }

  if (blockedCells && blockedCells.has(toCellKey(targetX, targetY))) {
    return {
      moved: false,
      gridX: player.gridX,
      gridY: player.gridY,
      reason: 'blocked_cell',
    };
  }

  if (playersById && isBlockedByPlayer(targetX, targetY, playersById, player.id)) {
    return {
      moved: false,
      gridX: player.gridX,
      gridY: player.gridY,
      reason: 'blocked_player',
    };
  }

  const moved = targetX !== player.gridX || targetY !== player.gridY;
  if (moved) {
    player.gridX = targetX;
    player.gridY = targetY;
  }

  return {
    moved,
    gridX: player.gridX,
    gridY: player.gridY,
    reason: moved ? 'ok' : 'same_cell',
  };
}

module.exports = {
  DIRECTION_DELTAS,
  applyPlayerMove,
  toCellKey,
};
