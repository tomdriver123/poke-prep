# Poke Prep

Interview prep played as a Gen 1 Pokemon game. A Kanto map is your study plan: **towns are topics**, **encounters are quiz questions**, **catches are correct answers**, and the **trainer card** tracks your party, your pokedex and the XP behind each level.

- Open a town on the map and a wild Pokemon from its pool appears with one multiple choice question from the town's question bank.
- A right answer on a species you do not own catches it. A right answer on one you already own earns XP. A wrong answer and it flees.
- XP belongs to a study track (subject knowledge, DSA, AI knowledge and so on), and a track's party slot levels up on the species' real growth curve. Every other slot gets half of any XP (the Exp. Share model), so nothing is wasted.
- Gated Pokemon and towns open when your job hunt does: a signed offer, a third round, a rejection past the screen stage.

Your progress lives in plain Markdown files, so the game is a view over notes you own. It runs against a sample vault out of the box.

*A fan project. Not affiliated with Nintendo, Game Freak or The Pokemon Company.*

## Quick start

```bash
npm ci
npm run build
npm run serve
```

Then open <http://127.0.0.1:4401>. The first start copies `content/sample/` to `data/sample-vault/` (git ignored) and generates the game data from it on the first request. Needs Node 22.12 or newer (developed on Node 24).

