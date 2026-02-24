/**
 * Persist game state to Firestore.
 *
 * World state  → collection "game", document "world"
 * Player state → collection "players", document "{playerName}"
 *
 * Authentication is automatic on Cloud Run via the service account.
 * Locally, set GOOGLE_APPLICATION_CREDENTIALS or run `gcloud auth application-default login`.
 * If Firestore is unreachable, errors are logged and the game keeps running with in-memory state.
 *
 * Pass --no-firestore (CLI arg) or set NO_FIRESTORE=1 (env var) to disable Firestore entirely
 * and keep all state in memory. Useful for fast local iteration without the emulator.
 */

const NO_FIRESTORE = process.env.NO_FIRESTORE === '1' || process.argv.includes('--no-firestore');

if (NO_FIRESTORE) {
  console.log('[persist] --no-firestore mode: all state is in-memory only');
}

// ── In-memory store (used when NO_FIRESTORE is set) ──────────────────────────

let _memWorld = null;
const _memPlayers = {};

// ── Firestore ────────────────────────────────────────────────────────────────

let _db = null;
function db() {
  if (!_db) {
    const { Firestore } = require('@google-cloud/firestore');
    _db = new Firestore();
  }
  return _db;
}

// ── World ────────────────────────────────────────────────────────────────────

async function loadWorldState() {
  if (NO_FIRESTORE) return _memWorld;
  try {
    const snap = await db().collection('game').doc('world').get();
    if (!snap.exists) {
      console.log('[persist] no saved world — starting fresh');
      return null;
    }
    console.log('[persist] world state loaded from Firestore');
    return snap.data();
  } catch (err) {
    console.warn('[persist] loadWorldState error:', err.message);
    return null;
  }
}

async function saveWorldState(state) {
  if (NO_FIRESTORE) { _memWorld = state; return; }
  try {
    await db().collection('game').doc('world').set(state);
    console.log('[persist] world state saved');
  } catch (err) {
    console.warn('[persist] saveWorldState error:', err.message);
  }
}

// ── Players ──────────────────────────────────────────────────────────────────

async function loadPlayerInventory(name) {
  if (NO_FIRESTORE) return _memPlayers[name] ?? null;
  try {
    const snap = await db().collection('players').doc(name).get();
    if (!snap.exists) return null;
    return snap.data();
  } catch (err) {
    console.warn(`[persist] loadPlayerInventory(${name}) error:`, err.message);
    return null;
  }
}

const _playerSaveTimers = {};

function savePlayerInventory(name, inventory) {
  if (NO_FIRESTORE) {
    _memPlayers[name] = { seeds: inventory.seeds, cacao: inventory.cacao, money: inventory.money };
    return;
  }
  if (_playerSaveTimers[name]) clearTimeout(_playerSaveTimers[name]);
  _playerSaveTimers[name] = setTimeout(async () => {
    delete _playerSaveTimers[name];
    try {
      // Only persist durable stats — hasWater is ephemeral (reset each session)
      await db().collection('players').doc(name).set({
        seeds: inventory.seeds,
        cacao: inventory.cacao,
        money: inventory.money,
      });
      console.log(`[persist] player saved: ${name}`);
    } catch (err) {
      console.warn(`[persist] savePlayerInventory(${name}) error:`, err.message);
    }
  }, 5000);
}

module.exports = { loadWorldState, saveWorldState, loadPlayerInventory, savePlayerInventory };
