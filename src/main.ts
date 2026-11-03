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

  state.checks = await runChecks(ui.frame, level());
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
  const labels: Record<Mode, string> = { keyboard: 'Keyboard only', 'screen-reader': 'Screen reader view' };
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
  ui.modeHint.textContent = keyboard
    ? 'Mouse is turned off for the page. Use Tab, Shift+Tab, Enter and Space.'
    : 'Each element you focus is announced in the screen reader view. Turn on speech to hear it.';
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
    const next = h('button', { type: 'button', class: 'primary' }, state.index + 1 < levels.length ? 'Next issue →' : 'Back to level 1');
    next.addEventListener('click', () => {
      loadLevel((state.index + 1) % levels.length);
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

renderSoundToggle();
loadLevel(0);
