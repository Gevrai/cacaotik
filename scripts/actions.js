const ACTION_LIBRARY = [
  {
    key: 'feed_animals',
    title: 'Nourrir les animaux',
    description: 'Apporte de la nourriture au bétail.',
    targetName: 'Enclos',
    gridX: 3,
    gridY: 3,
    durationMs: 4000,
  },
  {
    key: 'water_plants',
    title: 'Arroser les plantes',
    description: 'Arrose les plants pour les sauver.',
    targetName: 'Potager',
    gridX: 8,
    gridY: 4,
    durationMs: 3500,
  },
  {
    key: 'extinguish_fire',
    title: 'Éteindre le feu',
    description: 'Le feu prend ! Va l’éteindre.',
    targetName: 'Cuisine',
    gridX: 12,
    gridY: 7,
    durationMs: 5000,
  },
  {
    key: 'collect_eggs',
    title: 'Ramasser les œufs',
    description: 'Collecte les œufs avant qu’ils cassent.',
    targetName: 'Pondoir',
    gridX: 5,
    gridY: 9,
    durationMs: 3000,
  },
  {
    key: 'repair_fence',
    title: 'Réparer la clôture',
    description: 'Une barrière est ouverte.',
    targetName: 'Clôture',
    gridX: 1,
    gridY: 10,
    durationMs: 4500,
  },
  {
    key: 'chop_cacao',
    title: 'Couper des cabosses',
    description: 'Prépare des cabosses de cacao.',
    targetName: 'Cacaoyer',
    gridX: 15,
    gridY: 3,
    durationMs: 4200,
  },
  {
    key: 'grind_beans',
    title: 'Moudre les fèves',
    description: 'Active le moulin à fèves.',
    targetName: 'Moulin',
    gridX: 16,
    gridY: 10,
    durationMs: 3800,
  },
  {
    key: 'stir_pot',
    title: 'Mélanger la marmite',
    description: 'Brasse avant que ça brûle.',
    targetName: 'Marmite',
    gridX: 10,
    gridY: 12,
    durationMs: 3600,
  },
  {
    key: 'clean_stable',
    title: 'Nettoyer l’écurie',
    description: 'Un peu de ménage urgent.',
    targetName: 'Écurie',
    gridX: 6,
    gridY: 13,
    durationMs: 4300,
  },
  {
    key: 'refill_well',
    title: 'Remplir le puits',
    description: 'Le puits est presque vide.',
    targetName: 'Puits',
    gridX: 18,
    gridY: 6,
    durationMs: 3400,
  },
];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickRequesterAndActor(playerIds) {
  const requesterId = randomItem(playerIds);
  const actorPool = playerIds.filter(id => id !== requesterId);
  const actorId = randomItem(actorPool);
  return { requesterId, actorId };
}

function createActionManager(options = {}) {
  const {
    actionLibrary = ACTION_LIBRARY,
    minPlayers = 2,
    onActionChange = () => {},
    onActionResult = () => {},
  } = options;

  let currentAction = null;
  let nextActionId = 1;
  let completionTimeout = null;

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

    const def = randomItem(actionLibrary);
    const { requesterId, actorId } = pickRequesterAndActor(playerIds);

    currentAction = {
      id: nextActionId++,
      key: def.key,
      title: def.title,
      description: def.description,
      targetName: def.targetName,
      gridX: def.gridX,
      gridY: def.gridY,
      durationMs: def.durationMs,
      requesterId,
      actorId,
      status: 'pending',
      startedAt: null,
    };

    emitActionChange();
  }

  function finishAction(playersById, success, message) {
    const finishedAction = currentAction;
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

    const onTarget = actor.gridX === currentAction.gridX && actor.gridY === currentAction.gridY;
    if (!onTarget) {
      onActionResult({
        actionId: currentAction.id,
        success: false,
        message: `Va à ${currentAction.targetName} (${currentAction.gridX}, ${currentAction.gridY}) puis interagis.`,
      });
      return;
    }

    currentAction.status = 'in_progress';
    currentAction.startedAt = Date.now();
    emitActionChange();

    completionTimeout = setTimeout(() => {
      finishAction(playersById, true, `Action réussie: ${currentAction ? currentAction.title : 'terminée'}.`);
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
