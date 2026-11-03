// Validates level content so community pull requests can't ship a broken level.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../levels/', import.meta.url).pathname;
const errors = [];
const seenIds = new Set();
const seenOrders = new Set();
const MODES = new Set(['keyboard', 'screen-reader']);
const CUSTOM_CHECKS = new Set(['focus-indicator', 'native-controls', 'modal-escape']);

for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const where = `levels/${dir.name}`;
  const fail = (msg) => errors.push(`${where}: ${msg}`);
  const jsonPath = join(root, dir.name, 'level.json');
  const pagePath = join(root, dir.name, 'page.html');

  if (!existsSync(jsonPath) || !existsSync(pagePath)) {
    fail('needs both level.json and page.html');
    continue;
  }

  let level;
  try {
    level = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    fail(`level.json is not valid JSON (${e.message})`);
    continue;
  }
  const page = readFileSync(pagePath, 'utf8');

  if (level.id !== dir.name) fail(`id "${level.id}" must match folder name`);
  if (seenIds.has(level.id)) fail(`duplicate id "${level.id}"`);
  if (seenOrders.has(level.order)) fail(`duplicate order ${level.order}`);
  seenIds.add(level.id);
  seenOrders.add(level.order);

  for (const key of ['title', 'wcag', 'modes', 'issue', 'task', 'fixes', 'checks', 'merged']) {
    if (level[key] === undefined) fail(`missing "${key}"`);
  }
  if (!/<html[^>]*\blang=/.test(page)) fail('page.html needs <html lang="…">');
  if (!level.modes?.length || level.modes.some((m) => !MODES.has(m))) fail(`modes must be from: ${[...MODES].join(', ')}`);
  if (level.task && !level.task.goalSelector && !level.task.goalKey) fail('task needs goalSelector and/or goalKey');
  if (level.task?.goalSelector && !page.includes(level.task.goalSelector.replace(/^\[|\]$/g, ''))) fail(`goalSelector ${level.task.goalSelector} not found in page.html`);
  for (const c of level.checks?.custom ?? []) if (!CUSTOM_CHECKS.has(c)) fail(`unknown custom check "${c}"`);

  for (const group of level.fixes ?? []) {
    const count = page.split(group.find).length - 1;
    if (count !== 1) fail(`fix "${group.id}": find text must appear exactly once in page.html (found ${count})`);
    if (!group.options?.some((o) => o.correct)) fail(`fix "${group.id}": needs at least one correct option`);
    for (const o of group.options ?? []) {
      if (!o.feedback) fail(`fix "${group.id}" option "${o.id}": missing feedback`);
    }
  }
}

if (errors.length) {
  console.error(`Level validation failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${seenIds.size} levels valid.`);
