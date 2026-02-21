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
  talk_bees: {
    key: 'talk_bees',
    title: 'Parler aux abeilles',
    targetName: 'Ruche',
    durationMs: 3000,
  },
  harvest_cacao: {
    key: 'harvest_cacao',
    title: 'Récolter le cacao',
    targetName: 'Cacaotier mûr',
    durationMs: 3000,
  },
  burn_tree: {
    key: 'burn_tree',
    title: 'Mettre le feu',
    targetName: 'Arbre récolté',
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
    hive: stations.hive || { x: 4, y: 18 },
  };
  const brownZone = stations.brownZone || BROWN_ZONE;

  const inProgressByPlayer = {};
  const completionTimeoutByPlayer = {};
  const hasWaterByPlayer = {};
  const beeFlights = [];
  const fireBursts = [];
  let playersSnapshot = {};

  let nextActionId = 1;
  let nextPlantId = 1;
  let nextBeeFlightId = 1;
  let nextFireBurstId = 1;
  const plants = [];

  function clearCompletionTimer(playerId) {
    if (completionTimeoutByPlayer[playerId]) {
      clearTimeout(completionTimeoutByPlayer[playerId]);
      delete completionTimeoutByPlayer[playerId];
    }
  }

  function cleanupTemporalEvents(now = Date.now()) {
    for (let index = beeFlights.length - 1; index >= 0; index -= 1) {
      const flight = beeFlights[index];
      if (now >= flight.startedAt + flight.durationMs) {
        beeFlights.splice(index, 1);
      }
    }

    for (let index = fireBursts.length - 1; index >= 0; index -= 1) {
      const burst = fireBursts[index];
      if (now >= burst.startedAt + burst.durationMs) {
        fireBursts.splice(index, 1);
      }
    }
  }

  function getPlantAt(x, y) {
    return plants.find(plant => plant.gridX === x && plant.gridY === y) || null;
  }

  function getNearestPlantForPlayer(player, options = {}) {
    const {
      stageEquals = null,
      stageAtMost = null,
    } = options;

    for (const plant of plants) {
      if (stageEquals !== null && plant.stage !== stageEquals) continue;
      if (stageAtMost !== null && plant.stage > stageAtMost) continue;
      if (isAdjacent8(player, plant.gridX, plant.gridY) || (player.gridX === plant.gridX && player.gridY === plant.gridY)) {
        return plant;
      }
    }
    return null;
  }

  function getNearestPlantToPoint(x, y, options = {}) {
    const { stageEquals = null } = options;
    let nearest = null;
    let bestDistance = Infinity;

    for (const plant of plants) {
      if (stageEquals !== null && plant.stage !== stageEquals) continue;
      const distance = Math.abs(plant.gridX - x) + Math.abs(plant.gridY - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = plant;
      }
    }

    return nearest;
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
    const targetPlant = getNearestPlantForPlayer(player, { stageAtMost: 0 });
    const hasWater = Boolean(hasWaterByPlayer[playerId]);
    const canInteract = Boolean(targetPlant) && hasWater;

    return toAction(actionLibrary.water_plants, {
      actorId: playerId,
      gridX: targetPlant ? targetPlant.gridX : null,
      gridY: targetPlant ? targetPlant.gridY : null,
      canInteract,
      blockedReason: !targetPlant
        ? 'Approche-toi d’une plante à arroser.'
        : (!hasWater ? 'Tu dois d’abord prendre de l’eau au puits.' : null),
    });
  }

  function getTalkBeesAction(playerId, player) {
    const hive = stationByKey.hive;
    const isNearHive = isAdjacent8(player, hive.x, hive.y);
    const targetPlant = getNearestPlantToPoint(hive.x, hive.y, { stageEquals: 1 });
    const canInteract = isNearHive && Boolean(targetPlant);

    return toAction(actionLibrary.talk_bees, {
      actorId: playerId,
      gridX: targetPlant ? targetPlant.gridX : null,
      gridY: targetPlant ? targetPlant.gridY : null,
      targetName: 'Ruche',
      canInteract,
      blockedReason: !isNearHive
        ? 'Approche-toi de la ruche.'
        : (!targetPlant ? 'Il faut une plante arrosée.' : null),
    });
  }

  function getHarvestCacaoAction(playerId, player) {
    const targetPlant = getNearestPlantForPlayer(player, { stageEquals: 2 });
    const canInteract = Boolean(targetPlant);

    return toAction(actionLibrary.harvest_cacao, {
      actorId: playerId,
      gridX: targetPlant ? targetPlant.gridX : null,
      gridY: targetPlant ? targetPlant.gridY : null,
      canInteract,
      blockedReason: targetPlant ? null : 'Aucun cacaotier prêt à récolter à proximité.',
    });
  }

  function getBurnTreeAction(playerId, player) {
    const targetPlant = getNearestPlantForPlayer(player, { stageEquals: 3 });
    const canInteract = Boolean(targetPlant);

    return toAction(actionLibrary.burn_tree, {
      actorId: playerId,
      gridX: targetPlant ? targetPlant.gridX : null,
      gridY: targetPlant ? targetPlant.gridY : null,
      canInteract,
      blockedReason: targetPlant ? null : 'Récolte d’abord un cacaotier pour pouvoir y mettre le feu.',
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
      talk_bees: getTalkBeesAction(playerId, player),
      harvest_cacao: getHarvestCacaoAction(playerId, player),
      burn_tree: getBurnTreeAction(playerId, player),
      activeAction,
    };
  }

  function getPublicActionState(playersById = playersSnapshot) {
    cleanupTemporalEvents();

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
        stage: plant.stage,
      })),
      beeFlights: beeFlights.map(flight => ({
        id: flight.id,
        startedAt: flight.startedAt,
        durationMs: flight.durationMs,
        targetGridX: flight.targetGridX,
        targetGridY: flight.targetGridY,
      })),
      fireBursts: fireBursts.map(burst => ({
        id: burst.id,
        startedAt: burst.startedAt,
        durationMs: burst.durationMs,
        targetGridX: burst.targetGridX,
        targetGridY: burst.targetGridY,
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
            stage: 0,
          });
        }
      }

      if (finishedAction.key === 'water_plants') {
        const plant = getPlantAt(finishedAction.gridX, finishedAction.gridY);
        if (plant && plant.stage === 0) plant.stage = 1;
        hasWaterByPlayer[playerId] = false;
      }

      if (finishedAction.key === 'talk_bees') {
        const plant = getPlantAt(finishedAction.gridX, finishedAction.gridY);
        if (plant && plant.stage === 1) {
          plant.stage = 2;
          beeFlights.push({
            id: nextBeeFlightId++,
            startedAt: Date.now(),
            durationMs: 4400,
            targetGridX: plant.gridX,
            targetGridY: plant.gridY,
          });
        }
      }

      if (finishedAction.key === 'harvest_cacao') {
        const plant = getPlantAt(finishedAction.gridX, finishedAction.gridY);
        if (plant && plant.stage === 2) {
          plant.stage = 3;
        }
      }

      if (finishedAction.key === 'burn_tree') {
        const plant = getPlantAt(finishedAction.gridX, finishedAction.gridY);
        if (plant && plant.stage === 3) {
          plant.stage = 4;
          fireBursts.push({
            id: nextFireBurstId++,
            startedAt: Date.now(),
            durationMs: 2800,
            targetGridX: plant.gridX,
            targetGridY: plant.gridY,
          });
        }
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
      if (!plant || plant.stage !== 0) return false;
      return (
        Boolean(hasWaterByPlayer[playerId])
        && (isAdjacent8(player, plant.gridX, plant.gridY) || (player.gridX === plant.gridX && player.gridY === plant.gridY))
      );
    }

    if (action.key === 'talk_bees') {
      const hive = stationByKey.hive;
      const plant = getPlantAt(action.gridX, action.gridY);
      return Boolean(plant && plant.stage === 1 && isAdjacent8(player, hive.x, hive.y));
    }

    if (action.key === 'harvest_cacao') {
      const plant = getPlantAt(action.gridX, action.gridY);
      return Boolean(
        plant
        && plant.stage === 2
        && (isAdjacent8(player, plant.gridX, plant.gridY) || (player.gridX === plant.gridX && player.gridY === plant.gridY))
      );
    }

    if (action.key === 'burn_tree') {
      const plant = getPlantAt(action.gridX, action.gridY);
      return Boolean(
        plant
        && plant.stage === 3
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
      let successMessage = `Action réussie: ${actionToStart.title}.`;
      if (actionToStart.key === 'fetch_water') successMessage = 'Tu as de l’eau.';
      if (actionToStart.key === 'talk_bees') successMessage = 'Les abeilles vont butiner puis revenir à la ruche.';
      if (actionToStart.key === 'burn_tree') successMessage = 'Le feu prend sur l’arbre.';

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
