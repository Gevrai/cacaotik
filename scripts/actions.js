const CACAOLO_SFX = [
  'general_1.mp3', 'general_2.mp3',
  'greeting_1.mp3', 'greeting_2.mp3', 'greeting_3.mp3',
  'happy_1.mp3', 'happy_2.mp3',
  'laughing_1.mp3', 'laughing_2.mp3',
  'singing_1.mp3', 'singing_2.mp3',
];

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
  fetch_seed: {
    key: 'fetch_seed',
    title: 'Transformer cacao en graines',
    targetName: 'Maison',
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
  pet_llama: {
    key: 'pet_llama',
    title: 'Papouiller le lama',
    targetName: 'Lama',
    durationMs: 3000,
  },
  feed_rabbit: {
    key: 'feed_rabbit',
    title: 'Nourrir le lapin',
    targetName: 'Lapin',
    durationMs: 3000,
  },
  harvest_choco: {
    key: 'harvest_choco',
    title: 'Récolter le caca en chocolat',
    targetName: 'Caca chocolaté',
    durationMs: 3000,
  },
  greet_player: {
    key: 'greet_player',
    title: 'Saluer',
    targetName: 'Joueur',
    durationMs: 1500,
  },
};

const BROWN_ZONE = {
  minX: 2,
  maxX: 10,
  minY: 8,
  maxY: 14,
};

