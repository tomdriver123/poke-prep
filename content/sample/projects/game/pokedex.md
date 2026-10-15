---
title: Pokedex (sample)
type: game-state
status: sample
season: 1
seasons:
  - { number: 1, started: 2026-09-01 }
tags: [sample]
---

# Pokedex

The catch ledger. The game server appends one row per encounter, newest last, and the generator reads it back. Exactly one five cell table lives in this file, and the header row below is what the server looks for.

| Date | Species | Town | Question | Result |
|---|---|---|---|---|
