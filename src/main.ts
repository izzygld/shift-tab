import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '@fontsource/atkinson-hyperlegible-mono/400.css';
import '@fontsource/atkinson-hyperlegible-mono/700.css';
import './styles.css';
import { applyFixes, levels } from './engine/levels';
import { runChecks, type CheckResult } from './engine/checks';
import { describeElement } from './engine/screenReader';
import { sound } from './engine/sound';
import type { FixGroup, Level, Mode } from './types';

const STORAGE_KEY = 'shift-tab:progress';
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  levelList: $<HTMLOListElement>('level-list'),
  issue: $('issue'),
  modeSwitch: $('mode-switch'),
  modeHint: $('mode-hint'),
  enterPage: $<HTMLButtonElement>('enter-page'),
  frame: $<HTMLIFrameElement>('frame'),
  readoutHint: $('readout-hint'),
  readoutLog: $<HTMLOListElement>('readout-log'),
  speechToggle: $<HTMLInputElement>('speech-toggle'),
  speechRate: $<HTMLSelectElement>('speech-rate'),
  pr: $('pr'),
  announcer: $('announcer'),
  progress: $('progress'),
  soundToggle: $<HTMLButtonElement>('sound-toggle'),
  url: $('frame-url'),
  titleScreen: $('title-screen'),
  game: $('main'),
  levelsNav: $('levels-nav'),
  ending: $('ending'),
  homeBtn: $<HTMLButtonElement>('home-btn'),
  skipLink: $<HTMLAnchorElement>('skip-link'),
};

interface State {
  index: number;
  mode: Mode;
  reproduced: boolean;
  selected: Record<string, string>;
  applied: Record<string, string>;
  checks: CheckResult[];
  checkSoundPending: boolean;
  merged: boolean;
}

const state: State = { index: 0, mode: 'keyboard', reproduced: false, selected: {}, applied: {}, checks: [], checkSoundPending: false, merged: false };
const completed = new Set<string>(loadProgress());

function loadProgress(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const level = (): Level => levels[state.index];

type Child = Node | string | null | undefined | false;
function h(tag: string, attrs: Record<string, string | boolean> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

function announce(message: string) {
  ui.announcer.textContent = '';
  setTimeout(() => (ui.announcer.textContent = message), 50);
}

// ---------- Level lifecycle ----------

function loadLevel(index: number) {
  state.index = index;
  state.mode = level().modes[0];
  state.reproduced = false;
  state.selected = {};
  state.applied = {};
  state.checks = [];
  state.merged = false;
  ui.readoutLog.replaceChildren();
  renderLevelList();
  renderIssue();
  renderModes();
  renderFrame();
  renderPR();
}

function renderFrame() {
  ui.url.textContent = `commons.example.org/friday · ${level().title.toLowerCase().replace(/\s+/g, '-')}`;
  ui.frame.srcdoc = applyFixes(level(), state.applied);
}

let lastEscape = 0;
let checking = false;

ui.frame.addEventListener('load', async () => {
  const doc = ui.frame.contentDocument;
  if (!doc) return;
  const { task } = level();
  doc.addEventListener('click', (e) => {
    const target = e.target as Element;
    if (target.closest('a')) e.preventDefault();
    if (task.goalSelector && target.closest(task.goalSelector)) onGoalReached();
  });
  doc.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    if (task.goalKey && e.key === task.goalKey) onGoalReached(true);
    if (e.key !== 'Escape') return;
    // Double Escape always returns to the game, so a keyboard trap in a level never traps the player.
    const now = performance.now();
    if (now - lastEscape < 600) {
      ui.enterPage.focus();
      announce('Back in the game.');
    }
    lastEscape = now;
  });
  doc.addEventListener('submit', (e) => e.preventDefault());
  doc.addEventListener('focusin', (e) => onFrameFocus(e.target as Element));
  // Levels can signal time-based goals (e.g. a session expiring) with this event.
  doc.addEventListener('shift-tab:goal', () => onGoalReached());

  checking = true;
  state.checks = await runChecks(ui.frame, level());
  checking = false;
  if (state.checkSoundPending) {
    state.checkSoundPending = false;
    if (state.checks.every((c) => c.passed)) sound.pass();
    else sound.fail();
  }
  renderPR();
});

function onGoalReached(leaveFrame = false) {
  if (state.reproduced) return;
  state.reproduced = true;
  const fromPanel = ui.pr.contains(document.activeElement);
  renderIssue();
  renderPR(fromPanel || leaveFrame ? 'suggestions' : undefined);
  announce(level().task.afterReproduce);
}

// ---------- Modes and screen reader view ----------