const HOUSE_ZONE = {
  minX: 3,
  maxX: 5,
  minY: 1,
  maxY: 3,
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

function isAroundZone(player, zone) {
  const inExpanded = (
    player.gridX >= zone.minX - 1
    && player.gridX <= zone.maxX + 1
    && player.gridY >= zone.minY - 1
    && player.gridY <= zone.maxY + 1
  );
  return inExpanded && !isInZone(player, zone);
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
    house: stations.house || { x: 2, y: 2 },
    llamas: Array.isArray(stations.llamas) && stations.llamas.length > 0
      ? stations.llamas
      : [{ x: 23, y: 15 }, { x: 23, y: 16 }],
    rabbits: Array.isArray(stations.rabbits) && stations.rabbits.length > 0
      ? stations.rabbits
      : [{ x: 20, y: 14 }, { x: 21, y: 15 }, { x: 22, y: 14 }],
  };
  const brownZone = stations.brownZone || BROWN_ZONE;
  const houseZone = stations.houseZone || HOUSE_ZONE;

  const inProgressByPlayer = {};
  const completionTimeoutByPlayer = {};
  const inventoryByProfile = {};
  const beeFlights = [];
  const fireBursts = [];
  const rabbitCacaoTiles = [];
  let playersSnapshot = {};

  let nextActionId = 1;
  let nextPlantId = 1;
  let nextBeeFlightId = 1;
  let nextFireBurstId = 1;
  let nextRabbitCacaoTileId = 1;
  const plants = [];

  function clearCompletionTimer(playerId) {
    if (completionTimeoutByPlayer[playerId]) {
      clearTimeout(completionTimeoutByPlayer[playerId]);
      delete completionTimeoutByPlayer[playerId];
    }
  }

  function profileKeyFromPlayer(player) {
    return `${player.character}|${player.name}`;
  }

  function getInventoryForPlayerId(playerId, playersById = playersSnapshot) {
    const player = playersById[playerId];
    if (!player) return null;
    const profileKey = profileKeyFromPlayer(player);
    if (!inventoryByProfile[profileKey]) {
      inventoryByProfile[profileKey] = {
        hasWater: false,
        seeds: 1,
        cacao: 0,
        money: 0,
      };
    }
    return inventoryByProfile[profileKey];
  }

  function cleanupTemporalEvents(now = Date.now()) {
    for (let index = beeFlights.length - 1; index >= 0; index -= 1) {
      const flight = beeFlights[index];
      if (now >= flight.startedAt + flight.durationMs) {
        beeFlights.splice(index, 1);
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

  function isFireActiveAt(gridX, gridY) {
    return fireBursts.some(burst => burst.targetGridX === gridX && burst.targetGridY === gridY);
  }

  function getNearestBurningPlantForPlayer(player) {
    for (const plant of plants) {
      if (plant.stage !== 4) continue;
      if (!isFireActiveAt(plant.gridX, plant.gridY)) continue;
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

  function getNearestLlamaForPlayer(player) {
    for (const llama of stationByKey.llamas) {
      if (isAdjacent8(player, llama.x, llama.y) || (player.gridX === llama.x && player.gridY === llama.y)) {
        return llama;
      }
    }
    return null;
  }

  function getNearestRabbitForPlayer(player) {
    for (const rabbit of stationByKey.rabbits) {
      if (isAdjacent8(player, rabbit.x, rabbit.y) || (player.gridX === rabbit.x && player.gridY === rabbit.y)) {
        return rabbit;
      }
    }
    return null;
  }

  function getNearestRabbitCacaoTileForPlayer(player) {
    let nearest = null;
    let bestDistance = Infinity;

    for (const tile of rabbitCacaoTiles) {
      const isReachable = isAdjacent8(player, tile.targetGridX, tile.targetGridY)
        || (player.gridX === tile.targetGridX && player.gridY === tile.targetGridY);
      if (!isReachable) continue;

      const distance = Math.abs(player.gridX - tile.targetGridX) + Math.abs(player.gridY - tile.targetGridY);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = tile;
      }
    }

    return nearest;
  }

  function toAction(def, extras = {}) {
    return {
      id: extras.id || null,
      key: def.key,
      title: extras.title || def.title,
      targetName: extras.targetName || def.targetName,
      gridX: extras.gridX ?? null,
      gridY: extras.gridY ?? null,
      durationMs: def.durationMs,
      status: extras.status || 'pending',
      actorId: extras.actorId || null,
      startedAt: extras.startedAt || null,
      canInteract: extras.canInteract !== false,
      isVisible: extras.isVisible !== false,
      blockedReason: extras.blockedReason || null,
      targetPlayerId: extras.targetPlayerId ?? null,
    };
  }

  function getFetchWaterAction(playerId, player) {
    const inventory = getInventoryForPlayerId(playerId);
    const well = stationByKey.well;
    const isNearWell = isAdjacent8(player, well.x, well.y);
    const alreadyHasWater = Boolean(inventory && inventory.hasWater);
    const canInteract = isNearWell && !alreadyHasWater;

    return toAction(actionLibrary.fetch_water, {
      actorId: playerId,
      gridX: well.x,
      gridY: well.y,
      isVisible: isNearWell,
      canInteract,
      blockedReason: !isNearWell
        ? 'Approche-toi du puits.'
        : (alreadyHasWater ? 'Tu as déjà de l’eau.' : null),
    });
  }

  function getPlantSeedAction(playerId, player) {
    const inventory = getInventoryForPlayerId(playerId);
    const inBrownZone = isInZone(player, brownZone);
    const plantOnCell = getPlantAt(player.gridX, player.gridY);
    const hasSeed = Boolean(inventory && inventory.seeds > 0);
    const canInteract = inBrownZone && !plantOnCell && hasSeed;

    return toAction(actionLibrary.plant_seed, {
      actorId: playerId,
      gridX: player.gridX,
      gridY: player.gridY,
      isVisible: inBrownZone,
      canInteract,
      blockedReason: !inBrownZone
        ? 'Entre dans la zone marron.'
        : (plantOnCell
          ? 'Il y a déjà une plante ici.'
          : (!hasSeed ? 'Tu n’as plus de graines.' : null)),
    });
  }

  function getFetchSeedAction(playerId, player) {
    const inventory = getInventoryForPlayerId(playerId);
    const isAroundHouse = isAroundZone(player, houseZone);
    const hasCacao = Boolean(inventory && inventory.cacao > 0);
    const centerX = Math.floor((houseZone.minX + houseZone.maxX) / 2);
    const centerY = Math.floor((houseZone.minY + houseZone.maxY) / 2);

    return toAction(actionLibrary.fetch_seed, {
      actorId: playerId,
      gridX: centerX,
      gridY: centerY,
      isVisible: isAroundHouse,
      canInteract: isAroundHouse && hasCacao,
      blockedReason: !isAroundHouse
        ? 'Place-toi autour de la maison.'
        : (!hasCacao ? 'Il faut 1 cacao pour obtenir 3 graines.' : null),
    });
  }

  function getWaterPlantsAction(playerId, player) {
    const inventory = getInventoryForPlayerId(playerId);
    const burningPlant = getNearestBurningPlantForPlayer(player);
    const targetPlant = burningPlant || getNearestPlantForPlayer(player, { stageAtMost: 0 });
    const hasWater = Boolean(inventory && inventory.hasWater);
    const canInteract = Boolean(targetPlant) && hasWater;
    const isExtinguish = Boolean(burningPlant);

    return toAction(actionLibrary.water_plants, {
      actorId: playerId,
      gridX: targetPlant ? targetPlant.gridX : null,
      gridY: targetPlant ? targetPlant.gridY : null,
      title: isExtinguish ? 'Éteindre le feu' : actionLibrary.water_plants.title,
      targetName: isExtinguish ? 'Arbre en feu' : actionLibrary.water_plants.targetName,
      isVisible: Boolean(targetPlant),
      canInteract,
      blockedReason: !targetPlant
        ? 'Approche-toi d’une plante à arroser ou d’un arbre en feu.'
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
      isVisible: isNearHive,
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
      isVisible: Boolean(targetPlant),
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
      isVisible: Boolean(targetPlant),
      canInteract,
      blockedReason: targetPlant ? null : 'Récolte d’abord un cacaotier pour pouvoir y mettre le feu.',
    });
  }

  function getPetLlamaAction(playerId, player) {
    const llama = getNearestLlamaForPlayer(player);
    const canInteract = Boolean(llama);

    return toAction(actionLibrary.pet_llama, {
      actorId: playerId,
      gridX: llama ? llama.x : null,
      gridY: llama ? llama.y : null,
      isVisible: Boolean(llama),
      canInteract,
      blockedReason: llama ? null : 'Approche-toi du lama.',
    });
  }

  function getGreetPlayerAction(playerId, player, playersById) {
    const nearbyPlayer = Object.values(playersById).find(other => {
      if (other.id === player.id) return false;
      const dx = Math.abs(other.gridX - player.gridX);
      const dy = Math.abs(other.gridY - player.gridY);
      return Math.max(dx, dy) <= 1;
    });

    return toAction(actionLibrary.greet_player, {
      actorId: playerId,
      gridX: nearbyPlayer ? nearbyPlayer.gridX : null,
      gridY: nearbyPlayer ? nearbyPlayer.gridY : null,
      isVisible: Boolean(nearbyPlayer),
      canInteract: Boolean(nearbyPlayer),
      targetPlayerId: nearbyPlayer ? nearbyPlayer.id : null,
      blockedReason: nearbyPlayer ? null : 'Approche-toi d\'un autre joueur.',
    });
  }

  function getFeedRabbitAction(playerId, player) {
    const inventory = getInventoryForPlayerId(playerId);
    const rabbit = getNearestRabbitForPlayer(player);
    const hasCacao = Boolean(inventory && inventory.cacao > 0);

    return toAction(actionLibrary.feed_rabbit, {
      actorId: playerId,
      gridX: rabbit ? rabbit.x : null,
      gridY: rabbit ? rabbit.y : null,
      isVisible: Boolean(rabbit),
      canInteract: Boolean(rabbit) && hasCacao,
      blockedReason: !rabbit
        ? 'Approche-toi d’un lapin.'
        : (!hasCacao ? 'Il faut 1 cacao pour nourrir le lapin.' : null),
    });
  }

  function getHarvestChocoAction(playerId, player) {
    const targetTile = getNearestRabbitCacaoTileForPlayer(player);

    return toAction(actionLibrary.harvest_choco, {
      actorId: playerId,
      gridX: targetTile ? targetTile.targetGridX : null,
      gridY: targetTile ? targetTile.targetGridY : null,
      isVisible: Boolean(targetTile),
      canInteract: Boolean(targetTile),
      blockedReason: targetTile ? null : 'Approche-toi d’un caca chocolaté.',
    });
  }

  function getActionsForPlayer(playerId, playersById) {
    const player = playersById[playerId];
    if (!player) return null;

    const activeAction = inProgressByPlayer[playerId] || null;

    return {
      plant_seed: getPlantSeedAction(playerId, player),
      fetch_seed: getFetchSeedAction(playerId, player),
      fetch_water: getFetchWaterAction(playerId, player),
      water_plants: getWaterPlantsAction(playerId, player),
      talk_bees: getTalkBeesAction(playerId, player),
      harvest_cacao: getHarvestCacaoAction(playerId, player),
      burn_tree: getBurnTreeAction(playerId, player),
      pet_llama: getPetLlamaAction(playerId, player),
      feed_rabbit: getFeedRabbitAction(playerId, player),
      harvest_choco: getHarvestChocoAction(playerId, player),
      greet_player: getGreetPlayerAction(playerId, player, playersById),
      activeAction,
    };
  }

  function getPublicActionState(playersById = playersSnapshot) {
    cleanupTemporalEvents();

    const actionsByPlayer = {};
    const inProgressPublicByPlayer = {};
    const hasWaterPublicByPlayer = {};
    const seedsPublicByPlayer = {};
    const cacaoPublicByPlayer = {};
    const moneyPublicByPlayer = {};

    const playerIds = Object.keys(playersById).map(Number);

    for (const playerId of playerIds) {
      const inventory = getInventoryForPlayerId(playerId, playersById);
      actionsByPlayer[playerId] = getActionsForPlayer(playerId, playersById);
      hasWaterPublicByPlayer[playerId] = Boolean(inventory && inventory.hasWater);
      seedsPublicByPlayer[playerId] = inventory ? inventory.seeds : 0;
      cacaoPublicByPlayer[playerId] = inventory ? inventory.cacao : 0;
      moneyPublicByPlayer[playerId] = inventory ? inventory.money : 0;
      if (inProgressByPlayer[playerId]) {
        inProgressPublicByPlayer[playerId] = inProgressByPlayer[playerId];
      }
    }

    return {
      actionsByPlayer,
      inProgressByPlayer: inProgressPublicByPlayer,
      hasWaterByPlayer: hasWaterPublicByPlayer,
      seedsByPlayer: seedsPublicByPlayer,
      cacaoByPlayer: cacaoPublicByPlayer,
      moneyByPlayer: moneyPublicByPlayer,
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
        targetGridX: burst.targetGridX,
        targetGridY: burst.targetGridY,
      })),
      rabbitCacaoTiles: rabbitCacaoTiles.map(tile => ({
        id: tile.id,
        targetGridX: tile.targetGridX,
        targetGridY: tile.targetGridY,
      })),
    };
  }

  function emitActionChange(playersById = playersSnapshot) {
    onActionChange(getPublicActionState(playersById));
  }

  function getBlockedPlantCellKeys() {
    const blocked = new Set();
    for (const plant of plants) {
      blocked.add(`${plant.gridX},${plant.gridY}`);
    }
    return blocked;
  }

  function getBlockedLlamaCellKeys() {
    const blocked = new Set();
    for (const llama of stationByKey.llamas) {
      blocked.add(`${llama.x},${llama.y}`);
    }
    return blocked;
  }

  function getBlockedHouseCellKeys() {
    const blocked = new Set();
    for (let y = houseZone.minY; y <= houseZone.maxY; y += 1) {
      for (let x = houseZone.minX; x <= houseZone.maxX; x += 1) {
        blocked.add(`${x},${y}`);
      }
    }
    return blocked;
  }

  function finishAction(playerId, playersById, success, message, actionId) {
    const finishedAction = inProgressByPlayer[playerId] || null;
    const inventory = getInventoryForPlayerId(playerId, playersById);
    clearCompletionTimer(playerId);
    delete inProgressByPlayer[playerId];

    let sfxPayload = {};

    if (success && finishedAction && inventory) {
      if (finishedAction.key === 'fetch_water') {
        inventory.hasWater = true;
      }

      if (finishedAction.key === 'fetch_seed') {
        if (inventory.cacao > 0) {
          inventory.cacao -= 1;
          inventory.seeds += 3;
        }
      }

      if (finishedAction.key === 'plant_seed') {
        inventory.seeds = Math.max(0, inventory.seeds - 1);
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
        if (plant && plant.stage === 0) {
          plant.stage = 1;
          inventory.hasWater = false;
        }
        if (plant && plant.stage === 4 && isFireActiveAt(plant.gridX, plant.gridY)) {
          const burstIndex = fireBursts.findIndex(
            burst => burst.targetGridX === plant.gridX && burst.targetGridY === plant.gridY,
          );
          if (burstIndex >= 0) fireBursts.splice(burstIndex, 1);
          const plantIndex = plants.findIndex(
            candidate => candidate.id === plant.id,
          );
          if (plantIndex >= 0) plants.splice(plantIndex, 1);
          inventory.hasWater = false;
        }
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
          inventory.cacao += 1;
        }
      }

      if (finishedAction.key === 'burn_tree') {
        const plant = getPlantAt(finishedAction.gridX, finishedAction.gridY);
        if (plant && plant.stage === 3) {
          plant.stage = 4;
          if (!isFireActiveAt(plant.gridX, plant.gridY)) {
            fireBursts.push({
              id: nextFireBurstId++,
              startedAt: Date.now(),
              targetGridX: plant.gridX,
              targetGridY: plant.gridY,
            });
          }
        }
      }

      if (finishedAction.key === 'feed_rabbit') {
        if (inventory.cacao > 0) {
          inventory.cacao -= 1;
          const alreadyPlaced = rabbitCacaoTiles.some(
            tile => tile.targetGridX === finishedAction.gridX && tile.targetGridY === finishedAction.gridY,
          );
          if (!alreadyPlaced) {
            rabbitCacaoTiles.push({
              id: nextRabbitCacaoTileId++,
              targetGridX: finishedAction.gridX,
              targetGridY: finishedAction.gridY,
            });
          }
        }
      }

      if (finishedAction.key === 'harvest_choco') {
        const tileIndex = rabbitCacaoTiles.findIndex(
          tile => tile.targetGridX === finishedAction.gridX && tile.targetGridY === finishedAction.gridY,
        );
        if (tileIndex >= 0) {
          rabbitCacaoTiles.splice(tileIndex, 1);
          inventory.money += 500;
        }
      }

      if (finishedAction.key === 'fetch_water') {
        sfxPayload = {
          sfxFile: '/assets/sfx/water.mp3',
          sfxTargetIds: [playerId],
        };
      }

      if (finishedAction.key === 'pet_llama') {
        sfxPayload = {
          sfxFile: '/assets/sfx/llama.mp3',
          sfxTargetIds: [playerId],
        };
      }

      if (finishedAction.key === 'burn_tree') {
        sfxPayload = {
          sfxFile: '/assets/sfx/fire_swoosh.mp3',
          sfxExtraFile: '/assets/sfx/fire_burning.mp3',
          sfxTargetIds: [playerId],
        };
      }

      if (finishedAction.key === 'feed_rabbit') {
        sfxPayload = {
          sfxFile: '/assets/sfx/rabbit.mp3',
          sfxTargetIds: [playerId],
        };
      }

      if (finishedAction.key === 'greet_player') {
        const sfxFile = CACAOLO_SFX[Math.floor(Math.random() * CACAOLO_SFX.length)];
        sfxPayload = {
          sfxFile: `/assets/sfx/cacaolo/${sfxFile}`,
          sfxTargetIds: [playerId, finishedAction.targetPlayerId].filter(id => id != null),
        };
      }
    }

    onActionResult({
      actionId: actionId || null,
      actionKey: finishedAction ? finishedAction.key : null,
      success,
      message,
      playerId,
      targetGridX: finishedAction ? finishedAction.gridX : null,
      targetGridY: finishedAction ? finishedAction.gridY : null,
      hasWater: Boolean(inventory && inventory.hasWater),
      seeds: inventory ? inventory.seeds : 0,
      cacao: inventory ? inventory.cacao : 0,
      money: inventory ? inventory.money : 0,
      ...sfxPayload,
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

    if (action.key === 'fetch_seed') {
      const inventory = getInventoryForPlayerId(playerId, playersById);
      return isAroundZone(player, houseZone) && Boolean(inventory && inventory.cacao > 0);
    }

    if (action.key === 'plant_seed') {
      return isInZone(player, brownZone);
    }

    if (action.key === 'water_plants') {
      const inventory = getInventoryForPlayerId(playerId, playersById);
      const plant = getPlantAt(action.gridX, action.gridY);
        if (!plant) return false;
        const isNormalWatering = plant.stage === 0;
        const isFireExtinguish = plant.stage === 4 && isFireActiveAt(plant.gridX, plant.gridY);
        if (!isNormalWatering && !isFireExtinguish) return false;
      return (
        Boolean(inventory && inventory.hasWater)
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

    if (action.key === 'pet_llama') {
      return stationByKey.llamas.some(llama => (
        llama.x === action.gridX
        && llama.y === action.gridY
        && (isAdjacent8(player, llama.x, llama.y) || (player.gridX === llama.x && player.gridY === llama.y))
      ));
    }

    if (action.key === 'feed_rabbit') {
      const inventory = getInventoryForPlayerId(playerId, playersById);
      return stationByKey.rabbits.some(rabbit => (
        rabbit.x === action.gridX
        && rabbit.y === action.gridY
        && (isAdjacent8(player, rabbit.x, rabbit.y) || (player.gridX === rabbit.x && player.gridY === rabbit.y))
      )) && Boolean(inventory && inventory.cacao > 0);
    }

    if (action.key === 'harvest_choco') {
      return rabbitCacaoTiles.some(tile => (
        tile.targetGridX === action.gridX
        && tile.targetGridY === action.gridY
        && (isAdjacent8(player, tile.targetGridX, tile.targetGridY)
          || (player.gridX === tile.targetGridX && player.gridY === tile.targetGridY))
      ));
    }

    if (action.key === 'greet_player') {
      if (!action.targetPlayerId) return false;
      const target = playersById[action.targetPlayerId];
      if (!target) return false;
      const dx = Math.abs(target.gridX - player.gridX);
      const dy = Math.abs(target.gridY - player.gridY);
      return Math.max(dx, dy) <= 1;
    }

    return true;
  }

  function handleRosterChange(playersById) {
    playersSnapshot = playersById;

    for (const playerId of Object.keys(playersById)) {
      getInventoryForPlayerId(playerId, playersById);
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
    const inventory = getInventoryForPlayerId(playerId, playersById);

    if (inProgressByPlayer[playerId]) {
      onActionResult({
        actionId: inProgressByPlayer[playerId].id,
        success: false,
        message: 'Action déjà en cours…',
        playerId,
        hasWater: Boolean(inventory && inventory.hasWater),
        seeds: inventory ? inventory.seeds : 0,
        cacao: inventory ? inventory.cacao : 0,
        money: inventory ? inventory.money : 0,
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
        hasWater: Boolean(inventory && inventory.hasWater),
        seeds: inventory ? inventory.seeds : 0,
        cacao: inventory ? inventory.cacao : 0,
        money: inventory ? inventory.money : 0,
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
        hasWater: Boolean(inventory && inventory.hasWater),
        seeds: inventory ? inventory.seeds : 0,
        cacao: inventory ? inventory.cacao : 0,
        money: inventory ? inventory.money : 0,
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
      if (actionToStart.key === 'fetch_seed') successMessage = '1 cacao transformé en 3 graines.';
      if (actionToStart.key === 'talk_bees') successMessage = 'Les abeilles vont butiner puis revenir à la ruche.';
      if (actionToStart.key === 'burn_tree') successMessage = 'Le feu prend sur l’arbre.';
      if (actionToStart.key === 'pet_llama') successMessage = 'Le lama adore les papouilles.';
      if (actionToStart.key === 'feed_rabbit') successMessage = 'Le lapin a mangé 1 cacao.';
      if (actionToStart.key === 'harvest_choco') successMessage = '+500$ pour le caca en chocolat.';
      if (actionToStart.key === 'greet_player') successMessage = 'Salutations !';

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
    getBlockedPlantCellKeys,
    getBlockedLlamaCellKeys,
    getBlockedHouseCellKeys,
    handleRosterChange,
    tryInteract,
  };
}

module.exports = {
  ACTION_LIBRARY,
  createActionManager,
};
