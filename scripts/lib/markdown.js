'use strict';

/** Small Markdown helpers shared by the generator and the question bank parser. */

const yaml = require('js-yaml');

// Splits one pipe table row into trimmed cells (the leading and trailing pipes are dropped).
function splitRow(line) {
  const parts = line.split('|');
  parts.shift();
  if (parts.length && parts[parts.length - 1].trim() === '') parts.pop();
  return parts.map((c) => c.trim());
}

// True for the |---|---| line under a table header.
function isSeparator(line) {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

// Frontmatter is parsed with the CORE schema so dates stay strings.
function splitFrontmatter(content, warn) {
  if (!content.startsWith('---')) return { data: {}, body: content };
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return { data: {}, body: content };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return { data: {}, body: content };
  let data = {};
  try {
    data = yaml.load(lines.slice(1, end).join('\n'), { schema: yaml.CORE_SCHEMA }) || {};
  } catch (err) {
    if (warn) warn(`Frontmatter parse error: ${err.message}`);
  }
  return { data, body: lines.slice(end + 1).join('\n') };
}

module.exports = { splitRow, isSeparator, splitFrontmatter };
