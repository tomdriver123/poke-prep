'use strict';

/**
 * Path and settings resolver shared by the generator and the server.
 *
 * Everything is configured through POKE_* environment variables. Relative values resolve against
 * the repository root (not the working directory), so `npm run serve` and a direct
 * `node server/game-api.js` from anywhere agree. An empty variable counts as unset.
 *
 *   POKE_HOST          bind address for the server           (127.0.0.1)
 *   POKE_PORT          server port                           (4401)
 *   POKE_VAULT_DIR     the vault the game reads and writes   (data/sample-vault, seeded from content/sample)
 *   POKE_DATA_DIR      where generated JSON is written       (data/generated)
 *   POKE_SPECIES_DIR   the PokeAPI species cache             (content/species)
 *   POKE_STATIC_DIR    the built app the server serves       (www)
 *   POKE_TRAINER_NAME  name on the trainer card              (Trainer)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SAMPLE_VAULT_SOURCE = path.join(ROOT, 'content', 'sample');

function resolvePaths(env = process.env) {
  const set = (name) => (env[name] !== undefined && env[name] !== '' ? env[name] : null);
  const dir = (name, fallback) => path.resolve(ROOT, set(name) || fallback);

  const portText = set('POKE_PORT');
  const port = portText === null ? 4401 : Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`POKE_PORT must be an integer from 0 to 65535, got "${portText}"`);
  }

  return {
    root: ROOT,
    host: set('POKE_HOST') || '127.0.0.1',
    port,
    vaultDir: dir('POKE_VAULT_DIR', path.join('data', 'sample-vault')),
    // True when POKE_VAULT_DIR is unset: only then may a missing vault be seeded from the sample.
    defaultVault: set('POKE_VAULT_DIR') === null,
    sampleVaultSource: SAMPLE_VAULT_SOURCE,
    dataDir: dir('POKE_DATA_DIR', path.join('data', 'generated')),
    speciesDir: dir('POKE_SPECIES_DIR', path.join('content', 'species')),
    staticDir: dir('POKE_STATIC_DIR', 'www'),
    trainerName: set('POKE_TRAINER_NAME') || 'Trainer',
  };
}

/**
 * Makes sure the vault directory exists. The default vault is seeded by copying content/sample
 * the first time; a vault the user pointed at explicitly is never created or seeded, a missing
 * one is an error. Returns true when it seeded.
 */
function ensureVault(paths) {
  if (fs.existsSync(paths.vaultDir)) return false;
  if (!paths.defaultVault) {
    throw new Error(`POKE_VAULT_DIR does not exist: ${paths.vaultDir}`);
  }
  fs.mkdirSync(path.dirname(paths.vaultDir), { recursive: true });
  fs.cpSync(paths.sampleVaultSource, paths.vaultDir, { recursive: true });
  return true;
}

module.exports = { ROOT, resolvePaths, ensureVault };
