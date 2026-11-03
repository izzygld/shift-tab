// Records docs/media/demo.gif (one level: reproduce → fix → merge) and renders docs/media/social-preview.png.
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

  // ---------- Social preview (1280×640) ----------
  const shot = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await shot.addInitScript(() => localStorage.setItem('shift-tab:sound', 'off'));
  await shot.goto(base);
  await shot.getByRole('button', { name: /Start playing|Continue/ }).click();
  await shot.locator('#level-list button').nth(1).click();
  await shot.locator('.check-row').first().waitFor();
  await shot.getByRole('button', { name: 'Screen reader view' }).click();
  await shot.locator('#enter-page').click();
  await shot.keyboard.press('Tab');
  await shot.keyboard.press('Tab');
  await pause(400);
  const game = (await shot.locator('.workspace').screenshot()).toString('base64');

  const card = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  await card.goto(base);
  await card.setContent(`<!doctype html><html><head>
    ${await card.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet], style')].map((n) => n.outerHTML).join(''))}
    <base href="${base}">
    <style>
      body { margin:0; width:1280px; height:640px; overflow:hidden; display:grid; grid-template-columns: 560px 1fr; background: var(--ink); color:#fff; }
      .copy { padding: 64px 0 56px 64px; display:flex; flex-direction:column; }
      .copy .logo { margin-bottom: 40px; }
      .copy .logo .keycap { color: var(--ink); }
      .copy h1 { font: 700 64px/1.02 var(--sans); letter-spacing:-.04em; margin:0; }
      .copy h1 span { color: var(--yellow); }
      .copy p { color:#cbd5e1; font-size:24px; line-height:1.4; margin:22px 0 0; }
      .copy .tags { margin-top:auto; display:flex; gap:10px; }
      .copy .tags span { border:2px solid #fff; border-radius:999px; padding:6px 14px; font:700 16px var(--mono); }
      .copy .tags span:first-child { background: var(--yellow); color: var(--ink); border-color: var(--yellow); }
      .shot { position:relative; overflow:hidden; background: var(--paper); border-left: 4px solid var(--yellow); }
      .shot img { position:absolute; top:40px; left:40px; width: 1100px; border:3px solid var(--ink); border-radius:16px; box-shadow: 10px 10px 0 var(--ink); }
    </style></head><body>
    <div class="copy">
      <div class="logo logo--xl"><span class="keycap">⇧ Shift</span><span class="logo-plus" style="color:var(--yellow)">+</span><span class="keycap">Tab</span></div>
      <h1>Navigate the web like millions do. <span>Then fix it.</span></h1>
      <p>A free, open source puzzle game about web accessibility.</p>
      <div class="tags"><span>GitHub Game Off 2026</span><span>WCAG 2.2</span></div>
    </div>
    <div class="shot"><img alt="" src="data:image/png;base64,${game}"></div>
  </body></html>`);
  await card.evaluate(() => document.fonts.ready);
  await pause(300);
  await card.screenshot({ path: join(out, 'social-preview.png') });
  console.log('Wrote docs/media/demo.gif and docs/media/social-preview.png');
} finally {
  await browser.close();
  server.kill();
}
