const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const g = require('../generate-game-data.js');

// The sample vault that ships in content/sample (invented companies and people) and the cached
// PokeAPI species files. The tests never touch anything outside the repo.
const ROOT = path.join(__dirname, '..', '..');
const SAMPLE_VAULT = path.join(ROOT, 'content', 'sample');
const SPECIES_DIR = path.join(ROOT, 'content', 'species');
const SAMPLE_PIPELINES = path.join(SAMPLE_VAULT, 'projects/job-hunt/pipeline');

const BANKS_TABLE = `## Banks

| Bank | Track | Town |
|---|---|---|
| angular | Subject knowledge | Saffron City |
| ai-native | AI knowledge | Cerulean City |
`;
const MINI_TOWNS = `# Towns

## Party

| Slot | Track | Type | Gym town |
|---|---|---|---|
| 1 | AI judgment | Fire | Cinnabar Island |
| 2 | AI knowledge | Water | Cerulean City |
| 3 | Velocity | Electric | Vermilion City |
| 4 | DSA | Rock | Pewter City |
| 5 | Subject knowledge | Psychic | Saffron City |
| 6 | Hunt grind | Normal | Fuchsia City |

## Encounter tables

| Town | Role | Track served | Pool | Gate |
|---|---|---|---|---|
| Pallet Town | Home. Starter | none | Charmander (gift) | none |
| Viridian City | Scout town | next round's track | Pidgey | none |

${BANKS_TABLE}
## Gates

| Town | Species | Kind |
|---|---|---|
| Lavender Town | town | rejection-past-screen |

## Map

| Town | X | Y |
|---|---|---|
| Pallet Town | 3 | 14 |

## Routes

| From | To |
|---|---|
| Pallet Town | Viridian City |

## Seasons

| Season | Started | Ended |
|---|---|---|
| 1 | 2026-08-12 | |
`;

const tmpDirs = [];
test.after(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function makeVault(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-vault-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries({ 'projects/game/towns.md': MINI_TOWNS, ...files })) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
  return dir;
}

const BANK_ANGULAR = `---
topic: angular
---
# Angular

## Questions

### ng-001
level: senior

**Attempts**
2026-10-10 mcq A pass tier0

### ng-002
level: medium

**Attempts**
2026-08-01 mcq B pass tier0
2026-09-23 recall pass tier1

### ng-003
level: fundamentals

**Attempts**
2026-10-10 mcq C miss tier0
`;

function dexTable(rows) {
  return `---\ntitle: x\n---\n| Date | Species | Town | Question | Result |\n|---|---|---|---|---|\n${rows.join('\n')}\n`;
}

async function buildMini(files) {
  const vault = makeVault(files);
  const r = await g.build({ vaultDir: vault, speciesDir: SPECIES_DIR, offline: true, now: '2026-10-14T12:00:00-04:00' });
  return r.game;
}

const slotXp = (game, track) => game.party.find(p => p.track === track).xp;

// ── towns.md on the sample vault ─────────────────────────────────────────

test('sample towns.md parses to the expected table sizes', () => {
  const T = g.parseTowns(fs.readFileSync(path.join(SAMPLE_VAULT, 'projects/game/towns.md'), 'utf-8'));
  assert.equal(T.encounters.length, 11);
  assert.equal(T.party.length, 6);
  assert.equal(T.banks.length, 2);
  assert.equal(T.gates.length, 3);
  assert.equal(Object.keys(T.grid).length, 11);
  assert.equal(T.routes.length, 12);
  assert.equal(g.currentSeason(T.seasons).started, '2026-09-01');
});

test('the sample vault builds end to end offline with a header only pokedex', async () => {
  const r = await g.build({ vaultDir: SAMPLE_VAULT, speciesDir: SPECIES_DIR, offline: true, now: '2026-10-14T14:00:00-04:00' });
  assert.deepEqual(r.warnings, [], 'the sample vault builds without warnings');
  assert.equal(r.towns.length, 11);
  assert.equal(r.game.party.length, 6);
  assert.equal(r.game.trainer.pokedex.seen, 0);
  assert.equal(r.game.trainer.pokedex.caught, 0);
  assert.equal(r.game.scout.company, 'Acme');
  const viridian = r.towns.find(t => t.id === 'viridian-city');
  assert.equal(viridian.mode, 'scout');
  assert.equal(viridian.track, 'hunt-grind');
  assert.ok(r.game.trainer.xpTotal > 0, 'the sample bank, kb-log, drill and application rows pay some xp');
});

