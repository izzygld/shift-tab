import { expect, test } from '@playwright/test';
import { allLevelIds, levels, noHorizontalOverflow, openLevel, solveWithPointer, start } from './helpers';

test('no horizontal scrolling on any screen', async ({ page }) => {
  await start(page);
  await noHorizontalOverflow(page);

  await openLevel(page, 6);
  await noHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Skip reproducing and go to the fix' }).click();
  await noHorizontalOverflow(page);
  await solveWithPointer(page, levels[6]);
  await noHorizontalOverflow(page);

  await page.getByRole('button', { name: /See your results/ }).click();
  await noHorizontalOverflow(page);
});

test('next issue brings the level bar and issue card back to the top', async ({ page }) => {
  await start(page);
  await openLevel(page, 0);
  await solveWithPointer(page, levels[0]);
  await page.locator('.next-button').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);

  await page.locator('.next-button').click();
  await expect(page.locator('#issue-heading')).toBeFocused();
  await expect(page.locator('#issue-heading')).toHaveText(/Screen reader just says/);
  const navTop = await page.locator('#levels-nav').evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(navTop), 'level bar should sit at the top of the viewport').toBeLessThanOrEqual(2);
  await expect(page.locator('#issue-heading')).toBeInViewport();
});

test('choosing an earlier issue from the level bar also scrolls to the top', async ({ page }) => {
  await start(page, allLevelIds.slice(0, 2));
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('.pr-panel').scrollIntoViewIfNeeded();
  await page.locator('#levels-nav').scrollIntoViewIfNeeded();
  await page.locator('#level-list button').first().click();
  await expect(page.locator('#issue-heading')).toHaveText(/Can't see where I am/);
  await expect(page.locator('#issue-heading')).toBeInViewport();
  // Either the page is scrolled so the level bar is at the very top, or it's already at the top of the document.
  const { navTop, scrollY } = await page.locator('#levels-nav').evaluate((el) => ({ navTop: el.getBoundingClientRect().top, scrollY: window.scrollY }));
  expect(Math.abs(navTop) <= 2 || scrollY === 0).toBe(true);
});

test('content reflows at 320px wide (WCAG 1.4.10)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop project resizes to 320px');
  await page.setViewportSize({ width: 320, height: 720 });
  await start(page);
  await noHorizontalOverflow(page);
  await openLevel(page, 1);
  await page.getByRole('button', { name: 'Skip reproducing and go to the fix' }).click();
  await noHorizontalOverflow(page);
});

test('respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await openLevel(page, 0);
  await solveWithPointer(page, levels[0]);
  const animation = await page.locator('.merged-badge').evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('none');
});
