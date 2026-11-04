import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

export interface LevelInfo {
  id: string;
  title: string;
  fixes: { id: string; options: { id: string; correct: boolean }[] }[];
}

const root = join(import.meta.dirname, '..', 'levels');
export const levels: LevelInfo[] = readdirSync(root)
  .sort()
  .map((dir) => JSON.parse(readFileSync(join(root, dir, 'level.json'), 'utf8')));

export const allLevelIds = levels.map((l) => l.id);

export type Theme = 'dark' | 'light';

export async function start(page: Page, progress: string[] = [], theme?: Theme) {
  await page.addInitScript(
    ({ ids, theme }) => {
      // Seed once per test so later navigations keep the progress the game saved.
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('shift-tab:progress', JSON.stringify(ids));
      localStorage.setItem('shift-tab:sound', 'off');
      if (theme) localStorage.setItem('shift-tab:theme', theme);
    },
    { ids: progress, theme },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Friday Community Night is coming/ })).toBeVisible();
  if (theme) await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

export async function openLevel(page: Page, index: number) {
  await page.getByRole('button', { name: /Start playing|Continue/ }).click();
  await page.locator('#level-list button').nth(index).click();
  await expect(page.locator('#issue-heading')).toBeFocused();
  await waitForChecks(page);
}

export async function waitForChecks(page: Page) {
  await expect(page.locator('.check-row').first()).toBeVisible({ timeout: 15_000 });
}

/** Solve the current level with pointer input (used to reach later states quickly). */
export async function solveWithPointer(page: Page, level: LevelInfo) {
  // A level can reproduce itself (level 7's timer), so the skip button may already be gone.
  const skip = page.getByRole('button', { name: 'Skip reproducing and go to the fix' });
  if (await skip.isVisible()) await skip.click();
  await expect(page.locator('.fix-group').first()).toBeVisible();
  for (const group of level.fixes) {
    const option = group.options.find((o) => o.correct)!;
    await page.locator(`#fix-${group.id}-${option.id}`).check();
    await page.locator(`[data-key="apply-${group.id}"]`).click();
    await expect(page.locator(`#fix-${group.id}-${option.id}`).locator('xpath=../..').locator('.pill-applied')).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.locator('[data-key="merge"]')).toHaveAttribute('aria-disabled', 'false', { timeout: 15_000 });
  await page.locator('[data-key="merge"]').click();
  await expect(page.locator('.merged-badge')).toBeVisible();
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page should not scroll horizontally').toBeLessThanOrEqual(1);
}
