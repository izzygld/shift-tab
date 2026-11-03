import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { allLevelIds, levels, openLevel, solveWithPointer, start } from './helpers';

// The level pages inside #frame are broken on purpose; we audit the game around them.
async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .exclude('#frame')
    .analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

test('title screen has no axe violations', async ({ page }) => {
  await start(page);
  await audit(page, 'title');
});

test('title screen for a returning player has no axe violations', async ({ page }) => {
  await start(page, allLevelIds.slice(0, 3));
  await audit(page, 'title (returning)');
});

for (const [index, level] of levels.entries()) {
  test(`level ${index + 1} (${level.title}): every state has no axe violations`, async ({ page }) => {
    await start(page);
    await openLevel(page, index);
    await audit(page, `level ${index + 1} before reproducing`);

    await page.locator('#mode-switch button').last().click();
    await audit(page, `level ${index + 1} alternate mode`);

    await solveWithPointer(page, level);
    await audit(page, `level ${index + 1} merged`);
  });
}

test('fix state with a wrong suggestion applied has no axe violations', async ({ page }) => {
  await start(page);
  await openLevel(page, 1);
  await page.getByRole('button', { name: 'Skip reproducing and go to the fix' }).click();
  await page.locator('#fix-logo-alt-logo').check();
  await page.locator('[data-key="apply-logo"]').click();
  await expect(page.locator('.review-box')).toBeVisible({ timeout: 15_000 });
  await audit(page, 'fix state');
});

test('screen reader view with announcements has no axe violations', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Tab key navigation is covered on desktop');
  await start(page);
  await openLevel(page, 1);
  await page.locator('#enter-page').click();
  await page.keyboard.press('Tab');
  await expect(page.locator('#readout-log li')).toHaveCount(2);
  await audit(page, 'screen reader view');
});

test('ending screens have no axe violations', async ({ page }) => {
  await start(page, allLevelIds.slice(0, 4));
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('#level-list button').last().click();
  await solveWithPointer(page, levels[levels.length - 1]);
  await page.getByRole('button', { name: /See your results/ }).click();
  await expect(page.locator('#ending-heading')).toBeFocused();
  await audit(page, 'ending (partial)');

  await page.evaluate((ids) => localStorage.setItem('shift-tab:progress', JSON.stringify(ids)), allLevelIds);
  await page.goto('/');
  await page.getByRole('button', { name: 'See your results' }).click();
  await expect(page.locator('#ending-heading')).toHaveText('Friday Community Night is ready.');
  await audit(page, 'ending (complete)');
});