test('tableUnder returns the first table after a heading', () => {
  const rows = g.tableUnder('## A\n\ntext\n\n| X | Y |\n|---|---|\n| 1 | 2 |\n\n## B\n\n| Z |\n|---|\n| 9 |\n', 'A');
  assert.deepEqual(rows, [{ x: '1', y: '2' }]);
  assert.deepEqual(g.tableUnder('## A\n\n## B\n| Z |\n|---|\n| 9 |\n', 'A'), []);
});

test('pool parsing strips parentheticals, flags gifts and slugs Mr. Mime', () => {
  assert.deepEqual(g.parsePool('Charmander (gift)'), [{ species: 'charmander', gift: true }]);
  const p = g.parsePool('Chansey, Tauros, Kangaskhan (Safari exclusives, so grind pays in rare catches)');
  assert.deepEqual(p.map(x => x.species), ['chansey', 'tauros', 'kangaskhan']);
  assert.equal(p.some(x => x.gift), false);
  assert.equal(g.parsePool('Abra, Drowzee, Mr. Mime')[2].species, 'mr-mime');
  assert.equal(g.displayName('mr-mime'), 'Mr. Mime');
});

test('frontmatter dates stay strings', () => {
  const { data } = g.splitFrontmatter('---\nstarted: 2026-09-30\n---\nbody');
  assert.equal(data.started, '2026-09-30');
});

// ── levels ────────────────────────────────────────────────────────────────

test('medium slow levels from the cached charmander file', () => {
  const file = path.join(SPECIES_DIR, 'charmander.json');
  const c = JSON.parse(fs.readFileSync(file, 'utf-8'));
  assert.equal(c.levels.length, 100);
  assert.equal(g.levelFor(2535, c.levels), 16);
  assert.equal(g.levelFor(2534, c.levels), 15);
  assert.equal(g.levelFor(40007, c.levels), 36);
  assert.equal(g.levelFor(40006, c.levels), 35);
  const info = g.levelInfo(2535, c.levels);
  assert.equal(info.levelXp, 2535);
  assert.equal(info.progress, 0);
});

