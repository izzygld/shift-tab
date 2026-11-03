import { expect, test, type Page } from '@playwright/test';
import { levels, start } from './helpers';

test.skip(({ isMobile }) => isMobile, 'Keyboard playthrough runs on desktop');

/** Press Tab until the focused element matches, failing if we loop the whole page. */
async function tabTo(page: Page, selector: string, max = 80) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Could not reach ${selector} with Tab`);
}

async function expectVisibleFocus(page: Page) {
  const visible = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const target = el.matches('input[type="radio"]') ? (el.closest('.option-card') as HTMLElement) : el;
    const s = getComputedStyle(target);
    return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
  });
  expect(visible, 'focused element should have a visible focus indicator').toBe(true);
}

test('the whole game can be played with the keyboard alone', async ({ page }) => {
  test.setTimeout(180_000);
  await start(page);

  await tabTo(page, '.hero-actions button');
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#issue-heading')).toBeFocused();

  for (const [index, level] of levels.entries()) {
    await expect(page.locator('#game-heading')).toHaveText(new RegExp(`Level ${index + 1} of`));
    await expect(page.locator('.check-row').first()).toBeVisible({ timeout: 15_000 });

    // Bypass the level page with the skip link, then skip reproducing.
    await tabTo(page, '.skip-inline');
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    await tabTo(page, '#pr .button--secondary');
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-key="suggestions"]')).toBeFocused();

    for (const group of level.fixes) {
      const target = group.options.findIndex((o) => o.correct);
      await tabTo(page, `input[name="fix-${group.id}"]`);
      await expectVisibleFocus(page);
      if (target === 0) await page.keyboard.press('Space');
      for (let i = 0; i < target; i++) await page.keyboard.press('ArrowDown');
      await expect(page.locator(`#fix-${group.id}-${group.options[target].id}`)).toBeChecked();

      await tabTo(page, `[data-key="apply-${group.id}"]`);
      await page.keyboard.press('Enter');
      await expect(page.locator(`#fix-${group.id}-${group.options[target].id}`).locator('xpath=../..').locator('.pill-applied')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator(`[data-key="apply-${group.id}"]`), 'focus stays on Apply after checks re-render').toBeFocused();
    }

    await tabTo(page, '[data-key="merge"]');
    await expect(page.locator('[data-key="merge"]')).toHaveAttribute('aria-disabled', 'false');
    await page.keyboard.press('Enter');
    await expect(page.locator('.merged-badge')).toBeVisible();
    await expect(page.locator('#pr-heading')).toBeFocused();

    await tabTo(page, '.next-button');
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    if (index < levels.length - 1) await expect(page.locator('#issue-heading')).toBeFocused();
  }

  await expect(page.locator('#ending-heading')).toBeFocused();
  await expect(page.locator('#ending-heading')).toHaveText('Friday Community Night is ready.');
  await tabTo(page, '.ending-buttons button');
  await expectVisibleFocus(page);
});

test('reproducing with the keyboard works, including escaping the focus trap', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Start playing' }).click();
  await expect(page.locator('.check-row').first()).toBeVisible({ timeout: 15_000 });

  // Level 1: Tab to the Volunteer button inside the page and press Enter.
  await page.locator('#enter-page').focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('.task-callout--done')).toBeVisible();

  // Escape twice inside any page returns focus to the game.
  await page.locator('#enter-page').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#enter-page')).toBeFocused();

  // Level 4: Tab stays trapped in the pop-up; Escape counts as reproducing and moves focus to the fix.
  await page.locator('#level-list button').nth(3).click();
  await expect(page.locator('.check-row').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('#enter-page').focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  const trapped = await page.frameLocator('#frame').locator('#modal').evaluate((m) => m.contains(m.ownerDocument.activeElement));
  expect(trapped).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-key="suggestions"]')).toBeFocused();
});

test('screen reader view announces names, roles and missing names', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Start playing' }).click();
  await page.locator('#level-list button').nth(1).click();
  await expect(page.locator('.check-row').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('#enter-page').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const items = page.locator('#readout-log li');
  await expect(items.nth(0)).toContainText('Share event, button');
  await expect(items.nth(1)).toContainText('[no accessible name]');
  await expect(items.nth(2)).toContainText('[no accessible name]');
});
