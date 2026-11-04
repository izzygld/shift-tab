import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '@fontsource/atkinson-hyperlegible-mono/400.css';
import '@fontsource/atkinson-hyperlegible-mono/700.css';
import './styles.css';
import { applyFixes, levels } from './engine/levels';
import { runChecks, type CheckResult } from './engine/checks';
import { describeElement } from './engine/screenReader';
import { sound } from './engine/sound';
import { icon, type IconName } from './icons';
import type { FixGroup, Level, Mode } from './types';

const STORAGE_KEY = 'shift-tab:progress';
const THEME_KEY = 'shift-tab:theme';
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  levelList: $<HTMLOListElement>('level-list'),
  issue: $('issue'),
  modeSwitch: $('mode-switch'),
  modeHint: $('mode-hint'),
  enterPage: $<HTMLButtonElement>('enter-page'),
  browser: $('browser'),
  frame: $<HTMLIFrameElement>('frame'),
  liveDot: $('live-dot'),
  readoutHint: $('readout-hint'),
  readoutLog: $<HTMLOListElement>('readout-log'),
  speechToggle: $<HTMLInputElement>('speech-toggle'),
  speechRate: $<HTMLSelectElement>('speech-rate'),
  pr: $('pr'),
  announcer: $('announcer'),
  progress: $('progress'),
  soundToggle: $<HTMLButtonElement>('sound-toggle'),
  themeToggle: $<HTMLButtonElement>('theme-toggle'),
  playGuide: $('play-guide'),
  url: $('frame-url'),
  titleScreen: $('title-screen'),
  game: $('main'),
  gameHeading: $('game-heading'),
  levelsNav: $('levels-nav'),
  ending: $('ending'),
  homeBtn: $<HTMLButtonElement>('home-btn'),
  skipLink: $<HTMLAnchorElement>('skip-link'),
};

interface Entry {
  text: string;
  kind: string;
  warn: boolean;
  time: number;
}

interface State {
  index: number;
  mode: Mode;
  reproduced: boolean;
  selected: Record<string, string>;
  applied: Record<string, string>;
  lastApplied?: string;
  checks: CheckResult[];
  checkSoundPending: boolean;
  merged: boolean;
  readout: Entry[];
}

const state: State = {
  index: 0,
  mode: 'keyboard',
  reproduced: false,
  selected: {},
  applied: {},
  checks: [],
  checkSoundPending: false,
  merged: false,
  readout: [],
};
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

type Child = Node | string | null | undefined | false | Child[];
function h(tag: string, attrs: Record<string, string | boolean> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity as 1)) if (c) el.append(c as Node | string);
  return el;
}

const nodes = (parts: Child[]): Node[] => parts.filter((p): p is Node => p instanceof Node);

function announce(message: string) {
  ui.announcer.textContent = '';
  setTimeout(() => (ui.announcer.textContent = message), 50);
}

const external = (href: string, ...label: Child[]) =>
  h('a', { href, target: '_blank', rel: 'noopener' }, ...label, ' ', icon('external', 14), h('span', { class: 'sr-only' }, '(opens in a new tab)'));

// ---------- Top bar ----------

function renderProgress() {
  const pct = Math.round((completed.size / levels.length) * 100);
  ui.progress.replaceChildren(
    h('div', {}, h('span', {}, h('strong', {}, `${completed.size} of ${levels.length}`), ' issues fixed'), h('span', { 'aria-hidden': 'true' }, `${pct}%`)),
    h(
      'div',
      {
        class: 'progress-track',
        role: 'progressbar',
        'aria-label': 'Issues fixed',
        'aria-valuemin': '0',
        'aria-valuemax': String(levels.length),
        'aria-valuenow': String(completed.size),
        'aria-valuetext': `${completed.size} of ${levels.length} issues fixed`,
      },
      h('span', { style: `width: ${pct}%` }),
    ),
  );
}

