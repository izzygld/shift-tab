import type { Level, LevelData } from '../types';

const data = import.meta.glob<LevelData>('/levels/*/level.json', { eager: true, import: 'default' });
const pages = import.meta.glob<string>('/levels/*/page.html', { eager: true, query: '?raw', import: 'default' });

export const levels: Level[] = Object.entries(data)
  .map(([path, level]) => ({ ...level, page: pages[path.replace(/level\.json$/, 'page.html')] }))
  .sort((a, b) => a.order - b.order);

export function applyFixes(level: Level, applied: Record<string, string>): string {
  let html = level.page;
  for (const group of level.fixes) {
    const option = group.options.find((o) => o.id === applied[group.id]);
    // Function replacer so `$` in level content is never treated as a pattern.
    if (option) html = html.replace(group.find, () => option.replace);
  }
  return html;
}
