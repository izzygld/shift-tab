// Records docs/media/demo.gif (one level: reproduce → fix → merge). Banner and social preview art live in docs/media.
// Usage: npm run build && node scripts/media.mjs   (needs ffmpeg on PATH)
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'docs', 'media');
const tmp = join(root, 'test-results', 'media');
const port = 4174;
const base = `http://localhost:${port}/`;
mkdirSync(out, { recursive: true });
rmSync(tmp, { recursive: true, force: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();

try {
  // ---------- Demo GIF ----------
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: tmp, size: { width: 1280, height: 800 } } });
  await context.addInitScript(() => {
    localStorage.setItem('shift-tab:progress', '["01-find-your-way"]');
    localStorage.setItem('shift-tab:sound', 'off');
  });
  const page = await context.newPage();
  await page.goto(base);
  await pause(1800);
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('.check-row').first().waitFor();
  await pause(1200);

  await page.getByRole('button', { name: 'Screen reader view' }).click();
  await page.locator('#enter-page').click();
  for (let i = 0; i < 3; i++) {
    await pause(900);
    await page.keyboard.press('Tab');
  }
  await pause(1600);

  await page.locator('#pr').evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await pause(900);
  await page.getByRole('button', { name: 'Skip reproducing and go to the fix' }).click();
  await pause(900);
  await page.locator('#fix-logo-alt-logo').check();
  await pause(500);
  await page.locator('[data-key="apply-logo"]').click();
  await page.locator('.review-box').waitFor();
  await pause(2200);
  await page.locator('#fix-logo-alt-purpose').check();
  await pause(500);
  await page.locator('[data-key="apply-logo"]').click();
  await pause(1600);
  await page.locator('[data-key="apply-donate"]').scrollIntoViewIfNeeded();
  await page.locator('#fix-donate-aria-label').check();
  await pause(500);
  await page.locator('[data-key="apply-donate"]').click();
  await page.locator('.button--success').waitFor();
  await page.locator('.checks-column').evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await pause(1800);
  await page.locator('[data-key="merge"]').click();
  await page.locator('.merged-panel').evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await pause(3200);
  await context.close();

  const video = join(tmp, readdirSync(tmp).find((f) => f.endsWith('.webm')));
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', video,
    '-vf', 'fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    join(out, 'demo.gif'),
  ]);
  console.log('Wrote docs/media/demo.gif');
} finally {
  await browser.close();
  server.kill();
}