function renderSoundToggle() {
  ui.soundToggle.setAttribute('aria-checked', String(sound.enabled));
  ui.soundToggle.querySelector('.toggle')?.classList.toggle('is-on', sound.enabled);
}

ui.soundToggle.addEventListener('click', () => {
  sound.setEnabled(!sound.enabled);
  renderSoundToggle();
});

type Theme = 'dark' | 'light';

// index.html applies a saved theme before first paint; dark is the default.
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  ui.themeToggle.setAttribute('aria-checked', String(theme === 'dark'));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#08123c' : '#f8fafc');
}

ui.themeToggle.addEventListener('click', () => {
  const next: Theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
});

// ---------- Level lifecycle ----------

function loadLevel(index: number) {
  state.index = index;
  state.mode = level().modes[0];
  state.reproduced = false;
  state.selected = {};
  state.applied = {};
  state.lastApplied = undefined;
  state.checks = [];
  state.merged = false;
  state.readout = [];
  lastEscape = 0;
  ui.gameHeading.textContent = `Level ${index + 1} of ${levels.length}: ${level().title}`;
  renderLevelList();
  renderIssue();
  renderModes();
  renderReadout();
  renderEnterButton();
  renderFrame();
  renderPR();
}

function renderFrame() {
  ui.url.textContent = `commons.example.org/friday · ${level().title.toLowerCase().replace(/\s+/g, '-')}`;
  ui.frame.srcdoc = applyFixes(level(), state.applied);
}

let lastEscape = 0;
let checking = false;
// Fast level switches can fire `load` twice for one document; wire each document once.
const wiredDocs = new WeakSet<Document>();

