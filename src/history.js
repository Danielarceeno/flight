import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { HISTORY_LIMIT } from './config.js';

export async function loadHistory(path) {
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

export async function saveHistory(path, entries) {
  await mkdir(dirname(path), { recursive: true });
  const trimmed = entries.slice(-HISTORY_LIMIT);
  await writeFile(path, JSON.stringify({ entries: trimmed }, null, 2) + '\n');
}

export function validEntries(entries) {
  return entries.filter((e) => e.best && Number.isFinite(e.best.price));
}

export function stats(entries) {
  const valid = validEntries(entries);
  if (!valid.length) return { min: null, minEntry: null, last: null, count: 0 };
  const minEntry = valid.reduce((a, b) => (b.best.price < a.best.price ? b : a));
  return { min: minEntry.best.price, minEntry, last: valid[valid.length - 1], count: valid.length };
}