test('evolution chain node lookup finds pikachu under pichu', () => {
  const chain = {
    chain: {
      species: { name: 'pichu', url: 'https://pokeapi.co/api/v2/pokemon-species/172/' },
      evolves_to: [{
        species: { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon-species/25/' },
        evolution_details: [{ trigger: { name: 'level-up' }, min_level: null }],
        evolves_to: [{
          species: { name: 'raichu', url: 'https://pokeapi.co/api/v2/pokemon-species/26/' },
          evolution_details: [{ trigger: { name: 'use-item' }, min_level: null, item: { name: 'thunder-stone' } }],
          evolves_to: [],
        }],
      }],
    },
  };
  const node = g.findChainNode(chain, 'pikachu');
  assert.equal(node.species.name, 'pikachu');
  assert.deepEqual(g.evolutionsFromNode(node), [{ name: 'raichu', display: 'Raichu', dex: 26, trigger: 'use-item', minLevel: null, item: 'thunder-stone' }]);
  assert.equal(g.findChainNode(chain, 'mew'), null);
  // evolutions above dex 151 are dropped
  const n2 = { species: { name: 'x' }, evolves_to: [{ species: { name: 'pichu2', url: '.../172/' }, evolution_details: [] }] };
  assert.deepEqual(g.evolutionsFromNode(n2), []);
});

// ── XP ────────────────────────────────────────────────────────────────────

test('one senior pass at viridian pays 200 to its track and 100 to the other five', async () => {
  const game = await buildMini({
    'projects/job-hunt/interview-prep/kb/angular.md': '---\ntopic: angular\n---\n### ng-001\nlevel: senior\n\n**Attempts**\n2026-10-10 mcq A pass tier0\n',
    'projects/game/pokedex.md': dexTable(['| 2026-10-10 | pidgey | viridian-city | ng-001 | xp |']),
  });
  assert.equal(slotXp(game, 'subject-knowledge'), 200);
  for (const t of ['ai-judgment', 'ai-knowledge', 'velocity', 'dsa', 'hunt-grind']) assert.equal(slotXp(game, t), 100);
});

test('xp tiers: medium 50, fundamentals 20, season filter drops old events', async () => {
  const game = await buildMini({
    'projects/job-hunt/interview-prep/kb/angular.md': BANK_ANGULAR,
  });
  // ng-001 senior 100 (10-10); ng-002 medium 50 on 09-23 recall; 08-01 is before season start 08-12
  const sk = game.party.find(p => p.track === 'subject-knowledge');
  assert.equal(sk.xpBySource.question, 150);
  assert.equal(game.party.find(p => p.track === 'dsa').xp, 75);
});

test('dedup: kb-log, offline file and pokedex row for one id and date pay once', async () => {
  const files = {
    'projects/job-hunt/interview-prep/kb/angular.md': BANK_ANGULAR.replace('2026-09-23 recall pass tier1', '2026-09-23 recall miss tier1'),
    'projects/job-hunt/interview-prep/kb-log.md': '| Date | Topic | Question | Result | Next due |\n|---|---|---|---|---|\n| 2026-10-10 | angular | ng-001 OnPush | pass | none |\n',
    'projects/job-hunt/interview-prep/kb/offline/a.md': '---\nid: ng-001\nresult: pass\nanswered: 2026-10-10T21:15:00-04:00\n---\n',
    'projects/game/pokedex.md': dexTable(['| 2026-10-10 | pidgey | pewter-city | ng-001 | xp |']),
  };
  const once = await buildMini(files);
  assert.equal(once.party.find(p => p.track === 'subject-knowledge').xpBySource.question, 100);
  files['projects/game/pokedex.md'] = dexTable(['| 2026-10-10 | pidgey | viridian-city | ng-001 | xp |']);
  const doubled = await buildMini(files);
  assert.equal(doubled.party.find(p => p.track === 'subject-knowledge').xpBySource.question, 200);
});

test('unknown question id warns and pays 0', async () => {
  const game = await buildMini({
    'projects/job-hunt/interview-prep/kb-log.md': '| Date | Topic | Question | Result | Next due |\n|---|---|---|---|---|\n| 2026-10-10 | mystery | zz-001 thing | pass | none |\n',
  });
  assert.equal(game.trainer.xpTotal, 0);
  assert.ok(game.warnings.some(w => w.includes('zz-001')));
});

test('drill and hunt xp, hunt gets no share', async () => {
  const game = await buildMini({
    'projects/job-hunt/interview-prep/drill-log.md': '## Current position\n\n## History\n\n| Date | Problem | Pattern | Mode | Score | Result | Next due |\n|---|---|---|---|---|---|---|\n| 2026-10-01 | A | p | guided | **PASS** | ok | 2026-10-05 |\n| 2026-10-02 | B | p | guided | 3/5 | x | 2026-10-05 |\n| 2026-10-03 | C | p | guided | 1/5 | x | 2026-10-05 |\n| 2026-10-04 | D | p | guided | no pass | x | 2026-10-05 |\n\n## Other\n| 2026-10-05 | E | p | guided | PASS | x | y |\n',
    'projects/job-hunt/applications.md': '| Date | Company | Role | Source | Resume variant | Status | Next action |\n|---|---|---|---|---|---|---|\n| 2026-10-10 | Acme | Dev | u | v | interview-scheduling | n |\n',
  });
  const dsa = game.party.find(p => p.track === 'dsa');
  assert.equal(dsa.xpBySource.drill, 170);
  const hunt = game.party.find(p => p.track === 'hunt-grind');
  assert.equal(hunt.xpBySource.hunt, 110);
  assert.equal(game.party.find(p => p.track === 'velocity').xpBySource.hunt, 0);
  assert.equal(game.party.find(p => p.track === 'velocity').xp, Math.floor(100 / 2) + 25 + 10);
});

test('applications parse handles both tables and skips header rows', () => {
  const md = '| date | company | role | url | resume | status | follow_up |\n|---|---|---|---|---|---|---|\n| 2026-08-31 | Acme | FS | u | r | submitted | f |\n\n| Date | Company | Role | Source | Resume variant | Status | Next action |\n|---|---|---|---|---|---|---|\n| — | — | — | — | — | — | — |\n| 2026-08-24 | Globex | Sr | u | r | assessment done | n |\n| 2026-08-25 | Initech | Sr | u | r | Interview-scheduling | n |\n';
  const rows = g.parseApplications(md);
  assert.deepEqual(rows.map(r => [r.company, r.status]), [['Acme', 'submitted'], ['Globex', 'assessment'], ['Initech', 'interview']]);
});

// ── gates ─────────────────────────────────────────────────────────────────

const stage = (name, type, status, date) => ({ name, type, status, date: date || null, notes: '' });

test('gates: gig offer does not open mewtwo', () => {
  const r = g.evalGate('offer-full-time', [{ company: 'Hooli', status: 'offer', employment: 'gig', stages: [] }]);
  assert.equal(r.open, false);
  assert.match(r.reason, /^No full-time offer yet\./);
  assert.match(r.reason, /Hooli's offer is a gig, which does not count\./);
  assert.equal(g.evalGate('offer-full-time', [{ company: 'X', status: 'offer', employment: 'full-time', stages: [] }]).open, true);
});

test('gates: two rounds keep moltres closed with the count', () => {
  const p = { company: 'Umbrella', status: 'rejected', employment: 'full-time', stages: [
    stage('a', 'assessment', 'passed', '2026-09-24'), stage('b', 'hiring-manager', 'done', '2026-10-07'),
    stage('c', 'recruiter-screen', 'done', '2026-09-22'), stage('d', 'system-design', 'failed') ] };
  const r = g.evalGate('third-round', [p]);
  assert.equal(r.open, false);
  assert.equal(r.reason, 'Most rounds in one loop: 2 (Umbrella). Needs 3.');
  p.stages.push(stage('e', 'technical', 'done', '2026-10-09'));
  assert.equal(g.evalGate('third-round', [p]).open, true);
});

test('gates: rejection with a done assessment opens lavender', () => {
  const p = { company: 'Soylent', status: 'rejected', employment: 'full-time', stages: [stage('Online assessment', 'assessment', 'done', '2026-10-09')] };
  const r = g.evalGate('rejection-past-screen', [p]);
  assert.equal(r.open, true);
  assert.match(r.reason, /Soylent/);
  assert.match(r.reason, /Online assessment/);
  assert.match(r.reason, /2026-10-09/);
  const closed = g.evalGate('rejection-past-screen', [{ ...p, stages: [stage('s', 'recruiter-screen', 'done', '2026-10-09')] }]);
  assert.equal(closed.open, false);
  assert.equal(closed.reason, 'No rejection past a screen yet.');
});

// ── scout ─────────────────────────────────────────────────────────────────

test('scout picks acme before its screen and globex after', () => {
  const pipes = g.parsePipelines(SAMPLE_PIPELINES, () => {});
  assert.equal(pipes.length, 2);
  const before = g.resolveScout(pipes, '2026-10-14T14:00:00-04:00');
  assert.equal(before.company, 'Acme');
  assert.equal(before.track, 'hunt-grind');
  const after = g.resolveScout(pipes, '2026-10-14T16:00:00-04:00');
  assert.equal(after.company, 'Globex');
  assert.equal(after.track, 'ai-knowledge');
  assert.equal(after.stageType, 'interview');
  const none = g.resolveScout([], '2026-10-14T16:00:00-04:00');
  assert.equal(none.track, 'subject-knowledge');
  assert.equal(none.reason, 'Nothing scheduled; Viridian serves subject knowledge');
});

test('a priority: top pipeline pins the scout even with nothing dated', () => {
  const pipes = g.parsePipelines(SAMPLE_PIPELINES, () => {});
  const initech = {
    id: 'initech', company: 'Initech', status: 'active', priority: 'top', employment: 'full-time', process: [],
    stages: [
      stage('Application submitted', 'application', 'done', '2026-10-15'),
      stage('Recruiter screen', 'recruiter-screen', 'upcoming'),
      stage('Technical interview', 'technical', 'upcoming'),
    ],
  };
  const r = g.resolveScout([...pipes, initech], '2026-10-14T14:00:00-04:00');
  assert.equal(r.company, 'Initech');
  assert.equal(r.stage, 'Technical interview');
  assert.equal(r.track, 'subject-knowledge');
  assert.equal(r.priority, true);
  assert.match(r.reason, /^Top priority: Initech/);
  const dated = { ...initech, stages: [...initech.stages, stage('Recruiter screen dated', 'recruiter-screen', 'scheduled', '2026-10-20')] };
  const d = g.resolveScout([...pipes, dated], '2026-10-14T14:00:00-04:00');
  assert.equal(d.stage, 'Recruiter screen dated');
  const notTop = g.resolveScout([...pipes, { ...initech, priority: '' }], '2026-10-14T14:00:00-04:00');
  assert.equal(notTop.company, 'Acme');
});

test('stage to track mapping', () => {
  const s = (type, name, notes) => ({ type, name, notes: notes || '' });
  assert.equal(g.trackForStage(s('technical', 'x')), 'subject-knowledge');
  assert.equal(g.trackForStage(s('assessment', 'Take home')), 'velocity');
  assert.equal(g.trackForStage(s('assessment', 'Live coding')), 'dsa');
  assert.equal(g.trackForStage(s('other', 'x')), 'subject-knowledge');
});

// ── slot fill ─────────────────────────────────────────────────────────────

test('empty slots bank xp, gift charmander fills slot 1', async () => {
  const game = await buildMini({ 'projects/game/pokedex.md': dexTable(['| 2026-10-13 | charmander | pallet-town | gift | caught |']) });
  assert.equal(game.party[0].species.name, 'charmander');
  assert.equal(game.party[1].species, null);
  assert.equal(game.party[1].level, null);
  assert.equal(game.trainer.pokedex.caught, 1);
});

// ── trainer name, questions.json, paths ───────────────────────────────────

test('trainer name defaults to Trainer and follows the option', async () => {
  const vault = makeVault({});
  const base = { vaultDir: vault, speciesDir: SPECIES_DIR, offline: true, now: '2026-10-14T12:00:00-04:00' };
  assert.equal((await g.build(base)).game.trainer.name, 'Trainer');
  assert.equal((await g.build({ ...base, trainerName: 'Ash' })).game.trainer.name, 'Ash');
});

test('parseArgs takes defaults from POKE_* variables and flags override them', () => {
  const env = { POKE_VAULT_DIR: SAMPLE_VAULT, POKE_DATA_DIR: 'out/data', POKE_SPECIES_DIR: 'out/species', POKE_TRAINER_NAME: 'Misty' };
  const fromEnv = g.parseArgs([], env);
  assert.equal(fromEnv.vaultDir, SAMPLE_VAULT);
  assert.equal(fromEnv.outDir, path.join(ROOT, 'out', 'data'));
  assert.equal(fromEnv.speciesDir, path.join(ROOT, 'out', 'species'));
  assert.equal(fromEnv.trainerName, 'Misty');
  const flags = g.parseArgs(['--vault', '/a', '--out', '/b', '--species', '/c', '--offline'], env);
  assert.deepEqual([flags.vaultDir, flags.outDir, flags.speciesDir, flags.offline], ['/a', '/b', '/c', true]);
});

test('questions.json carries the whole bank, queued questions first and round robin by topic', async () => {
  const r = await g.build({ vaultDir: SAMPLE_VAULT, speciesDir: SPECIES_DIR, offline: true, now: '2026-10-14T14:00:00-04:00' });
  const { questions, answeredIds, generatedAt } = r.questions;
  assert.equal(generatedAt, r.game.generatedAt);
  assert.equal(questions.length, 30);
  assert.deepEqual(answeredIds, []);
  const queued = questions.filter(q => q.status === 'queued');
  assert.equal(queued.length, 29, 'web-001 is already asked');
  // queued first, in round robin order: javascript-typescript, web-fundamentals, ...
  assert.deepEqual(questions.slice(0, 4).map(q => q.id), ['js-001', 'web-002', 'js-002', 'web-003']);
  assert.equal(questions[29].id, 'web-001', 'the asked question trails the queue');
  for (const q of questions) {
    assert.equal(q.options.length, 3, q.id);
    assert.ok(q.options.some(o => o.letter === q.answer), `${q.id} answer is one of its options`);
    assert.ok(['fundamentals', 'medium', 'senior'].includes(q.level), q.id);
    assert.ok(q.stem && q.why && q.label, q.id);
  }
});

test('answeredIds lists questions with a pokedex row or an offline attempt', async () => {
  const r = await g.build({
    vaultDir: makeVault({
      'projects/job-hunt/interview-prep/kb/offline/js-004.md': '---\nid: js-004\nresult: miss\nanswered: 2026-10-10T21:15:00-04:00\n---\n',
      'projects/game/pokedex.md': dexTable(['| 2026-10-10 | pidgey | viridian-city | web-005 | caught |', '| 2026-10-10 | charmander | pallet-town | gift | caught |', '| 2026-10-11 | abra | saffron-city | free | caught |']),
    }),
    speciesDir: SPECIES_DIR, offline: true, now: '2026-10-14T12:00:00-04:00',
  });
  assert.deepEqual(r.questions.answeredIds, ['js-004', 'web-005']);
});

// ── question bank parser ──────────────────────────────────────────────────

const kb = require('../lib/kb.js');

test('the bank parser reads fields, options, rubric and attempts from the sample banks', () => {
  const warnings = [];
  const items = kb.parseKbBank(path.join(SAMPLE_VAULT, 'projects/job-hunt/interview-prep/kb'), w => warnings.push(w));
  assert.deepEqual(warnings, []);
  assert.equal(items.length, 30);
  assert.deepEqual([...new Set(items.map(i => i.topic))].sort(), ['javascript-typescript', 'web-fundamentals']);
  assert.equal(new Set(items.map(i => i.id)).size, 30, 'ids are unique');
  const q = items.find(i => i.id === 'web-001');
  assert.equal(q.status, 'asked');
  assert.equal(q.seen, 1);
  assert.equal(q.due, null);
  assert.equal(q.rubric.length, 2);
  assert.equal(q.attempts.length, 1);
  assert.deepEqual([q.attempts[0].mode, q.attempts[0].result, q.attempts[0].tier], ['mcq', 'pass', 0]);
});

test('a fenced code sample inside a stem keeps its headings and options lookalikes', () => {
  const body = [
    '## Index', '', '| ID | Key | Kind | Level | Status | Due | Seen | Label |', '|---|---|---|---|---|---|---|---|',
    '| zz-001 | a.b | code | medium | queued | none | 0 | fenced stem |', '',
    '## Questions', '', '### zz-001', 'key: a.b', 'kind: code', 'level: medium', 'answer: b', '',
    '**Stem**', 'What prints?', '', '```md', '## Not a heading', '**Why**', 'A. not an option', '```', '',
    '**Options**', 'A. one', 'B. two', '   continued', 'C. three', '', '**Why**', 'Because.', '',
  ].join('\n');
  const warnings = [];
  const { items } = kb.parseKbBankFile(body, 'x.md', 'x', w => warnings.push(w));
  assert.deepEqual(warnings, []);
  assert.equal(items.length, 1);
  assert.match(items[0].stem, /## Not a heading/);
  assert.match(items[0].stem, /A\. not an option/);
  assert.deepEqual(items[0].options.map(o => o.letter), ['A', 'B', 'C']);
  assert.equal(items[0].options[1].text, 'two continued');
  assert.equal(items[0].answer, 'B');
  assert.equal(items[0].why, 'Because.');
});

test('the bank parser warns on a count mismatch, a block without an Index row and duplicate ids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-parse-'));
  tmpDirs.push(dir);
  const block = id => `### ${id}\nkey: k\nkind: concept\nlevel: medium\nanswer: A\n\n**Stem**\nQ\n\n**Options**\nA. a\nB. b\nC. c\n\n**Why**\nw\n\n**Attempts**\n`;
  const index = ids => `| ID | Key | Kind | Level | Status | Due | Seen | Label |\n|---|---|---|---|---|---|---|---|\n${ids.map(i => `| ${i} | k | concept | medium | queued | none | 0 | l |`).join('\n')}\n`;
  fs.writeFileSync(path.join(dir, 'one.md'), `---\ntopic: one\ncount: 5\n---\n## Index\n\n${index(['x-001'])}\n## Questions\n\n${block('x-001')}\n${block('x-002')}`);
  fs.writeFileSync(path.join(dir, 'two.md'), `---\ntopic: two\ncount: 1\n---\n## Index\n\n${index(['x-001'])}\n## Questions\n\n${block('x-001')}`);
  const warnings = [];
  const items = kb.parseKbBank(dir, w => warnings.push(w));
  assert.deepEqual(items.map(i => i.id), ['x-001', 'x-002']);
  assert.ok(warnings.some(w => /frontmatter count \(5\)/.test(w)));
  assert.ok(warnings.some(w => /x-002 has a question block but no Index row/.test(w)));
  assert.ok(warnings.some(w => /duplicate id x-001/.test(w)));
  assert.equal(kb.parseKbBank(path.join(dir, 'missing')), null);
});