ui.frame.addEventListener('load', async () => {
  const doc = ui.frame.contentDocument;
  if (!doc || wiredDocs.has(doc)) return;
  wiredDocs.add(doc);
  const { task } = level();
  doc.addEventListener('click', (e) => {
    const target = e.target as Element;
    if (target.closest('a')) e.preventDefault();
    if (task.goalSelector && target.closest(task.goalSelector)) onGoalReached();
  });
  doc.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    if (task.goalKey && e.key === task.goalKey && !state.reproduced) {
      onGoalReached(true);
      lastEscape = 0;
      return;
    }
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
  doc.addEventListener('focusin', (e) => {
    ui.browser.classList.add('browser--focused');
    onFrameFocus(e.target as Element);
  });
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

document.addEventListener('focusin', (e) => {
  if (e.target !== ui.frame) ui.browser.classList.remove('browser--focused');
});

function onGoalReached(leaveFrame = false) {
  if (state.reproduced) return;
  state.reproduced = true;
  const fromPanel = ui.pr.contains(document.activeElement);
  renderIssue();
  renderEnterButton();
  renderPR(fromPanel || leaveFrame ? 'suggestions' : undefined);
  announce(level().task.afterReproduce);
}

// ---------- Modes, stage and screen reader view ----------

const MODE_LABELS: Record<Mode, string> = { keyboard: 'Keyboard only', 'screen-reader': 'Screen reader view', pointer: 'Mouse or touch' };
const MODE_HINTS: Record<Mode, string> = {
  keyboard: 'Mouse is off for the page: use Tab, Shift+Tab, Enter and Space.',
  'screen-reader': 'Each focused element appears in the screen reader view.',
  pointer: 'Use your mouse, trackpad or touch screen on the page.',
};

function renderModes() {
  const modes = level().modes;
  ui.modeSwitch.className = `mode-switch mode-switch--${['one', 'two', 'three'][modes.length - 1]}`;
  ui.modeSwitch.replaceChildren(
    ...modes.map((m) => {
      const btn = h('button', { type: 'button', class: state.mode === m ? 'active' : '', 'aria-pressed': String(state.mode === m) }, MODE_LABELS[m]);
      btn.addEventListener('click', () => {
        state.mode = m;
        renderModes();
        ui.modeSwitch.querySelector<HTMLElement>('.active')?.focus();
        announce(`${MODE_LABELS[m]} mode on.`);
      });
      return btn;
    }),
  );
  ui.frame.classList.toggle('pointer-off', state.mode === 'keyboard');
  ui.modeHint.textContent = MODE_HINTS[state.mode];
  const live = state.mode === 'screen-reader';
  ui.liveDot.hidden = !live;
  ui.readoutHint.textContent = live
    ? 'Approximate announcements. Real screen readers vary, so try NVDA or VoiceOver too.'
    : 'Switch to Screen reader view to see announcements here.';
}

function renderEnterButton() {
  ui.enterPage.replaceChildren(
    ...(state.reproduced ? [icon('check', 18), 'Reproduced · Move focus into the page'] : ['Move focus into the page', icon('arrow', 18)]),
  );
}

ui.enterPage.addEventListener('click', () => {
  const first = ui.frame.contentDocument?.querySelector<HTMLElement>(FOCUSABLE);
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
  const warn = a.unnamed || a.hidden;
  if (warn) sound.barrier();
  else sound.focus();
  state.readout.unshift({ text: a.text, kind: a.kind, warn, time: Date.now() });
  state.readout.length = Math.min(state.readout.length, 20);
  renderReadout();

  if (ui.speechToggle.checked && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(a.text);
    u.rate = Number(ui.speechRate.value);
    speechSynthesis.speak(u);
  }
}

function renderReadout() {
  const now = Date.now();
  ui.readoutLog.replaceChildren(
    ...state.readout.map((entry, i) => {
      const ago = i === 0 ? 'Now' : `${Math.max(1, Math.round((now - entry.time) / 1000))}s ago`;
      const cls = ['announcement', i === 0 ? 'newest' : '', entry.warn ? 'warning' : ''].filter(Boolean).join(' ');
      return h(
        'li',
        { class: cls },
        h('span', { class: 'timestamp' }, ago),
        entry.warn ? h('strong', {}, icon('x', 14), entry.text, ' ', h('em', {}, '[no accessible name]')) : h('strong', {}, entry.text),
        h('span', {}, entry.kind, entry.warn && ' · ', entry.warn && h('b', {}, 'Warning')),
      );
    }),
  );
}

// ---------- Issue card ----------

function usesIcon(uses: string): IconName {
  if (/screen reader/i.test(uses)) return 'volume';
  if (/pointer|touch|mouse/i.test(uses)) return 'pointer';
  return 'keyboard';
}

function renderIssue() {
  const l = level();
  const initials = l.issue.reporter.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .replace(/[^A-Z]/gi, '')
    .slice(0, 2);
  ui.issue.replaceChildren(
    h(
      'div',
      { class: 'issue-meta' },
      state.merged ? h('span', { class: 'status closed' }, icon('check', 12), 'Closed') : h('span', { class: 'status open' }, h('span', {}), 'Open'),
      h('span', {}, `Issue #${l.issue.number}`),
    ),
    h('h2', { id: 'issue-heading' }, l.issue.title),
    h(
      'div',
      { class: 'reporter' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials),
      h('div', {}, h('strong', {}, l.issue.reporter.name), h('span', {}, 'Community member')),
    ),
    h('div', { class: 'uses' }, icon(usesIcon(l.issue.reporter.uses), 16), h('span', {}, 'Uses: ', h('strong', {}, l.issue.reporter.uses))),
    h('blockquote', {}, ...l.issue.body.map((p) => h('p', {}, p))),
    h('ul', { class: 'labels', 'aria-label': 'Labels' }, h('li', {}, 'accessibility'), ...l.wcag.map((w) => h('li', {}, `WCAG ${w.id}`))),
    h(
      'section',
      { class: state.reproduced ? 'task-callout task-callout--done' : 'task-callout', 'aria-label': 'Your task' },
      h('p', { class: 'overline' }, state.reproduced ? 'Reproduced' : 'Your task'),
      h('p', {}, state.reproduced ? l.task.afterReproduce : l.task.instruction),
    ),
    h('div', { class: 'learn-links' }, h('h3', {}, 'Learn more'), ...l.wcag.map((w) => external(w.url, `${w.id} ${w.name}`))),
  );
  renderPlayGuide();
}

function renderPlayGuide() {
  const current = state.merged ? 3 : state.reproduced ? 1 : 0;
  const steps = [
    ['Try the page', 'Find the problem'],
    ['Choose a fix', 'Pick the best code'],
    ['Finish', 'Pass checks and merge'],
  ];
  ui.playGuide.replaceChildren(
    h('p', {}, h('span', {}, `Level ${state.index + 1}`), h('strong', {}, level().title)),
    h(
      'ol',
      {},
      ...steps.map(([title, text], i) => {
        const done = i < current;
        return h(
          'li',
          { class: done ? 'done' : i === current ? 'current' : '', 'aria-current': i === current ? 'step' : false },
          h('span', { 'aria-hidden': 'true' }, done ? icon('check', 16) : String(i + 1)),
          h('div', {}, h('b', {}, title), h('small', {}, text), done && h('span', { class: 'sr-only' }, ' (done)')),
        );
      }),
    ),
  );
}

function renderLevelList() {
  renderProgress();
  ui.levelList.replaceChildren(
    ...levels.map((l, i) => {
      const fixed = completed.has(l.id);
      const current = i === state.index;
      const btn = h(
        'button',
        { type: 'button', class: current ? 'current' : fixed ? 'fixed' : '', 'aria-current': current ? 'step' : false },
        h('span', { class: 'sr-only' }, 'Level '),
        h('span', { class: 'level-key' }, fixed && !current ? [icon('check', 16), h('span', { class: 'sr-only' }, String(i + 1))] : String(i + 1)),
        h('span', { class: 'level-title' }, l.title),
        fixed && h('span', { class: 'sr-only' }, ', fixed'),
      );
      btn.addEventListener('click', () => {
        loadLevel(i);
        focusIssue();
      });
      return h('li', {}, btn, i < levels.length - 1 && h('span', { class: 'step-line', 'aria-hidden': 'true' }));
    }),
  );
}

function focusIssue() {
  const heading = $('issue-heading');
  heading.setAttribute('tabindex', '-1');
  // Bring the level stepper and issue card to the top, not wherever the previous level left the scroll.
  ui.levelsNav.scrollIntoView({ block: 'start' });
  heading.focus({ preventScroll: true });
}

// ---------- Pull request panel ----------

// Re-rendering replaces nodes, so restore keyboard focus to the equivalent control.
function renderPR(focusKey?: string) {
  const active = document.activeElement as HTMLElement | null;
  const key = focusKey ?? (ui.pr.contains(active) ? active?.dataset.key ?? active?.id : undefined);
  ui.pr.replaceChildren(...buildPR());
  if (key) ui.pr.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"], #${CSS.escape(key)}`)?.focus();
}

function prHeading(l: Level): HTMLElement {
  return h(
    'div',
    { class: 'pr-heading' },
    h(
      'div',
      {},
      h('p', { class: 'pr-kicker' }, icon('pr', 16), 'Pull request ', h('span', {}, `#${l.issue.number + 100}`)),
      h('h2', { id: 'pr-heading', tabindex: '-1', 'data-key': 'pr-heading' }, `Fix #${l.issue.number}: ${l.issue.title}`),
    ),
    h(
      'p',
      { class: 'branches' },
      h('code', {}, `fix/issue-${l.issue.number}`),
      icon('arrow', 16),
      h('span', { class: 'sr-only' }, 'into'),
      h('code', {}, 'main'),
    ),
  );
}

function buildPR(): Node[] {
  const l = level();

  if (state.merged) {
    const last = state.index + 1 >= levels.length;
    const next = h('button', { type: 'button', class: 'button button--primary button--big next-button' }, last ? 'See your results' : 'Next issue', icon('arrow', 18));
    next.addEventListener('click', () => {
      if (last) {
        showScreen('ending');
        return;
      }
      loadLevel(state.index + 1);
      focusIssue();
    });
    return [
      h(
        'div',
        { class: 'merged-panel' },
        h('p', { class: 'merged-badge' }, icon('merge', 16), 'Merged'),
        h('p', { class: 'overline' }, `Pull request #${l.issue.number + 100}`),
        h('h2', { id: 'pr-heading', tabindex: '-1', 'data-key': 'pr-heading' }, l.merged.headline ?? `Fix #${l.issue.number} merged.`),
        h('figure', { class: 'merged-quote' }, h('blockquote', {}, h('p', {}, `“${l.merged.reply}”`)), h('figcaption', {}, h('cite', {}, `— ${l.issue.reporter.name}`))),
        h(
          'div',
          { class: 'merged-learning' },
          h('div', {}, h('h3', { class: 'overline' }, 'What you learned'), h('ul', {}, ...l.merged.learn.map((x) => h('li', {}, x)))),
          h('span', { class: 'wcag-badge' }, `WCAG ${l.wcag.map((w) => w.id).join(' · ')}`),
        ),
        next,
      ),
    ];
  }

  if (!state.reproduced) {
    const skip = h('button', { type: 'button', class: 'button button--secondary' }, 'Skip reproducing and go to the fix');
    skip.addEventListener('click', () => onGoalReached());
    return [
      prHeading(l),
      h(
        'div',
        { class: 'pr-locked' },
        h(
          'div',
          {},
          h('span', { class: 'locked-icon', 'aria-hidden': 'true' }, icon('eye', 24)),
          h('p', { class: 'overline' }, 'First: reproduce'),
          h('h3', {}, 'Reproduce the issue first…'),
          h('p', {}, 'Use the Commons page the way the reporter does. Reproducing the report helps you verify the fix.'),
          skip,
        ),
        h('div', { class: 'locked-checks' }, renderChecks('Current checks')),
      ),
    ];
  }

  const allCorrect = l.fixes.every((g) => g.options.find((o) => o.id === state.applied[g.id])?.correct);
  const allPass = state.checks.length > 0 && state.checks.every((c) => c.passed);
  const ready = allCorrect && allPass;
  const merge = h(
    'button',
    { type: 'button', class: ready ? 'button button--success merge-button' : 'button merge-button', 'aria-disabled': String(!ready), 'data-key': 'merge' },
    icon('merge', 18),
    'Merge pull request',
  );
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

  const lastGroup = l.fixes.find((g) => g.id === state.lastApplied);
  const lastOption = lastGroup?.options.find((o) => o.id === state.applied[lastGroup.id]);

  return [
    prHeading(l),
    h(
      'div',
      { class: 'pr-body' },
      h('div', { class: 'suggestions' }, h('h3', { class: 'overline', tabindex: '-1', 'data-key': 'suggestions' }, 'Suggested changes'), ...l.fixes.map(renderFixGroup)),
      h(
        'div',
        { class: 'checks-column' },
        lastOption &&
          h(
            'div',
            { class: lastOption.correct ? 'review-box review-box--good' : 'review-box' },
            h('span', { class: 'avatar avatar--small', 'aria-hidden': 'true' }, 'RV'),
            h('div', {}, h('strong', {}, lastOption.correct ? 'Reviewer: looks good' : 'Reviewer note'), h('p', {}, lastOption.feedback)),
          ),
        renderChecks(),
        merge,
      ),
    ),
  ];
}

function renderFixGroup(group: FixGroup): HTMLElement {
  const name = `fix-${group.id}`;
  const appliedId = state.applied[group.id];

  const options = group.options.map((o) => {
    const id = `${name}-${o.id}`;
    const radio = h('input', { type: 'radio', name, id, value: o.id, checked: state.selected[group.id] === o.id }) as HTMLInputElement;
    radio.addEventListener('change', () => (state.selected[group.id] = o.id));
    return h(
      'div',
      { class: 'option-card' },
      h(
        'div',
        { class: 'option-top' },
        radio,
        h('label', { for: id }, o.label),
        appliedId === o.id ? h('span', { class: 'pill-applied' }, icon('check', 10), 'Applied') : h('span', { class: 'pill-selected', 'aria-hidden': 'true' }, icon('check', 10), 'Selected'),
      ),
      renderDiff(group.find, o.replace),
    );
  });

  const apply = h('button', { type: 'button', class: 'button button--primary apply-button', 'data-key': `apply-${group.id}` }, icon('code', 16), 'Apply suggestion');
  apply.addEventListener('click', () => {
    const chosen = state.selected[group.id];
    if (!chosen) {
      announce('Choose a suggestion first.');
      return;
    }
    state.applied[group.id] = chosen;
    state.lastApplied = group.id;
    state.checkSoundPending = true;
    const option = group.options.find((o) => o.id === chosen)!;
    renderFrame();
    announce(`Applied. Running checks. ${option.feedback}`);
  });

  return h(
    'fieldset',
    { class: 'fix-group' },
    h('legend', {}, h('span', {}, group.title), h('small', {}, 'Choose the best fix')),
    h('div', { class: 'option-grid' }, ...options),
    apply,
  );
}

function renderDiff(removed: string, added: string): HTMLElement {
  const line = (cls: 'removed' | 'added', prefix: string, label: string, text: string) =>
    h('span', { class: cls }, h('span', { class: 'sr-only' }, label), h('span', { 'aria-hidden': 'true' }, prefix), text);
  return h(
    'code',
    { class: 'diff' },
    ...removed.split('\n').map((t) => line('removed', '− ', 'Remove: ', t.trim())),
    ...added.split('\n').map((t) => line('added', '+ ', 'Add: ', t.trim())),
  );
}

function renderChecks(title?: string): HTMLElement {
  if (!state.checks.length) return h('p', { class: 'console-hint' }, 'Running checks…');
  const passed = state.checks.filter((c) => c.passed).length;
  const failing = state.checks.length - passed;
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'checks-head' },
      h('h3', {}, title ?? `Checks: ${passed} of ${state.checks.length} passing`),
      h('span', {}, failing ? `${failing} need${failing === 1 ? 's' : ''} attention` : 'All clear'),
    ),
    h(
      'ul',
      { class: 'checks-list' },
      ...state.checks.map((c) =>
        h(
          'li',
          { class: c.passed ? 'check-row passed' : 'check-row failed' },
          h('span', { class: 'check-icon', 'aria-hidden': 'true' }, icon(c.passed ? 'check' : 'x', 15)),
          h('div', {}, h('strong', {}, `${c.passed ? 'Passed' : 'Failed'}: ${c.label}`), h('span', {}, c.detail)),
        ),
      ),
    ),
  );
}

