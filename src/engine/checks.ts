import type { AxeResults } from 'axe-core';
import type { Level } from '../types';

export interface CheckResult {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

type AxeWindow = Window & { axe?: { run: (ctx: Document, opts: object) => Promise<AxeResults> } };

const AXE_LABELS: Record<string, string> = {
  'image-alt': 'Images have text alternatives (WCAG 1.1.1)',
  'button-name': 'Buttons have accessible names (WCAG 4.1.2)',
  'link-name': 'Links have accessible names (WCAG 2.4.4, 4.1.2)',
  'aria-hidden-focus': 'Hidden elements are not focusable (WCAG 4.1.2)',
  'color-contrast': 'Text has enough color contrast (WCAG 1.4.3)',
  'aria-dialog-name': 'Pop-ups have accessible names (WCAG 4.1.2)',
  label: 'Form fields have labels (WCAG 1.3.1, 4.1.2)',
};

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

export async function runChecks(frame: HTMLIFrameElement, level: Level): Promise<CheckResult[]> {
  const doc = frame.contentDocument;
  const win = frame.contentWindow as AxeWindow | null;
  if (!doc || !win) return [];

  const results: CheckResult[] = [];
  // Some checks move focus inside the page; hand it back so the player isn't pulled into the iframe.
  const previousFocus = document.activeElement as HTMLElement | null;

  if (level.checks.axe.length) {
    if (!win.axe) {
      const { default: axeSource } = await import('axe-core/axe.min.js?raw');
      const script = doc.createElement('script');
      script.textContent = axeSource;
      doc.head.appendChild(script);
    }
    const axe = await win.axe!.run(doc, { runOnly: { type: 'rule', values: level.checks.axe } });
    for (const rule of level.checks.axe) {
      const violation = axe.violations.find((v) => v.id === rule);
      results.push({
        id: rule,
        label: AXE_LABELS[rule] ?? rule,
        passed: !violation,
        detail: violation ? `${violation.help} (${violation.nodes.length} element${violation.nodes.length === 1 ? '' : 's'})` : 'No problems found.',
      });
    }
  }

  for (const id of level.checks.custom) {
    const check = CUSTOM_CHECKS[id];
    if (check) results.push(check(doc));
  }

  if (previousFocus && previousFocus !== frame) previousFocus.focus();
  return results;
}

const pass = (id: string, label: string, detail: string): CheckResult => ({ id, label, passed: true, detail });
const fail = (id: string, label: string, detail: string): CheckResult => ({ id, label, passed: false, detail });

function describeNode(el: Element): string {
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
  return `<${el.tagName.toLowerCase()}> "${text}"`;
}

const CUSTOM_CHECKS: Record<string, (doc: Document) => CheckResult> = {
  'focus-indicator': (doc) => {
    const label = 'Keyboard focus is visible with 3:1 contrast (WCAG 2.4.7, 1.4.11)';
    let removed = false;
    let restored: { color: string; width: number } | null = null;

    for (const sheet of Array.from(doc.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (!('selectorText' in rule) || !(rule as CSSStyleRule).selectorText.includes(':focus')) continue;
        const style = (rule as CSSStyleRule).style;
        const width = parseFloat(style.outlineWidth);
        if (style.outlineStyle === 'none' || width === 0) removed = true;
        else if (style.outlineStyle) restored = { color: style.outlineColor, width: Number.isNaN(width) ? 3 : width };
      }
    }

    if (!restored) {
      return removed
        ? { id: 'focus-indicator', label, passed: false, detail: 'A :focus rule removes the outline and nothing replaces it.' }
        : { id: 'focus-indicator', label, passed: true, detail: 'Browser default focus indicator is in place.' };
    }

    const bg = doc.defaultView?.getComputedStyle(doc.body).backgroundColor ?? 'rgb(255, 255, 255)';
    const ratio = contrast(restored.color, bg);
    if (restored.width < 2 || ratio < 3) {
      return {
        id: 'focus-indicator',
        label,
        passed: false,
        detail: `Focus outline is ${restored.width}px with ${ratio.toFixed(1)}:1 contrast. It needs at least 2px and 3:1.`,
      };
    }
    return { id: 'focus-indicator', label, passed: true, detail: `Focus outline is ${restored.width}px with ${ratio.toFixed(1)}:1 contrast.` };
  },

  'native-controls': (doc) => {
    const id = 'native-controls';
    const label = 'Clickable things are real buttons or links (WCAG 2.1.1, 4.1.2)';
    const bad = Array.from(doc.querySelectorAll('[onclick]')).filter((el) => !el.matches('button, a[href], input, select, textarea, summary'));
    if (!bad.length) return pass(id, label, 'Every clickable element is a native control that works with a keyboard.');
    return fail(id, label, `${bad.length} clickable element${bad.length === 1 ? '' : 's'} won't work fully with a keyboard: ${bad.map(describeNode).join(', ')}.`);
  },

  'modal-escape': (doc) => {
    const id = 'modal-escape';
    const label = 'Pop-up can be closed from the keyboard (WCAG 2.1.2)';
    const modal = doc.querySelector<HTMLElement>('[role="dialog"]');
    const win = doc.defaultView as (Window & typeof globalThis & { openModal?: () => void }) | null;
    if (!modal || modal.hidden || !win) return pass(id, label, 'No open pop-up.');
    const target = modal.querySelector<HTMLElement>(FOCUSABLE) ?? modal;
    target.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const closed = modal.hidden;
    win.openModal?.();
    return closed ? pass(id, label, 'Escape closes the pop-up.') : fail(id, label, 'Escape does nothing, and Tab keeps focus inside the pop-up. There is no way out.');
  },
};

function parseColor(value: string): [number, number, number] {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = value.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
  return [rgb[0], rgb[1], rgb[2]];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(parseColor(a)), luminance(parseColor(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