test('buildQueue interleaves topics and orderQuestions keeps the rest in id order', () => {
  const it = (id, topic, status) => ({ id, topic, status });
  const items = [it('a-001', 'a', 'queued'), it('a-002', 'a', 'queued'), it('a-003', 'a', 'asked'), it('b-001', 'b', 'queued'), it('c-001', 'c', 'due')];
  assert.deepEqual(kb.buildQueue(items), ['a-001', 'b-001', 'a-002']);
  assert.deepEqual(kb.orderQuestions(items).map(q => q.id), ['a-001', 'b-001', 'a-002', 'a-003', 'c-001']);
});

test('attempt lines parse the mcq and recall shapes and reject junk', () => {
  assert.deepEqual(kb.parseKbAttemptLine('2026-09-19 mcq D miss tier0'), { date: '2026-09-19', mode: 'mcq', pick: 'D', result: 'miss', tier: 0 });
  assert.deepEqual(kb.parseKbAttemptLine('2026-09-23 recall pass tier1'), { date: '2026-09-23', mode: 'recall', pick: null, result: 'pass', tier: 1 });
  assert.equal(kb.parseKbAttemptLine('not an attempt'), null);
  assert.equal(kb.parseKbAttemptLine('2026-09-23 mcq A pass'), null);
});