// ---------- Screens ----------

type Screen = 'title' | 'game' | 'ending';

function showScreen(screen: Screen, moveFocus = true) {
  ui.titleScreen.hidden = screen !== 'title';
  ui.game.hidden = screen !== 'game';
  ui.levelsNav.hidden = screen !== 'game';
  ui.ending.hidden = screen !== 'ending';
  ui.homeBtn.hidden = screen === 'title';
  document.body.dataset.screen = screen;
  if (screen === 'title') renderTitle();
  if (screen === 'ending') {
    renderEnding();
    sound.merge();
  }
  const target = { title: 'title-heading', game: 'issue-heading', ending: 'ending-heading' }[screen];
  ui.skipLink.href = `#${screen === 'game' ? 'level-heading' : target}`;
  window.scrollTo(0, 0);
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
  const start = h('button', { type: 'button', class: 'button button--primary button--big' }, resume ? `Continue: Level ${next + 1}` : 'Start playing', icon('arrow', 18));
  start.addEventListener('click', () => play(resume ? next : 0));
  const actions: HTMLElement[] = [start];
  if (completed.size > 0) {
    const restart = h('button', { type: 'button', class: 'button button--secondary button--big' }, 'Start from level 1');
    restart.addEventListener('click', () => play(0));
    actions.push(restart);
  }
  if (next === -1) {
    const results = h('button', { type: 'button', class: 'button button--ghost button--big' }, 'See your results');
    results.addEventListener('click', () => showScreen('ending'));
    actions.push(results);
  }

  const step = (n: string, iconName: IconName, title: string, text: string) =>
    h(
      'li',
      { class: 'step-card' },
      h('span', { class: 'step-key', 'aria-hidden': 'true' }, n),
      h('span', { class: 'step-icon', 'aria-hidden': 'true' }, icon(iconName, 22)),
      h('h3', {}, title),
      h('p', {}, text),
    );

  ui.titleScreen.replaceChildren(
    h(
      'div',
      { class: 'hero-card' },
      h(
        'div',
        { class: 'hero-copy' },
        h('p', { class: 'eyebrow' }, h('span', {}, 'GitHub Game Off 2026'), h('span', {}, 'Theme: SHIFT')),
        h(
          'div',
          { class: 'logo logo--xl', 'aria-hidden': 'true' },
          h('span', { class: 'keycap' }, '⇧ Shift'),
          h('span', { class: 'logo-plus' }, '+'),
          h('span', { class: 'keycap' }, 'Tab'),
        ),
        h('h1', { id: 'title-heading' }, 'Friday Community Night is coming. ', h('span', {}, "The website isn't ready.")),
        h(
          'p',
          { class: 'hero-lede' },
          `${levels.length} community members found barriers that stop them from signing up, registering, RSVPing, or donating. You're a first-time contributor: reproduce each issue, make a focused fix, and ship a more accessible Commons website.`,
        ),
        h('div', { class: 'hero-actions' }, ...actions),
      ),
      h(
        'div',
        { class: 'hero-illustration', 'aria-hidden': 'true' },
        h('span', { class: 'browser-mini' }, h('i'), h('i'), h('i'), h('b', {}, 'Friday', h('br'), 'Community', h('br'), 'Night')),
        h('span', { class: 'floating-key key-tab' }, 'Tab'),
        h('span', { class: 'floating-key key-enter' }, 'Enter ↵'),
        h('span', { class: 'focus-ring-demo' }),
      ),
    ),
    h(
      'section',
      { class: 'how-section how-section--revised', 'aria-labelledby': 'how-heading' },
      h(
        'div',
        { class: 'section-heading' },
        h('div', {}, h('p', { class: 'overline' }, 'How it works'), h('h2', { id: 'how-heading' }, 'One issue. Three clear steps.')),
        h('span', { class: 'time-note' }, 'About 20 minutes'),
      ),
      h(
        'ol',
        { class: 'steps' },
        step('1', 'eye', 'Reproduce', 'Use the same input or assistive technology as the person who reported the issue.'),
        step('2', 'code', 'Fix', "Compare suggested changes and choose the one that removes the barrier. Some pass the automated checks and still don't help."),
        step('3', 'merge', 'Merge', 'Pass the checks, merge the pull request, and hear back from the reporter.'),
      ),
    ),
    h(
      'aside',
      { class: 'game-note', 'aria-label': 'About this game' },
      icon('tab', 22),
      h('p', {}, h('strong', {}, 'Play your way. '), 'Playable with a keyboard, a screen reader, or touch. Progress is saved only in this browser.'),
      h('p', {}, "This game doesn't simulate disability. It teaches how assistive technology works and what developers need to build."),
    ),
  );
}