function renderModes() {
  const labels: Record<Mode, string> = { keyboard: 'Keyboard only', 'screen-reader': 'Screen reader view', pointer: 'Mouse or touch' };
  ui.modeSwitch.replaceChildren(
    ...level().modes.map((m) => {
      const btn = h('button', { type: 'button', 'aria-pressed': String(state.mode === m) }, labels[m]);
      btn.addEventListener('click', () => {
        state.mode = m;
        renderModes();
        announce(`${labels[m]} mode on.`);
      });
      return btn;
    }),
  );
  const keyboard = state.mode === 'keyboard';
  ui.frame.classList.toggle('pointer-off', keyboard);
  const hints: Record<Mode, string> = {
    keyboard: 'Mouse is turned off for the page. Use Tab, Shift+Tab, Enter and Space.',
    'screen-reader': 'Each element you focus is announced in the screen reader view. Turn on speech to hear it.',
    pointer: 'Use your mouse, trackpad or touch screen on the page.',
  };
  ui.modeHint.textContent = hints[state.mode];
  ui.readoutHint.textContent =
    state.mode === 'screen-reader'
      ? 'Approximate announcements. Real screen readers vary; try NVDA (Windows) or VoiceOver (Mac) too.'
      : 'Switch to Screen reader view to see announcements.';
}

ui.enterPage.addEventListener('click', () => {
  const doc = ui.frame.contentDocument;
  const first = doc?.querySelector<HTMLElement>(FOCUSABLE);
  ui.frame.focus();
  first?.focus();
});

function onFrameFocus(el: Element) {
  if (checking) return;
  if (state.mode !== 'screen-reader') {
    sound.focus();
    return;
  }
  const a = describeElement(el);
  if (a.unnamed || a.hidden) sound.barrier();
  else sound.focus();
  const item = h('li', { class: a.unnamed || a.hidden ? 'warn' : '' }, a.text, a.unnamed && ' ', a.unnamed && h('span', { class: 'tag' }, 'no accessible name'));
  ui.readoutLog.prepend(item);
  while (ui.readoutLog.children.length > 25) ui.readoutLog.lastElementChild?.remove();

  if (ui.speechToggle.checked && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(a.text);
    u.rate = Number(ui.speechRate.value);
    speechSynthesis.speak(u);
  }
}

// ---------- Issue panel ----------

function renderIssue() {
  const l = level();
  const initials = l.issue.reporter.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .replace(/[^A-Z]/gi, '')
    .slice(0, 2);
  ui.issue.replaceChildren(
    h('p', { class: 'issue-meta' }, h('span', { class: state.merged ? 'state closed' : 'state open' }, state.merged ? 'Closed' : 'Open'), ` Issue #${l.issue.number}`),
    h('h2', { id: 'issue-heading' }, l.issue.title),
    h(
      'div',
      { class: 'reporter' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials),
      h('p', {}, h('strong', {}, l.issue.reporter.name), h('br'), h('span', { class: 'uses' }, `Uses: ${l.issue.reporter.uses}`)),
    ),
    h('div', { class: 'issue-body' }, ...l.issue.body.map((p) => h('p', {}, p))),
    h('ul', { class: 'labels', 'aria-label': 'Labels' }, h('li', {}, 'accessibility'), ...l.wcag.map((w) => h('li', {}, `WCAG ${w.id}`))),
    h('h3', {}, 'Your task'),
    h('p', { class: state.reproduced ? 'task done' : 'task' }, state.reproduced ? `Reproduced. ${l.task.afterReproduce}` : l.task.instruction),
    h('h3', {}, 'Learn more'),
    h('ul', { class: 'wcag-links' }, ...l.wcag.map((w) => h('li', {}, h('a', { href: w.url, target: '_blank', rel: 'noopener' }, `${w.id} ${w.name}`, h('span', { class: 'visually-hidden' }, ' (opens in a new tab)'))))),
  );
}

function renderLevelList() {
  ui.progress.replaceChildren(
    h('span', {}, `${completed.size} of ${levels.length} issues fixed`),
    h('span', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: `width: ${(completed.size / levels.length) * 100}%` })),
  );
  ui.levelList.replaceChildren(
    ...levels.map((l, i) => {
      const btn = h(
        'button',
        { type: 'button', 'aria-current': i === state.index ? 'step' : false },
        h('span', { class: 'step-key', 'aria-hidden': 'true' }, completed.has(l.id) ? '✓' : String(i + 1)),
        h('span', { class: 'visually-hidden' }, `Level ${i + 1}: `),
        l.title,
        completed.has(l.id) && h('span', { class: 'visually-hidden' }, ' (fixed)'),
      );
      btn.addEventListener('click', () => {
        loadLevel(i);
        focusIssue();
      });
      return h('li', {}, btn);
    }),
  );
}