// ── paths ─────────────────────────────────────────────────────────────────

const { resolvePaths, ensureVault } = require('../lib/paths.js');

test('resolvePaths defaults, overrides and validation', () => {
  const d = resolvePaths({});
  assert.equal(d.host, '127.0.0.1');
  assert.equal(d.port, 4401);
  assert.equal(d.vaultDir, path.join(ROOT, 'data', 'sample-vault'));
  assert.equal(d.dataDir, path.join(ROOT, 'data', 'generated'));
  assert.equal(d.speciesDir, path.join(ROOT, 'content', 'species'));
  assert.equal(d.staticDir, path.join(ROOT, 'www'));
  assert.equal(d.trainerName, 'Trainer');
  assert.equal(d.defaultVault, true);
  const o = resolvePaths({ POKE_PORT: '5000', POKE_HOST: '0.0.0.0', POKE_VAULT_DIR: '/v', POKE_TRAINER_NAME: 'Red', POKE_DATA_DIR: '' });
  assert.deepEqual([o.port, o.host, o.vaultDir, o.trainerName, o.defaultVault], [5000, '0.0.0.0', '/v', 'Red', false]);
  assert.equal(o.dataDir, d.dataDir, 'an empty variable counts as unset');
  assert.throws(() => resolvePaths({ POKE_PORT: 'abc' }), /POKE_PORT/);
});

test('ensureVault seeds the default vault once and refuses to create an explicit one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-vault-'));
  tmpDirs.push(dir);
  const paths = { ...resolvePaths({}), vaultDir: path.join(dir, 'vault') };
  assert.equal(ensureVault(paths), true);
  assert.ok(fs.existsSync(path.join(paths.vaultDir, 'projects/game/towns.md')));
  fs.appendFileSync(path.join(paths.vaultDir, 'projects/game/pokedex.md'), '\nlocal edit\n');
  assert.equal(ensureVault(paths), false, 'an existing vault is left alone');
  assert.match(fs.readFileSync(path.join(paths.vaultDir, 'projects/game/pokedex.md'), 'utf-8'), /local edit/);
  assert.throws(() => ensureVault({ ...paths, vaultDir: path.join(dir, 'nope'), defaultVault: false }), /POKE_VAULT_DIR does not exist/);
});