function renderEnding() {
  const fixed = levels.filter((l) => completed.has(l.id));
  const all = fixed.length === levels.length;
  const criteria = new Map<string, string>();
  for (const l of fixed) for (const w of l.wcag) criteria.set(w.id, w.name);
  const sorted = [...criteria].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  const share = h('button', { type: 'button', class: 'button button--primary button--big' }, 'Share the game');
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
  const replay = h('button', { type: 'button', class: 'button button--secondary button--big' }, 'Play again from level 1');
  replay.addEventListener('click', () => play(0));
  const toTitle = h('button', { type: 'button', class: 'button button--ghost button--big' }, 'Title screen');
  toTitle.addEventListener('click', () => showScreen('title'));

  const card = (iconName: IconName, kicker: string, title: string, href: string, linkText: string, featured = false) =>
    h(
      'li',
      {},
      h(
        'a',
        { class: featured ? 'next-step-card featured' : 'next-step-card', href, target: '_blank', rel: 'noopener' },
        h('span', { 'aria-hidden': 'true' }, icon(iconName, 20)),
        h('small', {}, kicker),
        h('strong', {}, title),
        h('b', {}, linkText, icon('external', 14), h('span', { class: 'sr-only' }, '(opens in a new tab)')),
      ),
    );

  const unfixed = levels
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !completed.has(l.id))
    .map(({ l, i }) => {
      const btn = h('button', { type: 'button' }, h('span', { 'aria-hidden': 'true' }, String(i + 1)), h('strong', {}, `Level ${i + 1}: ${l.title}`), icon('arrow', 16));
      btn.addEventListener('click', () => play(i));
      return h('li', {}, btn);
    });

  ui.ending.replaceChildren(
    ...nodes([
      h('p', { class: all ? 'ending-pill complete' : 'ending-pill partial' }, icon('merge', 16), all ? 'All issues closed' : `${fixed.length} of ${levels.length} issues closed`),
      h('h1', { id: 'ending-heading' }, all ? 'Friday Community Night is ready.' : `You fixed ${fixed.length} of ${levels.length} issues.`),
      h(
        'p',
        { class: 'ending-lead' },
        all ? 'Everyone can now sign up, register, RSVP, and donate with the tools and input methods that work for them.' : 'Some issues are still open. Pick up where you left off any time.',
      ),
      unfixed.length > 0 && h('section', { class: 'still-open', 'aria-labelledby': 'open-heading' }, h('h2', { id: 'open-heading' }, 'Still open'), h('ul', {}, ...unfixed)),
      sorted.length > 0 &&
        h(
          'section',
          { class: 'criteria-card', 'aria-labelledby': 'learned-heading' },
          h('p', { class: 'overline' }, 'WCAG 2.2 success criteria you practiced'),
          h('h2', { id: 'learned-heading' }, 'Tools for the next site you work on'),
          h(
            'ul',
            { class: 'criteria-list criteria-list--named' },
            ...sorted.map(([id, name]) => h('li', { class: 'criteria-key' }, h('small', {}, 'WCAG'), id, h('b', {}, name))),
          ),
        ),
      h(
        'section',
        { class: 'keep-going', 'aria-labelledby': 'next-heading' },
        h('p', { class: 'overline' }, 'Keep going'),
        h('h2', { id: 'next-heading' }, 'Take the next step'),
        h(
          'ul',
          { class: 'keep-grid' },
          card('heart', 'Use what you learned', 'Fix a real accessibility issue', 'https://forgoodfirstissue.github.com/', 'For Good First Issue', true),
          card('volume', 'Hear the web differently', 'Try a real screen reader', 'https://www.nvaccess.org/download/', 'Download NVDA'),
          card('github', 'Shift+Tab is open source', 'Add a level', 'https://github.com/izzygld/shift-tab/blob/main/CONTRIBUTING.md', 'Contributing guide'),
          card('code', 'Go deeper', 'Learn the guidelines', 'https://www.w3.org/WAI/fundamentals/', 'WAI fundamentals'),
        ),
      ),
      h('div', { class: 'ending-buttons' }, share, replay, toTitle),
    ]),
  );
}

renderSoundToggle();
applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
loadLevel(0);
showScreen('title', false);
