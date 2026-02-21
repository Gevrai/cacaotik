const ACTION_LIBRARY = {
  plant_seed: {
    key: 'plant_seed',
    title: 'Planter une graine',
    targetName: 'Zone marron',
    durationMs: 3000,
  },
  fetch_water: {
    key: 'fetch_water',
    title: 'Prendre de l’eau',
    targetName: 'Puits',
    durationMs: 3000,
  },
  water_plants: {
    key: 'water_plants',
    title: 'Arroser',
    targetName: 'Plante',
    durationMs: 3000,
  },
};

const BROWN_ZONE = {
  minX: 2,
  maxX: 10,
  minY: 8,
  maxY: 14,
};

function isAdjacent8(player, x, y) {
  const dx = Math.abs(player.gridX - x);
  const dy = Math.abs(player.gridY - y);
  return Math.max(dx, dy) === 1;
}

function isInZone(player, zone) {
  return (
    player.gridX >= zone.minX
    && player.gridX <= zone.maxX
    && player.gridY >= zone.minY
    && player.gridY <= zone.maxY
  );
}

function createActionManager(options = {}) {
  const {
    actionLibrary = ACTION_LIBRARY,
    stations = {},
    onActionChange = () => {},
    onActionResult = () => {},
  } = options;

  const stationByKey = {
    well: stations.well || { x: 15, y: 2 },
  };
  const brownZone = stations.brownZone || BROWN_ZONE;

  const inProgressByPlayer = {};
  const completionTimeoutByPlayer = {};
  const hasWaterByPlayer = {};
  let playersSnapshot = {};

  let nextActionId = 1;
  let nextPlantId = 1;
  const plants = [];

  function clearCompletionTimer(playerId) {
    if (completionTimeoutByPlayer[playerId]) {
      clearTimeout(completionTimeoutByPlayer[playerId]);
      delete completionTimeoutByPlayer[playerId];
    }
  }

  function getPlantAt(x, y) {
    return plants.find(plant => plant.gridX === x && plant.gridY === y) || null;
  }

  function getNearestPlantForPlayer(player) {
    for (const plant of plants) {
      if (isAdjacent8(player, plant.gridX, plant.gridY) || (player.gridX === plant.gridX && player.gridY === plant.gridY)) {
        return plant;
      }
    }
    return null;
  }

  function toAction(def, extras = {}) {
    return {
      id: extras.id || null,
      key: def.key,
      title: def.title,
      targetName: extras.targetName || def.targetName,
      gridX: extras.gridX ?? null,
      gridY: extras.gridY ?? null,
      durationMs: def.durationMs,
      status: extras.status || 'pending',
      actorId: extras.actorId || null,
      startedAt: extras.startedAt || null,
      canInteract: extras.canInteract !== false,
      blockedReason: extras.blockedReason || null,
    };
  }

  function getFetchWaterAction(playerId, player) {
    const well = stationByKey.well;
    const isNearWell = isAdjacent8(player, well.x, well.y);
    const alreadyHasWater = Boolean(hasWaterByPlayer[playerId]);
    const canInteract = isNearWell && !alreadyHasWater;

    return toAction(actionLibrary.fetch_water, {
      actorId: playerId,
      gridX: well.x,
      gridY: well.y,
      canInteract,
      blockedReason: !isNearWell
        ? 'Approche-toi du puits.'
        : (alreadyHasWater ? 'Tu as déjà de l’eau.' : null),
    });
  }

  function getPlantSeedAction(playerId, player) {
    const inBrownZone = isInZone(player, brownZone);
    const plantOnCell = getPlantAt(player.gridX, player.gridY);
    const canInteract = inBrownZone && !plantOnCell;

    return toAction(actionLibrary.plant_seed, {
      actorId: playerId,
      gridX: player.gridX,
      gridY: player.gridY,
      canInteract,
      blockedReason: !inBrownZone
        ? 'Entre dans la zone marron.'
        : (plantOnCell ? 'Il y a déjà une plante ici.' : null),
    });
  }

  function getWaterPlantsAction(playerId, player) {
    const targetPlant = getNearestPlantForPlayer(player);
    const hasWater = Boolean(hasWaterByPlayer[playerId]);
    const canInteract = Boolean(targetPlant) && hasWater;

    return toAction(actionLibrary.water_plants, {
      actorId: playerId,
      gridX: targetPlant ? targetPlant.gridX : null,
      gridY: targetPlant ? targetPlant.gridY : null,
      canInteract,
      blockedReason: !targetPlant
        ? 'Approche-toi d’une plante.'
        : (!hasWater ? 'Tu dois d’abord prendre de l’eau au puits.' : null),
    });
  }

  function getActionsForPlayer(playerId, playersById) {
    const player = playersById[playerId];
    if (!player) return null;

    const activeAction = inProgressByPlayer[playerId] || null;

    return {
      plant_seed: getPlantSeedAction(playerId, player),
      fetch_water: getFetchWaterAction(playerId, player),
      water_plants: getWaterPlantsAction(playerId, player),
      activeAction,
    };
  }

  function getPublicActionState(playersById = playersSnapshot) {
    const actionsByPlayer = {};
    const inProgressPublicByPlayer = {};
    const hasWaterPublicByPlayer = {};

    const playerIds = Object.keys(playersById).map(Number);

    for (const playerId of playerIds) {
      actionsByPlayer[playerId] = getActionsForPlayer(playerId, playersById);
      hasWaterPublicByPlayer[playerId] = Boolean(hasWaterByPlayer[playerId]);
      if (inProgressByPlayer[playerId]) {
        inProgressPublicByPlayer[playerId] = inProgressByPlayer[playerId];
      }
    }

    return {
      actionsByPlayer,
      inProgressByPlayer: inProgressPublicByPlayer,
      hasWaterByPlayer: hasWaterPublicByPlayer,
      plants: plants.map(plant => ({
        id: plant.id,
        gridX: plant.gridX,
        gridY: plant.gridY,
        watered: plant.watered,
      })),
    };
  }

  function emitActionChange(playersById = playersSnapshot) {
    onActionChange(getPublicActionState(playersById));
  }

  function finishAction(playerId, playersById, success, message, actionId) {
    const finishedAction = inProgressByPlayer[playerId] || null;
    clearCompletionTimer(playerId);
    delete inProgressByPlayer[playerId];

    if (success && finishedAction) {
      if (finishedAction.key === 'fetch_water') {
        hasWaterByPlayer[playerId] = true;
      }

      if (finishedAction.key === 'plant_seed') {
        if (!getPlantAt(finishedAction.gridX, finishedAction.gridY)) {
          plants.push({
            id: nextPlantId++,
            gridX: finishedAction.gridX,
            gridY: finishedAction.gridY,
            watered: false,
          });
        }
      }

      if (finishedAction.key === 'water_plants') {
        const plant = getPlantAt(finishedAction.gridX, finishedAction.gridY);
        if (plant) plant.watered = true;
        hasWaterByPlayer[playerId] = false;
      }
    }

    onActionResult({
      actionId: actionId || null,
      success,
      message,
      playerId,
      hasWater: Boolean(hasWaterByPlayer[playerId]),
    });

    emitActionChange(playersById);
  }

  function isActionStillValid(action, playerId, playersById) {
    const player = playersById[playerId];
    if (!player) return false;

    if (action.key === 'fetch_water') {
      const well = stationByKey.well;
      return isAdjacent8(player, well.x, well.y);
    }

    if (action.key === 'plant_seed') {
      return isInZone(player, brownZone);
    }

    if (action.key === 'water_plants') {
      const plant = getPlantAt(action.gridX, action.gridY);
      if (!plant) return false;
      return (
        Boolean(hasWaterByPlayer[playerId])
        && (isAdjacent8(player, plant.gridX, plant.gridY) || (player.gridX === plant.gridX && player.gridY === plant.gridY))
      );
    }

    return true;
  }

  function handleRosterChange(playersById) {
    playersSnapshot = playersById;

    for (const playerId of Object.keys(hasWaterByPlayer)) {
      if (!playersById[playerId]) {
        delete hasWaterByPlayer[playerId];
      }
    }

    for (const playerId of Object.keys(inProgressByPlayer)) {
      if (!playersById[playerId]) {
        clearCompletionTimer(playerId);
        delete inProgressByPlayer[playerId];
        continue;
      }

      const action = inProgressByPlayer[playerId];
      if (!isActionStillValid(action, Number(playerId), playersById)) {
        finishAction(
          Number(playerId),
          playersById,
          false,
          'Action annulée: condition non respectée.',
          action.id,
        );
      }
    }

    emitActionChange(playersById);
  }

  function tryInteract(playerId, playersById, actionKey) {
    playersSnapshot = playersById;

    if (inProgressByPlayer[playerId]) {
      onActionResult({
        actionId: inProgressByPlayer[playerId].id,
        success: false,
        message: 'Action déjà en cours…',
        playerId,
        hasWater: Boolean(hasWaterByPlayer[playerId]),
      });
      return;
    }

    const playerActions = getActionsForPlayer(playerId, playersById);
    if (!playerActions || !playerActions[actionKey]) {
      onActionResult({
        actionId: null,
        success: false,
        message: 'Action inconnue.',
        playerId,
        hasWater: Boolean(hasWaterByPlayer[playerId]),
      });
      return;
    }

    const selectedAction = playerActions[actionKey];
    if (!selectedAction.canInteract) {
      onActionResult({
        actionId: null,
        success: false,
        message: selectedAction.blockedReason || 'Action indisponible.',
        playerId,
        hasWater: Boolean(hasWaterByPlayer[playerId]),
      });
      return;
    }

    const actionToStart = {
      ...selectedAction,
      id: nextActionId++,
      status: 'in_progress',
      startedAt: Date.now(),
      actorId: playerId,
    };

    inProgressByPlayer[playerId] = actionToStart;
    emitActionChange(playersById);

    completionTimeoutByPlayer[playerId] = setTimeout(() => {
      const successMessage = actionToStart.key === 'fetch_water'
        ? 'Tu as de l’eau.'
        : `Action réussie: ${actionToStart.title}.`;
      finishAction(
        playerId,
        playersSnapshot,
        true,
        successMessage,
        actionToStart.id,
      );
    }, actionToStart.durationMs);
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