function focusIssue() {
  const heading = $('issue-heading');
  heading.setAttribute('tabindex', '-1');
  heading.focus();
}

// ---------- Pull request panel ----------

// Re-rendering replaces nodes, so restore keyboard focus to the equivalent control.
function renderPR(focusKey?: string) {
  const active = document.activeElement as HTMLElement | null;
  const key = focusKey ?? (ui.pr.contains(active) ? active?.dataset.key ?? active?.id : undefined);
  ui.pr.replaceChildren(...buildPR());
  if (key) ui.pr.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"], #${CSS.escape(key)}`)?.focus();
}

function buildPR(): Node[] {
  const l = level();
  const heading = h(
    'h2',
    { id: 'pr-heading', tabindex: '-1', 'data-key': 'pr-heading' },
    `Fix #${l.issue.number}: ${l.issue.title}`,
  );
  const branch = h('p', { class: 'branch' }, h('code', {}, `fix/issue-${l.issue.number}`), ' → ', h('code', {}, 'main'));

  if (state.merged) {
    const last = state.index + 1 >= levels.length;
    const next = h('button', { type: 'button', class: 'primary' }, last ? 'See your results →' : 'Next issue →');
    next.addEventListener('click', () => {
      if (last) {
        showScreen('ending');
        return;
      }
      loadLevel(state.index + 1);
      focusIssue();
    });
    return [
      h('p', { class: 'merged-badge' }, 'Merged'),
      heading,
      branch,
      h('blockquote', {}, h('p', {}, l.merged.reply), h('footer', {}, l.issue.reporter.name)),
      h('h3', {}, 'What you learned'),
      h('ul', { class: 'learned' }, ...l.merged.learn.map((x) => h('li', {}, x))),
      next,
    ];
  }

  if (!state.reproduced) {
    const skip = h('button', { type: 'button', class: 'secondary' }, 'Skip reproducing and go to the fix');
    skip.addEventListener('click', () => onGoalReached());
    return [heading, branch, h('p', {}, 'Reproduce the issue first so you know what the reporter ran into.'), skip, renderChecks()];
  }

  const allCorrect = l.fixes.every((g) => g.options.find((o) => o.id === state.applied[g.id])?.correct);
  const allPass = state.checks.length > 0 && state.checks.every((c) => c.passed);
  const ready = allCorrect && allPass;
  const merge = h('button', { type: 'button', class: 'merge', 'aria-disabled': String(!ready), 'data-key': 'merge' }, 'Merge pull request');
  merge.addEventListener('click', () => {
    if (!ready) {
      announce(allPass ? 'Checks pass, but one suggestion still does not solve the problem for the reporter. Review the feedback.' : 'Checks are still failing. Apply a fix that passes them.');
      return;
    }
    state.merged = true;
    completed.add(l.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
    sound.merge();
    renderLevelList();
    renderIssue();
    renderPR('pr-heading');
    announce(`Merged. ${l.issue.reporter.name} replied: ${l.merged.reply}`);
  });

  return [heading, branch, h('h3', { tabindex: '-1', 'data-key': 'suggestions' }, 'Suggested changes'), ...l.fixes.map(renderFixGroup), renderChecks(), merge];
}

function renderFixGroup(group: FixGroup): HTMLElement {
  const name = `fix-${group.id}`;
  const appliedId = state.applied[group.id];
  const applied = group.options.find((o) => o.id === appliedId);

  const options = group.options.map((o) => {
    const id = `${name}-${o.id}`;
    const radio = h('input', { type: 'radio', name, id, value: o.id, checked: state.selected[group.id] === o.id }) as HTMLInputElement;
    radio.addEventListener('change', () => (state.selected[group.id] = o.id));
    return h('div', { class: 'option' }, radio, h('label', { for: id }, o.label), renderDiff(group.find, o.replace));
  });

  const apply = h('button', { type: 'button', class: 'primary', 'data-key': `apply-${group.id}` }, 'Apply suggestion');
  apply.addEventListener('click', () => {
    const chosen = state.selected[group.id];
    if (!chosen) {
      announce('Choose a suggestion first.');
      return;
    }
    state.applied[group.id] = chosen;
    state.checkSoundPending = true;
    const option = group.options.find((o) => o.id === chosen)!;
    renderFrame();
    announce(`Applied. Running checks. ${option.feedback}`);
  });

  return h(
    'fieldset',
    { class: 'fix-group' },
    h('legend', {}, group.title),
    ...options,
    apply,
    applied && h('p', { class: applied.correct ? 'feedback good' : 'feedback bad' }, h('strong', {}, applied.correct ? 'Reviewer: ' : 'Reviewer note: '), applied.feedback),
  );
}

function renderDiff(removed: string, added: string): HTMLElement {
  const line = (tag: 'del' | 'ins', prefix: string, label: string, text: string) =>
    h(tag, {}, h('span', { class: 'visually-hidden' }, label), h('span', { 'aria-hidden': 'true' }, prefix), text);
  return h(
    'pre',
    { class: 'diff' },
    ...removed.split('\n').flatMap((t) => [line('del', '- ', 'Remove: ', t), '\n']),
    ...added.split('\n').flatMap((t) => [line('ins', '+ ', 'Add: ', t), '\n']),
  );
}

function renderChecks(): HTMLElement {
  if (!state.checks.length) return h('p', { class: 'hint' }, 'Running checks…');
  const passed = state.checks.filter((c) => c.passed).length;
  return h(
    'div',
    { class: 'checks' },
    h('h3', {}, `Checks: ${passed} of ${state.checks.length} passing`),
    h(
      'ul',
      {},
      ...state.checks.map((c) =>
        h(
          'li',
          { class: c.passed ? 'pass' : 'fail' },
          h('span', { class: 'icon', 'aria-hidden': 'true' }, c.passed ? '✓' : '✕'),
          h('span', {}, h('strong', {}, c.passed ? 'Passed: ' : 'Failed: '), c.label, h('br'), h('span', { class: 'detail' }, c.detail)),
        ),
      ),
    ),
  );
}

function renderSoundToggle() {
  ui.soundToggle.setAttribute('aria-pressed', String(sound.enabled));
}
ui.soundToggle.addEventListener('click', () => {
  sound.setEnabled(!sound.enabled);
  renderSoundToggle();
  announce(sound.enabled ? 'Sound effects on.' : 'Sound effects off.');
});

// ---------- Screens ----------

type Screen = 'title' | 'game' | 'ending';

function showScreen(screen: Screen, moveFocus = true) {
  ui.titleScreen.hidden = screen !== 'title';
  ui.game.hidden = screen !== 'game';
  ui.levelsNav.hidden = screen !== 'game';
  ui.ending.hidden = screen !== 'ending';
  ui.homeBtn.hidden = screen === 'title';
  if (screen === 'title') renderTitle();
  if (screen === 'ending') {
    renderEnding();
    sound.merge();
  }
  const target = { title: 'title-heading', game: 'issue-heading', ending: 'ending-heading' }[screen];
  ui.skipLink.href = `#${screen === 'game' ? 'level-heading' : target}`;
  if (moveFocus) {
    const heading = $(target);
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  }
}

ui.homeBtn.addEventListener('click', () => showScreen('title'));

function play(index: number) {
  loadLevel(index);
  showScreen('game');
}

function renderTitle() {
  const next = levels.findIndex((l) => !completed.has(l.id));
  const resume = completed.size > 0 && next !== -1;
  const start = h('button', { type: 'button', class: 'primary big' }, resume ? `Continue: Level ${next + 1}` : 'Start playing');
  start.addEventListener('click', () => play(resume ? next : 0));
  const actions: HTMLElement[] = [start];
  if (completed.size > 0) {
    const restart = h('button', { type: 'button', class: 'big' }, 'Start from level 1');
    restart.addEventListener('click', () => play(0));
    actions.push(restart);
  }
  if (next === -1) {
    const results = h('button', { type: 'button', class: 'big' }, 'See your results');
    results.addEventListener('click', () => showScreen('ending'));
    actions.push(results);
  }

  const step = (n: string, title: string, text: string) =>
    h('li', {}, h('span', { class: 'key', 'aria-hidden': 'true' }, n), h('h3', {}, title), h('p', {}, text));

  ui.titleScreen.replaceChildren(
    h(
      'div',
      { class: 'hero' },
      h('p', { class: 'hero-keys', 'aria-hidden': 'true' }, h('kbd', { class: 'key key-xl key-wide' }, '⇧ Shift'), h('span', { class: 'plus' }, '+'), h('kbd', { class: 'key key-xl' }, 'Tab')),
      h('h2', { id: 'title-heading' }, "Friday Community Night is coming. The website isn't ready."),
      h(
        'p',
        { class: 'lede' },
        `People using a keyboard, a screen reader, switch access and a head pointer have reported ${levels.length} barriers on Commons, a small community nonprofit's website. You're a first-time contributor. Reproduce each issue, choose the right fix, pass the checks, and merge before Friday.`,
      ),
      h('div', { class: 'hero-actions' }, ...actions),
    ),
    h(
      'ol',
      { class: 'steps' },
      step('1', 'Reproduce', 'Use the page the way the reporter does: keyboard only, screen reader view, or mouse and touch.'),
      step('2', 'Fix', "Choose a suggested change. Some pass the automated checks and still don't help, so read the feedback."),
      step('3', 'Merge', 'Pass the checks and hear back from the person who reported the issue.'),
    ),
    h(
      'p',
      { class: 'title-note' },
      "Playable with a keyboard, a screen reader, or touch. About 20 minutes. Progress is saved only in this browser. This game doesn't simulate disability. It teaches how assistive technology works and what developers need to build.",
    ),
  );
}

function renderEnding() {
  const fixed = levels.filter((l) => completed.has(l.id));
  const all = fixed.length === levels.length;
  const criteria = new Map<string, string>();
  for (const l of fixed) for (const w of l.wcag) criteria.set(w.id, w.name);
  const sorted = [...criteria].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  const share = h('button', { type: 'button', class: 'primary' }, 'Share the game');
  share.addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    if (navigator.share) {
      await navigator.share({ title: 'Shift+Tab', text: 'A free, open source game about web accessibility.', url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    share.textContent = 'Link copied';
    announce('Link copied to the clipboard.');
  });
  const replay = h('button', { type: 'button' }, 'Play again from level 1');
  replay.addEventListener('click', () => play(0));
  const toTitle = h('button', { type: 'button' }, 'Title screen');
  toTitle.addEventListener('click', () => showScreen('title'));

  const card = (title: string, text: string, href: string, linkText: string) =>
    h(
      'li',
      {},
      h('h4', {}, title),
      h('p', {}, text),
      h('a', { href, target: '_blank', rel: 'noopener' }, linkText, h('span', { class: 'visually-hidden' }, ' (opens in a new tab)')),
    );

  const unfixed = levels
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !completed.has(l.id))
    .map(({ l, i }) => {
      const btn = h('button', { type: 'button' }, `Level ${i + 1}: ${l.title}`);
      btn.addEventListener('click', () => play(i));
      return h('li', {}, btn);
    });

  const parts: Child[] = [
    h(
      'div',
      { class: 'hero' },
      h('p', { class: 'merged-badge' }, all ? 'All issues closed' : `${fixed.length} of ${levels.length} issues closed`),
      h('h2', { id: 'ending-heading' }, all ? 'Friday Community Night is ready.' : `You fixed ${fixed.length} of ${levels.length} issues.`),
      h(
        'p',
        { class: 'lede' },
        all
          ? 'Everyone who reported a barrier can now sign up, register, RSVP and donate. Each one you fixed is a barrier people run into on real websites every day.'
          : 'Some issues are still open. Pick up where you left off any time.',
      ),
    ),
    unfixed.length > 0 && h('section', { 'aria-labelledby': 'open-heading' }, h('h3', { id: 'open-heading' }, 'Still open'), h('ul', { class: 'unfixed' }, ...unfixed)),
    sorted.length > 0 &&
      h(
        'section',
        { 'aria-labelledby': 'learned-heading' },
        h('h3', { id: 'learned-heading' }, 'WCAG 2.2 success criteria you practiced'),
        h('ul', { class: 'badges' }, ...sorted.map(([id, name]) => h('li', {}, h('span', { class: 'key key-sm' }, id), ' ', name))),
      ),
    h(
      'section',
      { 'aria-labelledby': 'next-heading' },
      h('h3', { id: 'next-heading' }, 'Keep going'),
      h(
        'ul',
        { class: 'next-cards' },
        card('Fix a real accessibility issue', 'Find open source projects for social good that need contributors, including accessibility fixes.', 'https://forgoodfirstissue.github.com/', 'For Good First Issue'),
        card('Try a real screen reader', 'NVDA is free for Windows. VoiceOver is built into every Mac and iPhone.', 'https://www.nvaccess.org/download/', 'Download NVDA'),
        card('Add a level', 'Levels are plain HTML and JSON. Add one with a pull request.', 'https://github.com/izzygld/shift-tab/blob/main/CONTRIBUTING.md', 'Contributing guide'),
        card('Learn the guidelines', 'The W3C Web Accessibility Initiative explains each guideline with examples.', 'https://www.w3.org/WAI/fundamentals/', 'WAI fundamentals'),
      ),
    ),
    h('div', { class: 'hero-actions' }, share, replay, toTitle),
  ];
  ui.ending.replaceChildren(...parts.filter((p): p is Node => p instanceof Node));
}

renderSoundToggle();
loadLevel(0);
showScreen('title', false);
