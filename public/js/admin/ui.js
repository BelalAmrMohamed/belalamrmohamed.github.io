// Toasts, confirm dialogs and the unsaved-changes guard.

import { h, $ } from './dom.js';

// ---- toasts -------------------------------------------------------------------
export function toast(message, { kind = 'info', timeout, action } = {}) {
  const host = $('#toasts');
  if (!host) return;
  const ms = timeout ?? (kind === 'error' ? 9000 : action ? 8000 : 4500);

  const close = h('button', { class: 'toast-close', type: 'button', 'aria-label': 'Dismiss notification' }, '×');
  const node = h('div', { class: 'toast', dataset: { kind }, role: kind === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast-icon', 'aria-hidden': 'true' }, kind === 'success' ? '✓' : kind === 'error' ? '!' : 'i'),
    h('span', { class: 'toast-text' }, message),
    action && h('button', {
      class: 'toast-action', type: 'button',
      onclick: () => { dismiss(); action.onClick(); },
    }, action.label),
    close);

  let timer;
  const dismiss = () => { clearTimeout(timer); node.remove(); };
  close.addEventListener('click', dismiss);
  node.addEventListener('mouseenter', () => clearTimeout(timer));
  node.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 2500); });
  host.append(node);
  while (host.children.length > 4) host.firstElementChild.remove();
  timer = setTimeout(dismiss, ms);
  return dismiss;
}

// ---- confirm dialog -------------------------------------------------------------
/**
 * Promise-based replacement for window.confirm(), built on <dialog> so it
 * traps focus, closes on Escape and restores focus to the opener.
 * `details` is an optional list of short strings shown under the message.
 */
export function confirmDialog({ title, message, details = [], confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const cancel = h('button', { class: 'btn btn-outline', type: 'button', value: 'cancel' }, cancelLabel);
    const confirm = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-default'}`, type: 'button', value: 'ok' }, confirmLabel);
    const dialog = h('dialog', { class: 'modal', 'aria-labelledby': 'dlgTitle', 'aria-describedby': 'dlgMsg' },
      h('div', { class: 'modal-body' },
        h('h2', { id: 'dlgTitle' }, title),
        h('p', { id: 'dlgMsg' }, message),
        details.length ? h('ul', { class: 'modal-details' }, details.map((line) => h('li', {}, line))) : null),
      h('div', { class: 'modal-actions' }, cancel, confirm));

    let result = false;
    confirm.addEventListener('click', () => { result = true; dialog.close(); });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (opener?.isConnected && typeof opener.focus === 'function') opener.focus();
      resolve(result);
    });
    document.body.append(dialog);
    dialog.showModal();
    // Destructive actions start on Cancel so Enter cannot delete by accident.
    (danger ? cancel : confirm).focus();
  });
}

// ---- unsaved-changes guard --------------------------------------------------------
const dirtyChecks = new Map();

export function registerDirty(name, isDirty) {
  dirtyChecks.set(name, isDirty);
}

export function anyDirty(except) {
  return [...dirtyChecks].some(([name, check]) => name !== except && check());
}

/** Resolves true when it is OK to navigate away (nothing dirty, or user agreed). */
export async function confirmDiscard(names) {
  const dirty = [...dirtyChecks].filter(([name, check]) => (!names || names.includes(name)) && check());
  if (!dirty.length) return true;
  return confirmDialog({
    title: 'Discard unsaved changes?',
    message: 'You have changes that have not been saved. If you leave now they will be lost.',
    confirmLabel: 'Discard changes',
    cancelLabel: 'Keep editing',
    danger: true,
  });
}

window.addEventListener('beforeunload', (event) => {
  if (anyDirty()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

// ---- small shared view helpers ----------------------------------------------------------
export function stateBlock({ kind, title, message, action }) {
  return h('div', { class: `state state-${kind}`, role: kind === 'error' ? 'alert' : undefined },
    kind === 'loading' ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : null,
    title ? h('strong', {}, title) : null,
    message ? h('p', {}, message) : null,
    action ? h('button', { class: 'btn btn-outline', type: 'button', onclick: action.onClick }, action.label) : null);
}

export function skeletonRows(count = 4) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    frag.append(h('li', { class: 'skeleton-row', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')));
  }
  return frag;
}

export function setBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (busyLabel) button.textContent = busyLabel;
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.label) button.textContent = button.dataset.label;
  }
}
