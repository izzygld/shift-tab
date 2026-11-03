import { computeAccessibleDescription, computeAccessibleName, getRole } from 'dom-accessibility-api';

export interface Announcement {
  text: string;
  kind: string;
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
  const opts = win ? { getComputedStyle: win.getComputedStyle.bind(win) } : {};
  const name = computeAccessibleName(el, opts).trim();
  const role = getRole(el) ?? el.tagName.toLowerCase();
  const hidden = el.closest('[aria-hidden="true"]') !== null;
  const label = ROLE_LABELS[role] ?? role;
  const kind = label.charAt(0).toUpperCase() + label.slice(1);

  if (hidden) {
    return { text: '(nothing announced: this element is hidden from assistive technology but still focusable)', kind, unnamed: false, hidden };
  }

  const parts = [name, label];
  if (role === 'heading') parts.push(`level ${el.getAttribute('aria-level') ?? el.tagName.slice(1)}`);
  const expanded = el.getAttribute('aria-expanded');
  if (expanded) parts.push(expanded === 'true' ? 'expanded' : 'collapsed');
  const pressed = el.getAttribute('aria-pressed');
  if (pressed) parts.push(pressed === 'true' ? 'pressed' : 'not pressed');
  if (role === 'checkbox' || role === 'radio') parts.push((el as HTMLInputElement).checked ? 'checked' : 'not checked');
  if (role === 'slider') parts.push(el.getAttribute('aria-valuetext') ?? (el as HTMLInputElement).value ?? el.getAttribute('aria-valuenow') ?? '');
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') parts.push('unavailable');
  if (el.getAttribute('aria-invalid') === 'true') parts.push('invalid entry');
  const description = computeAccessibleDescription(el, opts).trim();
  if (description) parts.push(description);

  return { text: parts.filter(Boolean).join(', '), kind, unnamed: !name && NEEDS_NAME.has(role), hidden };
}