Each question is a one time encounter, so a sample vault runs out. Delete `data/` (and the site's local storage) to start over, or add questions to the banks.

The starter is handed out by hand: add `| 2026-10-13 | charmander | pallet-town | gift | caught |` to the table in `data/sample-vault/projects/game/pokedex.md` to receive Charmander in the first party slot.

### Developing

```bash
npm run serve    # the API on 127.0.0.1:4401
npm start        # ng serve on http://localhost:4400, proxying /api and /assets/data to the API
```

| Script | What it does |
|---|---|
| `npm start` | Dev server on port 4400 with `proxy.conf.json` |
| `npm run build` | Production build to `www/` |
| `npm run serve` | The zero dependency game API and static server (`server/game-api.js`) |
| `npm run generate` | Runs the data generator once, offline |
| `npm run test:scripts` | `node:test` suites for the generator, the bank parser and the API server (offline) |
| `npm test` / `npm run test:ci` | Karma and Jasmine specs (Chrome, or headless Chrome for `test:ci`; set `CHROME_BIN` if it is not found) |
| `npm run lint` | `ng lint` |

## How it fits together

```
Markdown vault  -->  scripts/generate-game-data.js  -->  data/generated/{towns,game,questions}.json  -->  Angular map page
        ^                                                                                                     |
        |                                                                                                     v
        +-------------  server/game-api.js  <------  POST /api/game/encounter, POST /api/quiz/attempt  -------+
```

- **Vault in, JSON out.** The generator reads the design tables (towns, banks, gates, map, seasons), the pokedex ledger, the question banks, the logs, the applications ledger and the pipeline files, and writes `towns.json`, `game.json` and `questions.json`. Nothing about towns or Pokemon is hardcoded in the app.
- **Write back through the API.** An answer appends one row to `pokedex.md` and drops one attempt file. Both are atomic writes (a temp file, then a rename).
- **Lazy and debounced regeneration.** On any `/assets/data/*.json` request the server regenerates (offline) first if the three files are missing or `game.json` was not generated today. After an encounter it regenerates again three seconds later, so the next load shows the new catch.
- **Species cache.** `content/species/*.json` holds the PokeAPI data the game needs (name, dex number, types, growth curve, evolutions) for 59 species. The generator fetches a missing species from pokeapi.co unless `--offline` is set (the server and `npm run generate` always are).
- **`questions.json`** is `{ generatedAt, questions, answeredIds }`. `questions` is the whole parsed bank with the queued questions first, interleaved round robin across topics. `answeredIds` lists the questions the game has already recorded (a pokedex row or an attempt file), so a fresh browser does not serve them again.

## Use your own vault

Configuration is all environment variables. Relative paths resolve against the repository root. An empty variable counts as unset.

| Variable | Default | Purpose |
|---|---|---|
| `POKE_HOST` | `127.0.0.1` | Address the server binds to |
| `POKE_PORT` | `4401` | Server port |
| `POKE_VAULT_DIR` | `./data/sample-vault` | The vault the game reads and writes. Only the default is seeded (from `content/sample/`) when it does not exist yet. A directory you set yourself must already exist |
| `POKE_DATA_DIR` | `./data/generated` | Where `towns.json`, `game.json` and `questions.json` are written and served from |
| `POKE_SPECIES_DIR` | `./content/species` | The PokeAPI species cache |
| `POKE_STATIC_DIR` | `./www` | The built app the server serves |
| `POKE_TRAINER_NAME` | `Trainer` | Name on the trainer card |

```bash
POKE_VAULT_DIR=~/notes/vault POKE_TRAINER_NAME=Red npm run serve
```

The generator takes the same settings, overridable per run with `--vault`, `--out` and `--species` (plus `--offline` and `--now <iso>`). The server answers `GET /api/health` with the paths it resolved.

### What the generator reads

Everything is relative to the vault. `content/sample/` is a complete working example and `projects/game/towns.md` documents the tables.

| File | What it holds |
|---|---|
| `projects/game/towns.md` | Party slots, encounter tables (towns and their Pokemon pools), banks, gates, map grid, routes, seasons |
| `projects/game/party.md` | Optional species picks and nicknames per slot |
| `projects/game/pokedex.md` | The catch ledger, see the contract below |
| `projects/job-hunt/interview-prep/kb/*.md` | Question banks, one file per topic |
| `projects/job-hunt/interview-prep/kb/offline/` | One attempt file per answered question |
| `projects/job-hunt/interview-prep/kb-log.md`, `drill-log.md` | Question and drill history, which pay XP |
| `projects/job-hunt/applications.md`, `pipeline/*.md` | Applications and pipeline stages, which pay hunt XP, steer the scout town and open the gates |

### Writing a question bank

A bank is `kb/<topic>.md`: frontmatter (`topic`, `prefix`, `count`, `level`, `streak`), an `## Index` table with one row per question, and a `## Questions` section with one block per question. The `topic` must match the Bank column of the Banks table in `towns.md`. Question ids look like `web-005` (two to six lowercase letters, a dash, at least three digits).

````markdown
## Index

| ID | Key | Kind | Level | Status | Due | Seen | Label |
|----|-----|------|-------|--------|-----|------|-------|
| web-005 | http.cors.preflight | concept | fundamentals | queued | none | 0 | when a browser sends a CORS preflight |

## Questions

### web-005
key: http.cors.preflight
kind: concept
level: fundamentals
deck: seed
first asked: none
answer: B

**Stem**
The question, in Markdown. Fenced code blocks are fine.

**Options**
A. First option
B. Second option
C. Third option

**Why**
The explanation shown after answering.

**Rubric**
1. A point a good spoken answer makes.

**Model answer**
A short model answer.

**Attempts**
````

`Level` is `fundamentals`, `medium` or `senior` and sets the XP (20, 50, 100). `Status` is `queued` (never asked, served by the game), `asked`, `due`, `learned` or `retired`. An `Attempts` line looks like `2026-10-10 mcq B pass tier0`.

## Vault contract

The server and the generator are not the only tools that touch a vault, so the two files the game writes have a fixed format. Both are plain UTF-8 with LF line endings, written to a temp file next to the target and renamed into place.

### `projects/game/pokedex.md`

Exactly one table in the file, with this header (the server finds the table by it):

```markdown
| Date | Species | Town | Question | Result |
|---|---|---|---|---|
| 2026-10-14 | abra | saffron-city | web-005 | caught |
```

A row is `| <date> | <species> | <town> | <question> | <result> |`:

| Cell | Value |
|---|---|
| Date | `YYYY-MM-DD`, the date part of the answer's local timestamp |
| Species | The lowercase PokeAPI name, for example `abra` or `mr-mime` (`^[a-z][a-z0-9-]{1,30}$`) |
| Town | The town id, the slug of the town name in `towns.md` (`^[a-z]+(-[a-z]+)*$`), for example `saffron-city` |
| Question | A question id such as `web-005`, or `free` for a gated free catch, or `gift` for a starter row written by hand |
| Result | `caught` (first catch of the species this season), `xp` (a repeat this season) or `fled` (a wrong answer) |

- New rows go in right after the last row of the table (after the separator line when the table is empty). The file ends with exactly one newline.
- The current season comes from the frontmatter: `season: 1`, and a `seasons:` list whose items are written exactly as `  - { number: 1, started: 2026-09-01 }`. A species counts as caught this season when a `caught` row for it is dated on or after that season's `started`.
- Every question is answered once: if a row with that question id exists, the server answers `200` with the existing row and writes nothing. A free catch is deduplicated per species and season. A free catch is only accepted when `towns.json` shows an open species gate for that species in that town.

### `projects/job-hunt/interview-prep/kb/offline/<questionId>.md`

One frontmatter-only file per answered question, named after the question id. Exactly these lines, in this order:

```markdown
---
id: web-005
question: web-005
topic: web-fundamentals
pick: B
answer: B
result: pass
answered: 2026-10-14T10:00:00-04:00
source: dashboard
---
```

| Field | Value |
|---|---|
| `id`, `question` | The question id (`^[a-z]{2,6}-\d{3,}$`), repeated |
| `topic` | The bank topic (`^[a-z0-9][a-z0-9-]{0,31}$`) |
| `pick`, `answer` | The letter chosen and the correct letter (`A` to `F`) |
| `result` | `pass` or `miss` |
| `answered` | A local ISO timestamp with an explicit offset such as `2026-10-14T10:00:00-04:00` (no `Z`) |
| `source` | Always `dashboard`, kept so older tools recognize the file |

A file that already exists is never overwritten: the retry answers `200` with what is stored. Free catches write no attempt file. A tool that wants to fold the attempts into its own log can read the folder (or `GET /api/quiz/attempts`) and delete each file once it has handled it. The generator reads these files as extra evidence of an answer, and a pass pays its XP once per question and day even if the same answer also shows up in a bank's `Attempts`, `kb-log.md` or `pokedex.md`.

### HTTP routes

| Route | Body and result |
|---|---|
| `POST /api/game/encounter` | `{ questionId, topic, pick, answer, result, answered, town, species }`, or `{ questionId: null, town, species, answered }` for a free catch. `201` with `{ entry, row }` for a new row, `200` for a repeat, `400` for a bad field, `404` for an unknown town, `413` over 4 KB, `503` when `towns.json` cannot be built |
| `POST /api/quiz/attempt` | The same fields without `town` and `species`. `201` or `200` with `{ entry }`, `400` for a bad field |
| `GET /api/quiz/attempts` | `{ entries }`, the attempt files oldest first |
| `GET /api/health` | The resolved paths and settings |

## Credits

- The Leaflet map page, the bottom sheet and the list-and-detail panel are ported from the park-finder map app, whose palette and spacing tokens the page still uses.
- Species data comes from [PokeAPI](https://pokeapi.co). Sprites are hotlinked from the [PokeAPI/sprites](https://github.com/PokeAPI/sprites) repository and are not bundled.
- Built with Angular, Ionic, Leaflet, ngx-markdown and js-yaml.
- Pokemon and Pokemon character names are trademarks of Nintendo, Game Freak and The Pokemon Company. This project is a non-commercial fan project and is not affiliated with or endorsed by them.

## License

[MIT](LICENSE)
