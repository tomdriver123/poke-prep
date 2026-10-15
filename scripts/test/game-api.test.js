'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const API = path.join(ROOT, 'server', 'game-api.js');
const SAMPLE = path.join(ROOT, 'content', 'sample');

const PORT = 40000 + Math.floor(Math.random() * 10000);
const BASE = `http://127.0.0.1:${PORT}`;

let tmp;
let vault;
let dataDir;
let staticDir;
let pokedex;
let offlineDir;
let child;
let log = '';

const get = (route) => fetch(BASE + route);
const post = (body, route = '/api/game/encounter') =>
  fetch(BASE + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const quiz = (id, result, extra = {}) => ({
  questionId: id,
  topic: 'web-fundamentals',
  pick: result === 'pass' ? 'A' : 'B',
  answer: 'A',
  result,
  answered: '2026-10-14T10:00:00-04:00',
  town: 'saffron-city',
  species: 'abra',
  ...extra,
});

const rowLines = () => fs.readFileSync(pokedex, 'utf8').split('\n').filter((l) => /^\| \d{4}-/.test(l));

async function waitFor(fn, timeoutMs, what) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}\n${log}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'game-api-test-'));
  vault = path.join(tmp, 'vault');
  dataDir = path.join(tmp, 'data');
  staticDir = path.join(tmp, 'www');
  fs.cpSync(SAMPLE, vault, { recursive: true });
  pokedex = path.join(vault, 'projects', 'game', 'pokedex.md');
  offlineDir = path.join(vault, 'projects', 'job-hunt', 'interview-prep', 'kb', 'offline');

  child = spawn(process.execPath, [API], {
    env: {
      ...process.env,
      POKE_HOST: '127.0.0.1',
      POKE_PORT: String(PORT),
      POKE_VAULT_DIR: vault,
      POKE_DATA_DIR: dataDir,
      POKE_STATIC_DIR: staticDir,
      POKE_TRAINER_NAME: 'Test Trainer',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  await waitFor(async () => {
    try {
      return (await get('/api/health')).ok;
    } catch {
      return false;
    }
  }, 10000, 'the server to start');
});

after(async () => {
  if (child) {
    const closed = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await closed;
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('health returns the resolved paths and settings', async () => {
  const res = await get('/api/health');
  assert.equal(res.status, 200);
  const h = await res.json();
  assert.equal(h.ok, true);
  assert.equal(h.vaultDir, vault);
  assert.equal(h.dataDir, dataDir);
  assert.equal(h.staticDir, staticDir);
  assert.equal(h.speciesDir, path.join(ROOT, 'content', 'species'));
  assert.equal(h.pokedexFile, pokedex);
  assert.equal(h.offlineDir, offlineDir);
  assert.equal(h.trainerName, 'Test Trainer');
  assert.equal(h.staticReady, false);
  assert.equal(h.port, PORT);
});

test('the app answers 503 JSON until it is built, then serves files with an SPA fallback', async () => {
  const before = await get('/');
  assert.equal(before.status, 503);
  assert.match(before.headers.get('content-type'), /application\/json/);
  assert.match((await before.json()).error, /npm run build/);

  fs.mkdirSync(staticDir, { recursive: true });
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>app</title>');
  fs.writeFileSync(path.join(staticDir, 'main.js'), 'console.log(1)');

  const index = await get('/');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);
  const deep = await get('/some/client/route?town=pewter-city');
  assert.equal(deep.status, 200);
  assert.match(await deep.text(), /<title>app<\/title>/);
  const js = await get('/main.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal((await get('/missing.js')).status, 404);
  assert.equal((await get('/..%2f..%2fpackage.json')).status, 404);
  assert.equal((await get('/api/nope')).status, 404);
  assert.equal((await fetch(BASE + '/', { method: 'DELETE' })).status, 405);
});

test('the first /assets/data request generates the data from the sample vault', async () => {
  assert.equal(fs.existsSync(path.join(dataDir, 'game.json')), false);
  const res = await get('/assets/data/game.json');
  assert.equal(res.status, 200);
  const game = await res.json();
  assert.equal(game.trainer.name, 'Test Trainer');
  assert.equal(game.party.length, 6);
  for (const name of ['towns.json', 'game.json', 'questions.json']) {
    assert.ok(fs.existsSync(path.join(dataDir, name)), `${name} was written to the data dir`);
  }
  const towns = await (await get('/assets/data/towns.json')).json();
  assert.equal(towns.length, 11);
  const bank = await (await get('/assets/data/questions.json')).json();
  assert.equal(bank.questions.length, 30);
  assert.equal((await get('/assets/data/nope.json')).status, 404);
  assert.equal((await get('/assets/data/..%2fgame.json')).status, 404);
  assert.equal((await get('/assets/data/game.txt')).status, 404);
});

test('a game.json from an earlier day is regenerated on the next request', async () => {
  const file = path.join(dataDir, 'game.json');
  const stale = { ...JSON.parse(fs.readFileSync(file, 'utf8')), generatedAt: '2020-01-01T12:00:00.000Z' };
  fs.writeFileSync(file, JSON.stringify(stale));
  const game = await (await get('/assets/data/game.json')).json();
  assert.notEqual(game.generatedAt, '2020-01-01T12:00:00.000Z');
  assert.equal(new Date(game.generatedAt).toDateString(), new Date().toDateString());
});

test('an encounter appends a pokedex row and writes an offline attempt file', async () => {
  const before = rowLines().length;
  const res = await post(quiz('web-005', 'pass'));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.deepEqual(body.row, { date: '2026-10-14', species: 'abra', town: 'saffron-city', question: 'web-005', result: 'caught' });
  assert.equal(body.entry.id, 'web-005');
  assert.equal(body.entry.source, 'dashboard');

  const lines = rowLines();
  assert.equal(lines.length, before + 1);
  assert.equal(lines[lines.length - 1], '| 2026-10-14 | abra | saffron-city | web-005 | caught |');
  assert.ok(fs.readFileSync(pokedex, 'utf8').endsWith('| 2026-10-14 | abra | saffron-city | web-005 | caught |\n'));

  assert.equal(
    fs.readFileSync(path.join(offlineDir, 'web-005.md'), 'utf8'),
    '---\nid: web-005\nquestion: web-005\ntopic: web-fundamentals\npick: A\nanswer: A\nresult: pass\n' +
      'answered: 2026-10-14T10:00:00-04:00\nsource: dashboard\n---\n'
  );
});

test('a repeated encounter is idempotent', async () => {
  const before = rowLines().length;
  const res = await post(quiz('web-005', 'pass'));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).row.question, 'web-005');
  assert.equal(rowLines().length, before);
});

test('a second pass on a caught species pays XP and a miss flees', async () => {
  const xp = await (await post(quiz('js-001', 'pass', { topic: 'javascript-typescript', town: 'celadon-city', species: 'oddish' }))).json();
  assert.equal(xp.row.result, 'caught', 'a different species is a new catch');
  const again = await post(quiz('web-009', 'pass', { species: 'abra' }));
  assert.equal(again.status, 201);
  assert.equal((await again.json()).row.result, 'xp');
  const miss = await post(quiz('web-010', 'miss', { species: 'drowzee' }));
  assert.equal(miss.status, 201);
  assert.equal((await miss.json()).row.result, 'fled');
  assert.ok(fs.existsSync(path.join(offlineDir, 'web-010.md')));
});

test('encounter validation', async () => {
  const bad = async (body, status, pattern) => {
    const res = await post(body);
    assert.equal(res.status, status, JSON.stringify(body));
    assert.match((await res.json()).error, pattern);
  };
  await bad(quiz('web-011', 'pass', { town: 'Saffron City' }), 400, /town must match/);
  await bad(quiz('web-011', 'pass', { species: 'A' }), 400, /species must match/);
  await bad(quiz('web-011', 'pass', { answered: '2026-10-14T10:00:00Z' }), 400, /answered must be/);
  await bad(quiz('web-011', 'pass', { town: 'nowhere-town' }), 404, /unknown town/);
  await bad(quiz('WEB-11', 'pass'), 400, /questionId must match/);
  await bad(quiz('web-011', 'pass', { pick: 'Z' }), 400, /pick must match/);
  await bad(quiz('web-011', 'maybe'), 400, /result must be/);
  await bad(quiz(null, 'pass'), 400, /questionId is required/);
  await bad('[1]', 400, /JSON object/);
  await bad('not json', 400, /invalid JSON/);
  assert.equal(fs.existsSync(path.join(offlineDir, 'web-011.md')), false, 'nothing was written for a rejected body');
  const huge = await post('x'.repeat(5000));
  assert.equal(huge.status, 413);
});

test('a free catch needs an open species gate', async () => {
  const free = { questionId: null, town: 'cerulean-city', species: 'mewtwo', answered: '2026-10-14T11:00:00-04:00' };
  assert.equal((await post(free)).status, 400, 'the gate is closed in the sample vault');

  // A signed full-time offer opens the cave. The next data request regenerates the stale JSON.
  fs.writeFileSync(
    path.join(vault, 'projects', 'job-hunt', 'pipeline', 'initech-offer.md'),
    '---\nid: initech-offer\ncompany: Initech\nstatus: offer\nemployment: full-time\nstages: []\n---\n'
  );
  fs.rmSync(path.join(dataDir, 'game.json'));
  const towns = await (await get('/assets/data/towns.json')).json();
  const cave = towns.find((t) => t.id === 'cerulean-city');
  assert.equal(cave.gates.find((g) => g.species === 'mewtwo').open, true);

  const caught = await post(free);
  assert.equal(caught.status, 201);
  assert.deepEqual((await caught.json()).row, { date: '2026-10-14', species: 'mewtwo', town: 'cerulean-city', question: 'free', result: 'caught' });
  const again = await post(free);
  assert.equal(again.status, 200, 'one free catch per species and season');
});

test('quiz attempts are listed oldest first and POST /api/quiz/attempt is idempotent', async () => {
  const first = await post(quiz('js-002', 'pass', { answered: '2026-10-13T09:00:00-04:00' }), '/api/quiz/attempt');
  assert.equal(first.status, 201);
  const attemptOnly = await first.json();
  assert.equal(attemptOnly.entry.id, 'js-002');
  assert.equal((await post(quiz('js-002', 'pass'), '/api/quiz/attempt')).status, 200);
  assert.equal((await post(quiz('js-003', 'pass', { pick: 'Q' }), '/api/quiz/attempt')).status, 400);

  const list = await (await get('/api/quiz/attempts')).json();
  const ids = list.entries.map((e) => e.id);
  assert.ok(ids.includes('web-005') && ids.includes('js-002'));
  assert.equal(ids[0], 'js-002', 'the 10-13 attempt sorts before the 10-14 ones');
  const stamps = list.entries.map((e) => Date.parse(e.answered));
  assert.deepEqual(stamps, [...stamps].sort((a, b) => a - b));
  assert.equal(list.entries.find((e) => e.id === 'web-005').result, 'pass');
});

test('the debounced regeneration after an encounter updates game.json', async () => {
  const seen = async () => (await (await get('/assets/data/game.json')).json()).trainer.pokedex.seen;
  const target = await seen();
  await post(quiz('web-012', 'pass', { species: 'mr-mime' }));
  const final = await waitFor(async () => ((await seen()) > target ? true : false), 15000, 'game.json to pick up the new catch');
  assert.ok(final);
});
