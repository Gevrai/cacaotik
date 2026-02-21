const ACTION_LIBRARY = {
  fetch_water: {
    key: 'fetch_water',
    title: 'Aller chercher de l’eau',
    description: 'Place-toi à côté du puits puis interagis.',
    targetName: 'Puits',
    gridX: 18,
    gridY: 6,
    durationMs: 2500,
    requiresWater: false,
    grantsWater: true,
  },
  water_plants: {
    key: 'water_plants',
    title: 'Arroser les plantes',
    description: 'Arrose le potager (nécessite d’avoir pris de l’eau).',
    targetName: 'Potager',
    gridX: 8,
    gridY: 4,
    durationMs: 3000,
    requiresWater: true,
    grantsWater: false,
  },
};

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickRequesterAndActor(playerIds) {
  const requesterId = randomItem(playerIds);
  const actorPool = playerIds.filter(id => id !== requesterId);
  const actorId = randomItem(actorPool);
  return { requesterId, actorId };
}

function isAdjacentOrSame(player, x, y) {
  return Math.abs(player.gridX - x) <= 1 && Math.abs(player.gridY - y) <= 1;
}

function isAdjacent8(player, x, y) {
  const dx = Math.abs(player.gridX - x);
  const dy = Math.abs(player.gridY - y);
  return Math.max(dx, dy) === 1;
}

function createActionManager(options = {}) {
  const {
    actionLibrary = ACTION_LIBRARY,
    minPlayers = 2,
    stations = {},
    onActionChange = () => {},
    onActionResult = () => {},
  } = options;

  const wellStation = stations.well || { x: actionLibrary.fetch_water.gridX, y: actionLibrary.fetch_water.gridY };
  const plantsStation = stations.plants || { x: actionLibrary.water_plants.gridX, y: actionLibrary.water_plants.gridY };

  let currentAction = null;
  let nextActionId = 1;
  let completionTimeout = null;
  const hasWaterByPlayer = {};

  function clearCompletionTimer() {
    if (completionTimeout) {
      clearTimeout(completionTimeout);
      completionTimeout = null;
    }
  }

  function getPublicActionState() {
    if (!currentAction) return null;
    return {
      id: currentAction.id,
      key: currentAction.key,
      title: currentAction.title,
      description: currentAction.description,
      targetName: currentAction.targetName,
      gridX: currentAction.gridX,
      gridY: currentAction.gridY,
      durationMs: currentAction.durationMs,
      status: currentAction.status,
      requesterId: currentAction.requesterId,
      actorId: currentAction.actorId,
      startedAt: currentAction.startedAt,
    };
  }

  function emitActionChange() {
    onActionChange(getPublicActionState());
  }

  function spawnAction(playersById) {
    const playerIds = Object.keys(playersById).map(Number);
    if (playerIds.length < minPlayers) {
      if (currentAction) {
        clearCompletionTimer();
        currentAction = null;
        emitActionChange();
      }
      return;
    }
    if (currentAction) return;

    const playersWithWater = playerIds.filter(id => Boolean(hasWaterByPlayer[id]));
    const canWater = playersWithWater.length > 0;

    let actorId;
    let requesterId;

    if (canWater) {
      actorId = randomItem(playersWithWater);
      const requesterPool = playerIds.filter(id => id !== actorId);
      requesterId = randomItem(requesterPool);
    } else {
      const picked = pickRequesterAndActor(playerIds);
      requesterId = picked.requesterId;
      actorId = picked.actorId;
    }

    const def = canWater ? actionLibrary.water_plants : actionLibrary.fetch_water;
    const station = canWater ? plantsStation : wellStation;

    currentAction = {
      id: nextActionId++,
      key: def.key,
      title: def.title,
      description: def.description,
      targetName: def.targetName,
      gridX: station.x,
      gridY: station.y,
      durationMs: def.durationMs,
      requiresWater: def.requiresWater,
      grantsWater: def.grantsWater,
      requesterId,
      actorId,
      status: 'pending',
      startedAt: null,
    };

    emitActionChange();
  }

  function finishAction(playersById, success, message) {
    const finishedAction = currentAction;

    if (success && finishedAction) {
      if (finishedAction.key === 'fetch_water') {
        hasWaterByPlayer[finishedAction.actorId] = true;
      }
      if (finishedAction.key === 'water_plants') {
        hasWaterByPlayer[finishedAction.actorId] = false;
      }
    }

    clearCompletionTimer();
    currentAction = null;
    onActionResult({
      actionId: finishedAction ? finishedAction.id : null,
      success,
      message,
    });
    emitActionChange();
    spawnAction(playersById);
  }

  function handleRosterChange(playersById) {
    for (const playerId of Object.keys(hasWaterByPlayer)) {
      if (!playersById[playerId]) {
        delete hasWaterByPlayer[playerId];
      }
    }

    if (!currentAction) {
      spawnAction(playersById);
      return;
    }

    const actorStillConnected = Boolean(playersById[currentAction.actorId]);
    const requesterStillConnected = Boolean(playersById[currentAction.requesterId]);
    if (!actorStillConnected || !requesterStillConnected) {
      finishAction(playersById, false, 'Action annulée: joueur manquant.');
      return;
    }

    emitActionChange();
  }

  function tryInteract(playerId, playersById) {
    if (!currentAction) {
      onActionResult({
        actionId: null,
        success: false,
        message: 'Aucune action en cours.',
      });
      return;
    }

    if (currentAction.status !== 'pending') {
      onActionResult({
        actionId: currentAction.id,
        success: false,
        message: 'Action déjà en cours…',
      });
      return;
    }

    if (playerId !== currentAction.actorId) {
      onActionResult({
        actionId: currentAction.id,
        success: false,
        message: `Seul le joueur ${currentAction.actorId} peut faire cette action.`,
      });
      return;
    }

    const actor = playersById[playerId];
    if (!actor) return;

    if (currentAction.requiresWater && !hasWaterByPlayer[playerId]) {
      onActionResult({
        actionId: currentAction.id,
        success: false,
        message: 'Tu dois d’abord aller chercher de l’eau au puits.',
      });
      return;
    }

    const closeEnough = currentAction.key === 'fetch_water'
      ? isAdjacent8(actor, currentAction.gridX, currentAction.gridY)
      : isAdjacentOrSame(actor, currentAction.gridX, currentAction.gridY);
    if (!closeEnough) {
      onActionResult({
        actionId: currentAction.id,
        success: false,
        message: currentAction.key === 'fetch_water'
          ? `Place-toi sur une des 8 cases autour du ${currentAction.targetName} (${currentAction.gridX}, ${currentAction.gridY}) puis interagis.`
          : `Approche-toi de ${currentAction.targetName} (${currentAction.gridX}, ${currentAction.gridY}) puis interagis.`,
      });
      return;
    }

    currentAction.status = 'in_progress';
    currentAction.startedAt = Date.now();
    emitActionChange();

    const finishedTitle = currentAction.title;

    completionTimeout = setTimeout(() => {
      finishAction(playersById, true, `Action réussie: ${finishedTitle}.`);
    }, currentAction.durationMs);
  }

  return {
    getPublicActionState,
    handleRosterChange,
    tryInteract,
  };
}

module.exports = {
  ACTION_LIBRARY,
  createActionManager,
};
