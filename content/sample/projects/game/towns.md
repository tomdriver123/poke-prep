---
title: Towns and encounters (sample)
type: game-design
status: sample
tags: [sample]
---

# Towns and encounters

The design tables the game generator reads. Every town, pool, bank, gate and map position comes from this file, nothing is hardcoded in the app. Edit a table and run `npm run generate` (or just reload, the server regenerates daily) to see it on the map.

This is the sample vault that ships with Poke Prep. Everything here is invented or public Gen 1 flavor.

## The loop

1. Open a town on the map.
2. The town rolls one species from its pool and serves one multiple choice question from the town's bank.
3. A right answer on a species not yet caught catches it. A right answer on a species already caught gives XP. A wrong answer and the Pokemon flees.
4. One encounter per question, ever. The Gen 1 Pokedex of 151 is the cap for a season.

## Party

Six slots, one per track. The type is fixed by the track, and a slot fills itself with the first species of that type you catch. Questions pay XP to their own track at full value and to every other slot at half (the Exp. Share model), so nothing is lost for lack of a type.

| Slot | Track | Type | Gym town |
|---|---|---|---|
| 1 | AI judgment | Fire | Cinnabar Island |
| 2 | AI knowledge | Water | Cerulean City |
| 3 | Velocity | Electric | Vermilion City |
| 4 | DSA | Rock | Pewter City |
| 5 | Subject knowledge | Psychic | Saffron City |
| 6 | Hunt grind | Normal | Fuchsia City |

## Encounter tables

The Track served column decides what a town does. A track name serves questions from that track's banks (or shows a note if no bank feeds it), `none` is the home town with the trainer card, `next round's track` is the scout town that follows your pipeline, `reflection` is a place to read a gate message, and `later` is the league, which serves fundamentals questions for gated species. Parentheses in the Pool column mark gifts.

| Town | Role | Track served | Pool | Gate |
|---|---|---|---|---|
| Pallet Town | Home. Trainer card and the starter | none | Charmander (gift) | none |
| Viridian City | Scout town. Serves whatever the nearest dated pipeline stage tests, for double XP | next round's track | Pidgey, Caterpie, Weedle | none |
| Pewter City | Rock gym | DSA | Geodude, Onix, Rhyhorn | none |
| Cerulean City | Water gym and a cave with a rare resident | AI knowledge | Staryu, Goldeen, Psyduck | Mewtwo appears only with a signed full-time offer |
| Vermilion City | Electric gym | Velocity | Pikachu, Magnemite, Voltorb | none |
| Lavender Town | Pokemon Tower, where rejections past the screen stage are mourned | reflection | Gastly, Cubone | Opens on the first rejection past a screen |
| Celadon City | Grass gym | Subject knowledge | Oddish, Bellsprout, Tangela | none |
| Fuchsia City | Safari Zone | Hunt grind | Chansey, Tauros, Kangaskhan | none |
| Saffron City | Psychic gym | Subject knowledge | Abra, Drowzee, Mr. Mime | none |
| Cinnabar Island | Fire gym | AI judgment | Growlithe, Vulpix, Ponyta | none |
| Indigo Plateau | Victory Road, the league | later | Moltres | Moltres appears only after a third round interview |

## Banks

Which question bank feeds which track and town. The Bank column equals the `topic` in the bank file's frontmatter (see `projects/job-hunt/interview-prep/kb/`).

| Bank | Track | Town |
|---|---|---|
| web-fundamentals | Subject knowledge | Saffron City |
| javascript-typescript | Subject knowledge | Celadon City |

## Gates

Gates read pipeline frontmatter and applications.md. Never a switch.

| Town | Species | Kind |
|---|---|---|
| Cerulean City | Mewtwo | offer-full-time |
| Indigo Plateau | Moltres | third-round |
| Lavender Town | town | rejection-past-screen |

Definitions.

- A **round** is a pipeline stage typed hiring-manager, interview, technical, system-design or assessment, with status done or passed and a date. Recruiter screens are not rounds.
- **offer-full-time**: a pipeline file with status offer and employment full-time. Contract and gig offers do not count.
- **third-round**: any one pipeline file with three rounds.
- **rejection-past-screen**: any pipeline file with status rejected that has a round typed stage with status done, passed or failed and a date.

## Map

Kanto on a 20 by 18 grid, y down, after the Gen 1 town map. The app draws it with Leaflet and no tiles.

| Town | X | Y |
|---|---|---|
| Pallet Town | 3 | 14 |
| Viridian City | 3 | 10 |
| Pewter City | 3 | 4 |
| Cerulean City | 12 | 3 |
| Vermilion City | 12 | 11 |
| Lavender Town | 16 | 7 |
| Celadon City | 8 | 7 |
| Fuchsia City | 9 | 15 |
| Saffron City | 12 | 7 |
| Cinnabar Island | 3 | 17 |
| Indigo Plateau | 1 | 2 |

## Routes

Drawn as lines between towns.

| From | To |
|---|---|
| Pallet Town | Viridian City |
| Viridian City | Pewter City |
| Pewter City | Cerulean City |
| Cerulean City | Saffron City |
| Saffron City | Celadon City |
| Saffron City | Lavender Town |
| Saffron City | Vermilion City |
| Celadon City | Fuchsia City |
| Lavender Town | Fuchsia City |
| Fuchsia City | Cinnabar Island |
| Cinnabar Island | Pallet Town |
| Viridian City | Indigo Plateau |

## Seasons

A season is one hunt, from the first application to the signed offer. A new season starts the party and XP over, while the pokedex keeps everything ever caught.

| Season | Started | Ended |
|---|---|---|
| 1 | 2026-09-01 | |
