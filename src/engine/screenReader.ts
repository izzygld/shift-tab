import { computeAccessibleName, getRole } from 'dom-accessibility-api';

export interface Announcement {
  text: string;
  unnamed: boolean;
  hidden: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  img: 'image',
  textbox: 'edit text',
  combobox: 'combo box',
  checkbox: 'check box',
  radio: 'radio button',
  navigation: 'navigation landmark',
  main: 'main landmark',
};

const NEEDS_NAME = new Set(['link', 'button', 'img', 'textbox', 'combobox', 'checkbox', 'radio']);

// Approximates what a screen reader announces on focus. Real screen readers differ; this is a teaching aid.
export function describeElement(el: Element): Announcement {
  const win = el.ownerDocument.defaultView;
  const name = computeAccessibleName(el, win ? { getComputedStyle: win.getComputedStyle.bind(win) } : {}).trim();
  const role = getRole(el) ?? el.tagName.toLowerCase();
  const hidden = el.closest('[aria-hidden="true"]') !== null;

  if (hidden) {
    return { text: '(nothing announced: this element is hidden from assistive technology but still focusable)', unnamed: false, hidden };
  }

  const parts = [name, ROLE_LABELS[role] ?? role];
  if (role === 'heading') parts.push(`level ${el.getAttribute('aria-level') ?? el.tagName.slice(1)}`);
  const expanded = el.getAttribute('aria-expanded');
  if (expanded) parts.push(expanded === 'true' ? 'expanded' : 'collapsed');
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') parts.push('unavailable');

  return { text: parts.filter(Boolean).join(', '), unnamed: !name && NEEDS_NAME.has(role), hidden };
}
