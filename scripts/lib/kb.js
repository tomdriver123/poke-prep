'use strict';

/**
 * Question bank parser.
 *
 * Reads the per-topic bank files (<vault>/projects/job-hunt/interview-prep/kb/<topic>.md) into
 * question objects for the encounter card. A bank file is frontmatter (topic, prefix, count,
 * level, streak), an `## Index` table (the status of every question) and a `## Questions`
 * section with one `### <id>` block per question: key, kind, level, deck, first asked and answer
 * fields, then **Stem**, **Options**, **Why**, **Rubric**, **Model answer** and **Attempts**
 * sections. Lines inside code fences are never structure, so a fenced sample in a stem survives.
 *
 * Lifted from the dashboard's career generator; the file reads were swapped for plain fs calls
 * and the warning sink is passed in.
 */

const fs = require('fs');
const path = require('path');
const { splitRow, isSeparator, splitFrontmatter } = require('./markdown');

const KB_RESULT_PATTERNS = [
  { re: /\brecall pass\b/, result: 'pass' },
  { re: /\brecall miss\b/, result: 'miss' },
  { re: /\bpass\b/, result: 'pass' },
  { re: /\bmiss\b/, result: 'miss' },
  { re: /\bguess\b/, result: 'guess' },
  { re: /\bskip\b/, result: 'skip' },
];

// One Attempts line, e.g. "2026-09-19 mcq D miss tier0" or the recall shape
// "2026-09-23 recall pass tier1" (no pick token). Returns null on anything that does not fit, so
// the caller can warn and skip just that line.
function parseKbAttemptLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return null;

  const tierMatch = line.match(/\s+tier\s*(\d+)$/);
  if (!tierMatch) return null;
  const tier = Number(tierMatch[1]);
  const withoutTier = line.slice(0, line.length - tierMatch[0].length).trim();

  let result = null;
  for (const { re, result: r } of KB_RESULT_PATTERNS) {
    if (re.test(withoutTier)) { result = r; break; }
  }
  if (result === null) return null;

  const tokens = withoutTier.split(/\s+/).filter(Boolean);
  const date = tokens[0];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const mode = tokens[1];
  if (!mode) return null;

  const resultWords = ['pass', 'miss', 'guess', 'skip'];
  const rest = tokens.slice(2).filter((t) => !resultWords.includes(t.toLowerCase()));
  const pick = rest.length === 1 ? rest[0] : null;

  return { date, mode, pick, result, tier };
}

