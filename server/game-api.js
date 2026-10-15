#!/usr/bin/env node
'use strict';

/**
 * server/game-api.js
 *
 * Tiny zero dependency HTTP server behind Poke Prep. One process, one origin:
 *
 *   GET  /api/health              the resolved paths and settings
 *   POST /api/game/encounter      a quiz answer (or a gated free catch) becomes one row in
 *                                 <vault>/projects/game/pokedex.md, and quiz answers also drop an
 *                                 offline attempt file under .../interview-prep/kb/offline/
 *   POST /api/quiz/attempt        the same attempt file without a pokedex row
 *   GET  /api/quiz/attempts       the attempt files, oldest first
 *   GET  /assets/data/*.json      generated towns.json, game.json and questions.json from the data
 *                                 dir, regenerated first when they are missing or not from today
 *   GET  anything else            the built app from POKE_STATIC_DIR with a fallback to index.html
 *                                 for client side routes (503 JSON until the app is built)
 *
 * The file formats written here are a contract with other tools that read the same vault, see the
 * "Vault contract" section of the README. Settings come from POKE_* variables, see
 * scripts/lib/paths.js. The server binds POKE_HOST (127.0.0.1 by default); there is no CORS support
 * because there is no cross-origin caller.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const { resolvePaths, ensureVault } = require('../scripts/lib/paths');

let CONFIG;
try {
  CONFIG = resolvePaths();
  if (ensureVault(CONFIG)) console.log(`seeded the sample vault at ${CONFIG.vaultDir}`);
} catch (err) {
  console.error(`game-api: ${err.message}`);
  process.exit(1);
}

const { host: HOST, port: PORT, vaultDir: VAULT, dataDir: DATA_DIR, speciesDir: SPECIES_DIR, staticDir: STATIC_DIR } = CONFIG;
const GENERATOR = path.resolve(__dirname, '..', 'scripts', 'generate-game-data.js');

// ── paths and limits ──────────────────────────────────────────────────────

const GAME_DIR = path.join(VAULT, 'projects', 'game');
const POKEDEX_FILE = path.join(GAME_DIR, 'pokedex.md');
const OFFLINE_DIR = path.join(VAULT, 'projects', 'job-hunt', 'interview-prep', 'kb', 'offline');

const TOWN_RE = /^[a-z]+(-[a-z]+)*$/;
const SPECIES_RE = /^[a-z][a-z0-9-]{1,30}$/;
const QUESTION_ID_RE = /^[a-z]{2,6}-\d{3,}$/;
const QUIZ_TOPIC_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const LETTER_RE = /^[A-F]$/;
const QUIZ_RESULTS = ['pass', 'miss'];
const ANSWERED_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
const MAX_QUIZ_BODY_BYTES = 4096;
const MAX_ENCOUNTER_BODY_BYTES = 4096;
const DATA_FILE_RE = /^[a-z0-9-]+\.json$/;
const GENERATED_FILES = ['towns.json', 'game.json', 'questions.json'];

const GAME_REGEN_DEBOUNCE_MS = 3000;
const GENERATOR_TIMEOUT_MS = 120000;

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// ── response and body helpers ─────────────────────────────────────────────

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// Reads the request body with a running byte counter. Resolves null after answering 413 (or when
// the connection dies).
function readBody(req, res, maxBytes) {
  return new Promise((resolve) => {
    let total = 0;
    const chunks = [];
    let finished = false;

    const overLimit = () => {
      if (finished) return;
      finished = true;
      sendJson(res, 413, { error: `request body exceeds ${maxBytes} bytes` });
      req.destroy();
      resolve(null);
    };

    req.on('data', (chunk) => {
      if (finished) return;
      total += chunk.length;
      if (total > maxBytes) {
        overLimit();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (finished) return;
      finished = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', () => {
      if (finished) return;
      finished = true;
      resolve(null);
    });
  });
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

// ── generated data: lazy and debounced regeneration ──────────────────────

function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Fresh means all three generated files exist and game.json was generated today (local date).
function generatedIsFresh() {
  for (const name of GENERATED_FILES) {
    if (!fs.existsSync(path.join(DATA_DIR, name))) return false;
  }
  try {
    const game = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'game.json'), 'utf8'));
    const when = new Date(game.generatedAt);
    return !Number.isNaN(when.getTime()) && localDate(when) === localDate(new Date());
  } catch {
    return false;
  }
}

function runGenerator() {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [GENERATOR, '--offline', '--vault', VAULT, '--out', DATA_DIR, '--species', SPECIES_DIR],
      {
        cwd: path.resolve(__dirname, '..'),
        timeout: GENERATOR_TIMEOUT_MS,
        env: { ...process.env, POKE_TRAINER_NAME: CONFIG.trainerName },
      },
      (err, _stdout, stderr) => {
        if (err) reject(new Error((stderr && stderr.trim()) || err.message));
        else resolve();
      }
    );
  });
}

// One generator run at a time. A request that arrives mid run marks the output dirty, so a second
// run starts when the first ends and picks up whatever was written in between.
let inflight = null;
let dirty = false;
function regenerate() {
  if (inflight) {
    dirty = true;
    return inflight;
  }
  const run = runGenerator().finally(() => {
    inflight = null;
    if (dirty) {
      dirty = false;
      regenerate().catch(logError);
    }
  });
  inflight = run;
  return run;
}

function logError(err) {
  process.stderr.write(`[game-api] generator failed: ${err.message}\n`);
}

// Makes sure usable generated files exist. Stale files are regenerated first, but if that fails
// the stale copy still serves. Resolves true when the files are usable.
async function ensureGenerated() {
  if (generatedIsFresh()) return true;
  try {
    await regenerate();
  } catch (err) {
    logError(err);
  }
  return GENERATED_FILES.every((name) => fs.existsSync(path.join(DATA_DIR, name)));
}

let gameRegenTimer = null;
function scheduleGameRegen() {
  if (gameRegenTimer) clearTimeout(gameRegenTimer);
  gameRegenTimer = setTimeout(() => {
    gameRegenTimer = null;
    regenerate().catch(logError);
  }, GAME_REGEN_DEBOUNCE_MS);
}

// ── quiz offline attempts ─────────────────────────────────────────────────
// Each attempt is one frontmatter-only file, <OFFLINE_DIR>/<questionId>.md. Another tool can
// reconcile these into a question log later and delete the file as it goes.

function offlineEntryPath(questionId) {
  return path.join(OFFLINE_DIR, `${questionId}.md`);
}

function parseOfflineEntry(raw) {
  if (!raw.startsWith('---\n')) return null;
  const lines = raw.split('\n');

  let i = 1;
  const fmLines = [];
  let closed = false;
  for (; i < lines.length; i++) {
    if (lines[i] === '---') {
      closed = true;
      break;
    }
    fmLines.push(lines[i]);
  }
  if (!closed) return null;

  const fm = {};
  for (const line of fmLines) {
    const m = /^([a-zA-Z_]+):\s*(.*)$/.exec(line);
    if (m) fm[m[1]] = m[2].trim();
  }

  return {
    id: fm.id ?? null,
    question: fm.question ?? null,
    topic: fm.topic ?? null,
    pick: fm.pick ?? null,
    answer: fm.answer ?? null,
    result: fm.result ?? null,
    answered: fm.answered ?? null,
    source: fm.source ?? null,
  };
}

function readOfflineEntry(questionId) {
  const fp = offlineEntryPath(questionId);
  if (!fs.existsSync(fp)) return null;
  try {
    return parseOfflineEntry(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

function listOfflineEntries() {
  let files;
  try {
    files = fs.readdirSync(OFFLINE_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    files = [];
  }

  const entries = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(OFFLINE_DIR, file), 'utf8');
      const entry = parseOfflineEntry(raw);
      if (!entry) throw new Error('missing or malformed frontmatter block');
      entries.push(entry);
    } catch (err) {
      process.stderr.write(`[game-api] skipping unparsable offline entry ${file}: ${err.message}\n`);
    }
  }

  entries.sort((a, b) => {
    const ad = a.answered ? Date.parse(a.answered) : NaN;
    const bd = b.answered ? Date.parse(b.answered) : NaN;
    const aValid = !Number.isNaN(ad);
    const bValid = !Number.isNaN(bd);
    if (aValid && bValid && ad !== bd) return ad - bd;
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    return String(a.id).localeCompare(String(b.id));
  });

  return entries;
}

// Validates the quiz fields and writes the offline attempt file. Returns { status, entry } or
// { status: 400, error }; never touches the response.
function writeOfflineAttempt(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return { status: 400, error: 'body must be a JSON object' };
  }
  const { questionId, topic, pick, answer, result, answered } = fields;

  if (typeof questionId !== 'string' || !QUESTION_ID_RE.test(questionId)) {
    return { status: 400, error: 'questionId must match /^[a-z]{2,6}-\\d{3,}$/' };
  }
  if (typeof topic !== 'string' || !QUIZ_TOPIC_RE.test(topic)) {
    return { status: 400, error: 'topic must match /^[a-z0-9][a-z0-9-]{0,31}$/' };
  }
  if (typeof pick !== 'string' || !LETTER_RE.test(pick)) {
    return { status: 400, error: 'pick must match /^[A-F]$/' };
  }
  if (typeof answer !== 'string' || !LETTER_RE.test(answer)) {
    return { status: 400, error: 'answer must match /^[A-F]$/' };
  }
  if (typeof result !== 'string' || !QUIZ_RESULTS.includes(result)) {
    return { status: 400, error: `result must be one of ${QUIZ_RESULTS.join(', ')}` };
  }
  if (typeof answered !== 'string' || !ANSWERED_RE.test(answered) || Number.isNaN(Date.parse(answered))) {
    return {
      status: 400,
      error: 'answered must match /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}[+-]\\d{2}:\\d{2}$/ with an explicit local offset (no Z) and be parseable',
    };
  }

  // Idempotent retry: the file already exists. Report what is actually stored and write nothing new.
  const existing = readOfflineEntry(questionId);
  if (existing) return { status: 200, entry: existing };

  fs.mkdirSync(OFFLINE_DIR, { recursive: true });

  const fp = offlineEntryPath(questionId);
  const resolved = path.resolve(fp);
  if (resolved !== fp || !resolved.startsWith(OFFLINE_DIR + path.sep)) {
    return { status: 400, error: 'invalid questionId path' };
  }

  const md =
    `---\n` +
    `id: ${questionId}\n` +
    `question: ${questionId}\n` +
    `topic: ${topic}\n` +
    `pick: ${pick}\n` +
    `answer: ${answer}\n` +
    `result: ${result}\n` +
    `answered: ${answered}\n` +
    `source: dashboard\n` +
    `---\n`;

  try {
    writeAtomic(resolved, md);
  } catch (err) {
    return { status: 500, error: `failed to write attempt: ${err.message}` };
  }

  return { status: 201, entry: readOfflineEntry(questionId) };
}

async function handleQuizAttempt(req, res) {
  const raw = await readBody(req, res, MAX_QUIZ_BODY_BYTES);
  if (raw === null) return; // 413 already sent, or the connection died

  let data;
  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' });
    return;
  }

  const out = writeOfflineAttempt(data);
  if (out.error) {
    sendJson(res, out.status, { error: out.error });
    return;
  }
  sendJson(res, out.status, { entry: out.entry });
}

function handleQuizAttempts(res) {
  sendJson(res, 200, { entries: listOfflineEntries() });
}

// ── POST /api/game/encounter ──────────────────────────────────────────────

function readTownsFile() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'towns.json'), 'utf8'));
  } catch {
    return null;
  }
  return Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.towns) ? parsed.towns : null;
}

function hasOpenSpeciesGate(town, species) {
  const gates = Array.isArray(town.gates) ? town.gates : [];
  return gates.some((g) => g && g.scope === 'species' && g.species === species && g.open === true);
}

// Pokedex table parse. Returns { lines, rows, lastRowIdx, started } where rows are
// { date, species, town, question, result } and lastRowIdx is the index in lines of the last table
// row (or the separator line if there are no data rows). started is the current season's start.
function parsePokedex(raw) {
  const lines = raw.split('\n');
  let season = 1;
  const seasons = [];
  if (lines[0] === '---') {
    let inSeasons = false;
    for (let i = 1; i < lines.length && lines[i] !== '---'; i++) {
      const line = lines[i];
      const sm = /^season:\s*(\d+)\s*$/.exec(line);
      if (sm) {
        season = Number(sm[1]);
        inSeasons = false;
        continue;
      }
      if (/^seasons:\s*$/.test(line)) {
        inSeasons = true;
        continue;
      }
      if (inSeasons) {
        const m = /^\s*-\s*\{\s*number:\s*(\d+)\s*,\s*started:\s*(\d{4}-\d{2}-\d{2})\s*\}\s*$/.exec(line);
        if (m) seasons.push({ number: Number(m[1]), started: m[2] });
        else if (/^\S/.test(line)) inSeasons = false;
      }
    }
  }
  const current = seasons.find((x) => x.number === season);
  const started = current ? current.started : '0000-00-00';

  const rows = [];
  let headerIdx = -1;
  let lastRowIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerIdx < 0) {
      if (/^\|\s*Date\s*\|\s*Species\s*\|\s*Town\s*\|\s*Question\s*\|\s*Result\s*\|\s*$/.test(lines[i])) {
        headerIdx = i;
        lastRowIdx = i + 1; // separator line
        i++;
      }
      continue;
    }
    if (!lines[i].startsWith('|')) break;
    const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 5) break;
    rows.push({ date: cells[0], species: cells[1], town: cells[2], question: cells[3], result: cells[4] });
    lastRowIdx = i;
  }
  if (headerIdx < 0) return null;
  return { lines, rows, lastRowIdx, started };
}

async function handleGameEncounter(req, res) {
  const raw = await readBody(req, res, MAX_ENCOUNTER_BODY_BYTES);
  if (raw === null) return; // 413 already sent, or the connection died

  let data;
  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' });
    return;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    sendJson(res, 400, { error: 'body must be a JSON object' });
    return;
  }

  const { questionId, town, species, answered } = data;

  if (typeof town !== 'string' || !TOWN_RE.test(town)) {
    sendJson(res, 400, { error: 'town must match /^[a-z]+(-[a-z]+)*$/' });
    return;
  }
  if (typeof species !== 'string' || !SPECIES_RE.test(species)) {
    sendJson(res, 400, { error: 'species must match /^[a-z][a-z0-9-]{1,30}$/' });
    return;
  }
  if (typeof answered !== 'string' || !ANSWERED_RE.test(answered) || Number.isNaN(Date.parse(answered))) {
    sendJson(res, 400, {
      error: 'answered must be a local ISO timestamp with an explicit offset (no Z) and be parseable',
    });
    return;
  }

  // The town list comes from the generated towns.json; build it first when it does not exist yet.
  if (!readTownsFile()) await ensureGenerated();
  const towns = readTownsFile();
  if (!towns) {
    sendJson(res, 503, { error: 'towns.json is missing or unreadable, run the game generator' });
    return;
  }
  const townRow = towns.find((t) => t && t.id === town);
  if (!townRow) {
    sendJson(res, 404, { error: `unknown town ${town}` });
    return;
  }

  // Everything from here on is synchronous, so the single thread is the lock.
  const freeCatch = questionId === null;
  if (freeCatch && !hasOpenSpeciesGate(townRow, species)) {
    sendJson(res, 400, { error: 'questionId is required unless an open species gate allows a free catch' });
    return;
  }

  let result;
  let entry = null;
  if (!freeCatch) {
    const out = writeOfflineAttempt(data);
    if (out.error) {
      sendJson(res, out.status, { error: out.error });
      return;
    }
    entry = out.entry;
    result = out.status === 200 && entry && entry.result ? entry.result : data.result;
  }

  let pokedexText;
  try {
    pokedexText = fs.readFileSync(POKEDEX_FILE, 'utf8');
  } catch (err) {
    sendJson(res, 500, { error: `failed to read pokedex: ${err.message}` });
    return;
  }
  const dex = parsePokedex(pokedexText);
  if (!dex) {
    sendJson(res, 500, { error: 'pokedex.md has no Date | Species | Town | Question | Result table' });
    return;
  }

  const questionCell = freeCatch ? 'free' : questionId;
  const caughtThisSeason = (r) => r.species === species && r.result === 'caught' && r.date >= dex.started;

  if (freeCatch) {
    const prior = dex.rows.find((r) => r.question === 'free' && caughtThisSeason(r));
    if (prior) {
      sendJson(res, 200, { row: prior });
      return;
    }
  } else {
    const prior = dex.rows.find((r) => r.question === questionId);
    if (prior) {
      sendJson(res, 200, { entry, row: prior });
      return;
    }
  }

  let outcome;
  if (freeCatch) outcome = 'caught';
  else if (result === 'miss') outcome = 'fled';
  else outcome = dex.rows.some(caughtThisSeason) ? 'xp' : 'caught';

  const row = { date: answered.slice(0, 10), species, town, question: questionCell, result: outcome };
  const line = `| ${row.date} | ${row.species} | ${row.town} | ${row.question} | ${row.result} |`;
  const lines = dex.lines.slice();
  lines.splice(dex.lastRowIdx + 1, 0, line);
  const text = lines.join('\n').replace(/\n*$/, '\n');

  try {
    writeAtomic(POKEDEX_FILE, text);
  } catch (err) {
    sendJson(res, 500, { error: `failed to write pokedex: ${err.message}` });
    return;
  }

  scheduleGameRegen();
  sendJson(res, 201, { entry, row });
}

// ── static files ──────────────────────────────────────────────────────────

// Resolve a request path inside a root dir, refusing anything that escapes it.
function safeStaticPath(rootDir, relPath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, '.' + relPath);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

function sendFile(res, method, filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const type = STATIC_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  });
  if (method === 'HEAD') res.end();
  else fs.createReadStream(filePath).pipe(res);
  return true;
}

// GET /assets/data/<name>.json from the data dir, never from the build.
async function serveGeneratedData(res, method, decoded) {
  const name = decoded.slice('/assets/data/'.length);
  if (!DATA_FILE_RE.test(name)) {
    sendJson(res, 404, { error: 'not found' });
    return;
  }
  if (!(await ensureGenerated())) {
    sendJson(res, 500, { error: 'game data could not be generated, see the server log' });
    return;
  }
  const file = safeStaticPath(DATA_DIR, `/${name}`);
  if (!file || !sendFile(res, method, file)) sendJson(res, 404, { error: 'not found' });
}

// Everything else: the build, then the fallback to index.html for client side routes.
function serveApp(res, method, decoded) {
  const index = path.join(STATIC_DIR, 'index.html');
  if (!fs.existsSync(index)) {
    sendJson(res, 503, { error: 'the app is not built yet, run `npm run build` and reload' });
    return;
  }
  const built = safeStaticPath(STATIC_DIR, decoded);
  if (built && path.extname(decoded) !== '' && sendFile(res, method, built)) return;
  if (built && path.extname(decoded) === '' && sendFile(res, method, index)) return;
  sendJson(res, 404, { error: 'not found' });
}

// ── routing ───────────────────────────────────────────────────────────────

async function handleRequest(req, res, method, pathname) {
  if (method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
      vaultDir: VAULT,
      dataDir: DATA_DIR,
      speciesDir: SPECIES_DIR,
      staticDir: STATIC_DIR,
      staticReady: fs.existsSync(path.join(STATIC_DIR, 'index.html')),
      gameDir: GAME_DIR,
      pokedexFile: POKEDEX_FILE,
      offlineDir: OFFLINE_DIR,
      trainerName: CONFIG.trainerName,
      generatedFresh: generatedIsFresh(),
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/quiz/attempt') {
    await handleQuizAttempt(req, res);
    return;
  }

  if (method === 'POST' && pathname === '/api/game/encounter') {
    await handleGameEncounter(req, res);
    return;
  }

  if (method === 'GET' && pathname === '/api/quiz/attempts') {
    handleQuizAttempts(res);
    return;
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'not found' });
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, { error: 'invalid path encoding' });
    return;
  }
  if (decoded.includes('\0')) {
    sendJson(res, 400, { error: 'invalid path' });
    return;
  }

  if (decoded.startsWith('/assets/data/')) {
    await serveGeneratedData(res, method, decoded);
    return;
  }
  serveApp(res, method, decoded);
}

// ── boot ──────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const start = process.hrtime.bigint();
  const method = req.method || 'GET';

  let pathname;
  try {
    pathname = new URL(req.url, `http://${HOST}`).pathname;
  } catch {
    sendJson(res, 400, { error: 'invalid request url' });
    return;
  }

  let logged = false;
  const originalEnd = res.end.bind(res);
  res.end = (...args) => {
    if (!logged) {
      logged = true;
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`${method} ${pathname} ${res.statusCode} ${ms.toFixed(1)}ms`);
    }
    return originalEnd(...args);
  };

  handleRequest(req, res, method, pathname).catch((err) => {
    process.stderr.write(`[game-api] unhandled error: ${err.stack || err.message}\n`);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal server error' });
    } else {
      res.end();
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`game-api: ${HOST}:${PORT} is already in use (set POKE_PORT to use another port)`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`poke-prep listening on http://${HOST}:${server.address().port} (vault: ${VAULT})`);
  // The vault may have changed while the server was down (or the data dir may hold files
  // generated from another vault), so a start always regenerates once in the background.
  regenerate().catch(logError);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (gameRegenTimer) clearTimeout(gameRegenTimer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
