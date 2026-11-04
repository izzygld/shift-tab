import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { allLevelIds, levels, openLevel, solveWithPointer, start, type Theme } from './helpers';

// The level pages inside #frame are broken on purpose; we audit the game around them.
async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .exclude('#frame')
    .analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

const themes: Theme[] = ['dark', 'light'];

for (const theme of themes) {
  test.describe(`${theme} theme`, () => {
    test('title screen has no axe violations', async ({ page }) => {
      await start(page, [], theme);
      await audit(page, `title (${theme})`);
    });

    test('title screen for a returning player has no axe violations', async ({ page }) => {
      await start(page, allLevelIds.slice(0, 3), theme);
      await audit(page, `title, returning (${theme})`);
    });

    for (const [index, level] of levels.entries()) {
      test(`level ${index + 1} (${level.title}): every state has no axe violations`, async ({ page }) => {
        test.slow(); // three full axe scans plus solving the level
        await start(page, [], theme);
        await openLevel(page, index);
        await audit(page, `level ${index + 1} before reproducing (${theme})`);

        await page.locator('#mode-switch button').last().click();
        await audit(page, `level ${index + 1} alternate mode (${theme})`);

        await solveWithPointer(page, level);
        await audit(page, `level ${index + 1} merged (${theme})`);
      });
    }

    test('fix state with a wrong suggestion applied has no axe violations', async ({ page }) => {
      await start(page, [], theme);
      await openLevel(page, 1);
      await page.getByRole('button', { name: 'Skip reproducing and go to the fix' }).click();
      await page.locator('#fix-logo-alt-logo').check();
      await page.locator('[data-key="apply-logo"]').click();
      await expect(page.locator('.review-box')).toBeVisible({ timeout: 15_000 });
      await audit(page, `fix state (${theme})`);
    });

    test('screen reader view with announcements has no axe violations', async ({ page, isMobile }) => {
      test.skip(isMobile, 'Tab key navigation is covered on desktop');
      await start(page, [], theme);
      await openLevel(page, 1);
      await page.locator('#enter-page').click();
      await page.keyboard.press('Tab');
      await expect(page.locator('#readout-log li')).toHaveCount(2);
      await audit(page, `screen reader view (${theme})`);
    });

    test('ending screens have no axe violations', async ({ page }) => {
      test.slow(); // solves a level and scans two screens
      await start(page, allLevelIds.slice(0, 4), theme);
      await page.getByRole('button', { name: /Continue/ }).click();
      await page.locator('#level-list button').last().click();
      await solveWithPointer(page, levels[levels.length - 1]);
      await page.getByRole('button', { name: /See your results/ }).click();
      await expect(page.locator('#ending-heading')).toBeFocused();
      await audit(page, `ending, partial (${theme})`);

      await page.evaluate((ids) => localStorage.setItem('shift-tab:progress', JSON.stringify(ids)), allLevelIds);
      await page.goto('/');
      await page.getByRole('button', { name: 'See your results' }).click();
      await expect(page.locator('#ending-heading')).toHaveText('Friday Community Night is ready.');
      await audit(page, `ending, complete (${theme})`);
    });
  });
}

test('dark mode is the default and the theme switch works and persists', async ({ page }) => {
  await start(page);
  const html = page.locator('html');
  const toggle = page.getByRole('switch', { name: 'Dark mode' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('switch', { name: 'Dark mode' })).toHaveAttribute('aria-checked', 'false');
});

test('theme switch works from the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard is covered on desktop');
  await start(page);
  const toggle = page.getByRole('switch', { name: 'Dark mode' });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});