// Reads one bank file's body with a single fence aware line scan.
function parseKbBankFile(body, file, topic, warn) {
  const indexRowsById = new Map();
  let indexHeaderCells = null;
  const items = [];

  let topLevel = null; // null | 'index' | 'questions'
  let currentBlock = null;
  let openSection = null; // null | 'stem' | 'options' | 'why' | 'rubric' | 'model answer' | 'attempts'
  let inFence = false;
  let fenceChar = null;
  let fenceLen = 0;

  function newBlock(id) {
    return {
      id, key: null, kind: null, level: null, deck: null, firstAsked: null,
      answer: null, versions: null,
      _stemLines: [], _whyLines: [], _modelAnswerLines: [],
      options: [], rubric: [], _attemptLines: [],
    };
  }

  function finalizeBlock(block) {
    if (!block) return;
    const attempts = [];
    for (const line of block._attemptLines) {
      const parsed = parseKbAttemptLine(line);
      if (!parsed) { warn(`kb/${file}: ${block.id}: unparseable Attempts line "${line}"`); continue; }
      attempts.push(parsed);
    }
    items.push({
      id: block.id,
      topic,
      key: block.key,
      kind: block.kind,
      level: block.level,
      status: null, due: null, seen: null, label: null, // filled from the Index below
      stem: block._stemLines.join('\n').trim(),
      options: block.options,
      answer: block.answer,
      why: block._whyLines.join('\n').trim(),
      rubric: block.rubric,
      modelAnswer: block._modelAnswerLines.join('\n').trim(),
      versions: block.versions,
      deck: block.deck,
      firstAsked: block.firstAsked,
      attempts,
    });
  }

  // Lines inside a fence are never structure, but still belong to whatever raw or list section is
  // currently open, so a fenced code sample inside a Stem is preserved verbatim.
  function appendFenceLine(line) {
    if (!currentBlock) return;
    const t = line.trim();
    if (openSection === 'stem') currentBlock._stemLines.push(line);
    else if (openSection === 'why') currentBlock._whyLines.push(line);
    else if (openSection === 'model answer') currentBlock._modelAnswerLines.push(line);
    else if (openSection === 'options') {
      if (t && currentBlock.options.length) {
        const last = currentBlock.options[currentBlock.options.length - 1];
        last.text = (last.text + ' ' + t).trim();
      }
    } else if (openSection === 'rubric') {
      if (t) currentBlock.rubric.push(t.replace(/^\d+\.\s*/, ''));
    } else if (openSection === 'attempts') {
      if (t) currentBlock._attemptLines.push(t);
    }
  }

  for (const line of body.split('\n')) {
    const trimmed = line.trim();

    // The fence state machine gates every structural check below.
    const fenceMarker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (!inFence) {
      if (fenceMarker) {
        inFence = true;
        fenceChar = fenceMarker[1][0];
        fenceLen = fenceMarker[1].length;
        appendFenceLine(line);
        continue;
      }
    } else {
      if (fenceMarker && fenceMarker[1][0] === fenceChar && fenceMarker[1].length >= fenceLen) {
        inFence = false;
      }
      appendFenceLine(line);
      continue;
    }

    if (topLevel !== 'questions') {
      if (trimmed === '## Index') { topLevel = 'index'; continue; }
      if (trimmed === '## Questions') { topLevel = 'questions'; continue; }
      if (topLevel === 'index') {
        if (!trimmed.startsWith('|')) continue;
        if (isSeparator(trimmed)) continue;
        const cells = splitRow(trimmed);
        if (cells.length < 8) continue;
        if (cells[0] && cells[0].toLowerCase() === 'id') {
          indexHeaderCells = cells.map((c) => c.toLowerCase());
          continue;
        }
        if (!indexHeaderCells) continue;
        const row = {};
        indexHeaderCells.forEach((h, i) => { row[h] = cells[i]; });
        const due = row.due && row.due.toLowerCase() === 'none' ? null : (row.due || null);
        const seen = row.seen !== undefined && row.seen !== '' ? Number(row.seen) : null;
        indexRowsById.set(row.id, {
          id: row.id, key: row.key, kind: row.kind, level: row.level,
          status: row.status, due, seen, label: row.label,
        });
      }
      continue;
    }

    // topLevel === 'questions'
    const idMatch = trimmed.match(/^### (\S+)$/);
    if (idMatch) {
      finalizeBlock(currentBlock);
      currentBlock = newBlock(idMatch[1]);
      openSection = null;
      continue;
    }
    if (!currentBlock) continue;

    const headerMatch = trimmed.match(/^\*\*(Stem|Options|Why|Rubric|Model answer|Attempts)\*\*$/);
    if (headerMatch) {
      openSection = headerMatch[1].toLowerCase();
      continue;
    }

    if (openSection === null) {
      const fieldMatch = trimmed.match(/^(key|kind|level|deck|first asked|answer|versions):\s*(.*)$/);
      if (fieldMatch) {
        const [, fname, fval] = fieldMatch;
        if (fname === 'key') currentBlock.key = fval;
        else if (fname === 'kind') currentBlock.kind = fval;
        else if (fname === 'level') currentBlock.level = fval;
        else if (fname === 'deck') currentBlock.deck = fval;
        else if (fname === 'first asked') currentBlock.firstAsked = fval;
        else if (fname === 'answer') currentBlock.answer = fval.toUpperCase();
        else if (fname === 'versions') currentBlock.versions = fval;
      }
      continue;
    }

    if (openSection === 'stem') { currentBlock._stemLines.push(line); continue; }
    if (openSection === 'why') { currentBlock._whyLines.push(line); continue; }
    if (openSection === 'model answer') { currentBlock._modelAnswerLines.push(line); continue; }

    if (openSection === 'options') {
      const optMatch = trimmed.match(/^([A-Z])[.)]\s+(.*)$/);
      if (optMatch) {
        currentBlock.options.push({ letter: optMatch[1], text: optMatch[2] });
      } else if (trimmed && currentBlock.options.length) {
        const last = currentBlock.options[currentBlock.options.length - 1];
        last.text = (last.text + ' ' + trimmed).trim();
      }
      continue;
    }

    if (openSection === 'rubric') {
      if (trimmed) currentBlock.rubric.push(trimmed.replace(/^\d+\.\s*/, ''));
      continue;
    }

    if (openSection === 'attempts') {
      if (trimmed) currentBlock._attemptLines.push(trimmed);
      continue;
    }
  }
  finalizeBlock(currentBlock);

  // Reconcile blocks against the Index: the Index supplies status, due, seen and label and wins
  // on a level disagreement. Warn (never throw) in either direction.
  const seenIds = new Set();
  for (const item of items) {
    seenIds.add(item.id);
    const row = indexRowsById.get(item.id);
    if (!row) {
      warn(`kb/${file}: ${item.id} has a question block but no Index row`);
      continue;
    }
    if (row.level && item.level && row.level !== item.level) {
      warn(`kb/${file}: ${item.id} level mismatch (block says ${item.level}, Index says ${row.level}), using Index`);
    }
    item.level = row.level || item.level;
    item.status = row.status;
    item.due = row.due;
    item.seen = row.seen;
    item.label = row.label;
  }
  for (const id of indexRowsById.keys()) {
    if (!seenIds.has(id)) warn(`kb/${file}: Index row ${id} has no matching question block`);
  }

  return { items };
}

