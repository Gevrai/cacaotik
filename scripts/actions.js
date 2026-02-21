const ACTION_LIBRARY = {
  plant_seed: {
    key: 'plant_seed',
    title: 'Planter une graine',
    description: 'Plante une graine au potager.',
    targetName: 'Zone de semis',
    stationKey: 'seed',
    durationMs: 3000,
  },
  fetch_water: {
    key: 'fetch_water',
    title: 'Prendre de l’eau',
    description: 'Prends de l’eau au puits.',
    targetName: 'Puits',
    stationKey: 'well',
    durationMs: 3000,
  },
  water_plants: {
    key: 'water_plants',
    title: 'Arroser la plante',
    description: 'Arrose la plante au potager.',
    targetName: 'Potager',
    stationKey: 'plants',
    durationMs: 3000,
  },
  harvest_plant: {
    key: 'harvest_plant',
    title: 'Récolter la plante',
    description: 'Récolte la plante prête.',
    targetName: 'Zone de récolte',
    stationKey: 'harvest',
    durationMs: 3000,
  },
};

const ACTION_ORDER = [
  ACTION_LIBRARY.plant_seed,
  ACTION_LIBRARY.fetch_water,
  ACTION_LIBRARY.water_plants,
  ACTION_LIBRARY.harvest_plant,
];

function isAdjacent8(player, x, y) {
  const dx = Math.abs(player.gridX - x);
  const dy = Math.abs(player.gridY - y);
  return Math.max(dx, dy) === 1;
}

function createActionManager(options = {}) {
  const {
    actionLibrary = ACTION_LIBRARY,
    stations = {},
    onActionChange = () => {},
    onActionResult = () => {},
  } = options;

  const stationByKey = {
    seed: stations.seed || { x: 7, y: 4 },
    well: stations.well || { x: 15, y: 2 },
    plants: stations.plants || { x: 8, y: 4 },
    harvest: stations.harvest || { x: 9, y: 4 },
  };

  const inProgressByPlayer = {};
  const completionTimeoutByPlayer = {};
  let playersSnapshot = {};
  let nextActionId = 1;

  function clearCompletionTimer(playerId) {
    if (completionTimeoutByPlayer[playerId]) {
      clearTimeout(completionTimeoutByPlayer[playerId]);
      delete completionTimeoutByPlayer[playerId];
    }
  }

  function toPublicAction(def, station, extras = {}) {
    return {
      id: extras.id || null,
      key: def.key,
      title: def.title,
      description: def.description,
      targetName: def.targetName,
      gridX: station.x,
      gridY: station.y,
      durationMs: def.durationMs,
      status: extras.status || 'pending',
      actorId: extras.actorId || null,
      startedAt: extras.startedAt || null,
    };
  }

  function getPendingActionForPlayer(playerId, playersById) {
    const player = playersById[playerId];
    if (!player) return null;

    for (const def of ACTION_ORDER) {
      const station = stationByKey[def.stationKey];
      if (!station) continue;
      if (isAdjacent8(player, station.x, station.y)) {
        return toPublicAction(def, station, { actorId: playerId, status: 'pending' });
      }
    }

    return null;
  }

  function getPublicActionState(playersById = playersSnapshot) {
    const actionsByPlayer = {};
    const inProgressPublicByPlayer = {};

    const playerIds = Object.keys(playersById).map(Number);

    for (const playerId of playerIds) {
      const inProgress = inProgressByPlayer[playerId];
      if (inProgress) {
        actionsByPlayer[playerId] = inProgress;
        inProgressPublicByPlayer[playerId] = inProgress;
      } else {
        actionsByPlayer[playerId] = getPendingActionForPlayer(playerId, playersById);
      }
    }

    return {
      actionsByPlayer,
      inProgressByPlayer: inProgressPublicByPlayer,
    };
  }

  function emitActionChange(playersById = playersSnapshot) {
    onActionChange(getPublicActionState(playersById));
  }

  function finishAction(playerId, playersById, success, message, actionId) {
    clearCompletionTimer(playerId);
    delete inProgressByPlayer[playerId];

    onActionResult({
      actionId: actionId || null,
      success,
      message,
      playerId,
    });

    emitActionChange(playersById);
  }

  function handleRosterChange(playersById) {
    playersSnapshot = playersById;

    for (const playerId of Object.keys(inProgressByPlayer)) {
      if (!playersById[playerId]) {
        clearCompletionTimer(playerId);
        delete inProgressByPlayer[playerId];
      }
    }

    emitActionChange(playersById);
  }

  function tryInteract(playerId, playersById) {
    playersSnapshot = playersById;

    if (inProgressByPlayer[playerId]) {
      onActionResult({
        actionId: inProgressByPlayer[playerId].id,
        success: false,
        message: 'Action déjà en cours…',
        playerId,
      });
      return;
    }

    const pendingAction = getPendingActionForPlayer(playerId, playersById);
    if (!pendingAction) {
      onActionResult({
        actionId: null,
        success: false,
        message: 'Aucune action disponible ici.',
        playerId,
      });
      return;
    }

    const actionToStart = {
      ...pendingAction,
      id: nextActionId++,
      status: 'in_progress',
      startedAt: Date.now(),
      actorId: playerId,
    };

    inProgressByPlayer[playerId] = actionToStart;
    emitActionChange(playersById);

    completionTimeoutByPlayer[playerId] = setTimeout(() => {
      finishAction(
        playerId,
        playersById,
        true,
        `Action réussie: ${actionToStart.title}.`,
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