/**
 * Parses every <dir>/*.md bank (non recursive, so kb/offline and kb/decks are skipped). Returns
 * the questions sorted by id, or null when the directory does not exist.
 */
function parseKbBank(dir, warn = () => {}) {
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const all = [];
  const seenGlobalIds = new Map(); // id -> file it was first seen in

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(path.join(dir, file), 'utf-8');
    } catch (err) {
      warn(`kb/${file}: read error: ${err.message}`);
      continue;
    }

    const { data, body } = splitFrontmatter(content, warn);
    const topic = data.topic ? String(data.topic) : file.replace(/\.md$/, '').replace(/-\d+$/, '');
    const frontmatterCount = data.count != null ? data.count : 0;

    const { items } = parseKbBankFile(body, file, topic, warn);
    if (items.length !== frontmatterCount) {
      warn(`kb/${file}: frontmatter count (${frontmatterCount}) does not match parsed question blocks (${items.length})`);
    }
    for (const item of items) {
      if (seenGlobalIds.has(item.id)) {
        warn(`kb: duplicate id ${item.id} in ${file} (already seen in ${seenGlobalIds.get(item.id)})`);
        continue;
      }
      seenGlobalIds.set(item.id, file);
      all.push(item);
    }
  }

  all.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return all;
}

/**
 * The serving order for queued questions: round robin across topics so the card does not serve
 * four questions from one bank in a row. Within a topic the order is id ascending, which keeps
 * the sequence stable between runs. Returns ids.
 */
function buildQueue(items) {
  const byTopic = new Map();
  for (const it of items.filter((i) => i.status === 'queued')) {
    if (!byTopic.has(it.topic)) byTopic.set(it.topic, []);
    byTopic.get(it.topic).push(it.id);
  }
  const lanes = [...byTopic.keys()].sort().map((t) => byTopic.get(t).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  const total = lanes.reduce((n, l) => n + l.length, 0);
  const queue = [];
  for (let i = 0; queue.length < total; i++) {
    for (const lane of lanes) if (i < lane.length) queue.push(lane[i]);
  }
  return queue;
}

/** Every question, queued ones first in queue order, then the rest by id. */
function orderQuestions(items) {
  const byId = new Map(items.map((q) => [q.id, q]));
  const queued = buildQueue(items).map((id) => byId.get(id));
  const queuedIds = new Set(queued.map((q) => q.id));
  return queued.concat(items.filter((q) => !queuedIds.has(q.id)));
}

module.exports = { parseKbAttemptLine, parseKbBankFile, parseKbBank, buildQueue, orderQuestions };
