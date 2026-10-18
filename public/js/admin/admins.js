// Admins tab: list / add / remove admin emails through admin-only RPCs.
// The database refuses to remove yourself or the last admin; the UI mirrors
// that by disabling the button, but the server is what enforces it.

import { $, h, formatDateTime } from './dom.js';
import { client, run } from './api.js';
import { toast, confirmDialog, stateBlock, setBusy } from './ui.js';
import { isEmail } from './validators.js';

export function initAdmins() {
  const list = $('#adminsList');
  const stateBox = $('#adminsState');
  const form = $('#adminAddForm');
  const emailInput = $('#adminEmail');
  const errorBox = $('#adminEmailError');
  const note = $('#adminAddNote');
  const defaultNote = note.textContent;

  const setError = (message) => {
    errorBox.textContent = message || '';
    errorBox.hidden = !message;
    if (message) emailInput.setAttribute('aria-invalid', 'true'); else emailInput.removeAttribute('aria-invalid');
  };

  function render(admins) {
    list.replaceChildren(...admins.map((admin) => {
      const onlyOne = admins.length === 1;
      const blocked = admin.is_me || onlyOne;
      const why = admin.is_me ? 'You cannot remove your own access.' : 'The last admin cannot be removed.';
      return h('li', { class: 'admin-item dashboard-card' },
        h('div', { class: 'admin-main' },
          h('strong', {}, admin.email),
          admin.is_me ? h('span', { class: 'badge' }, 'You') : null,
          h('span', { class: 'hint' }, admin.added_at
            ? `Added ${formatDateTime(admin.added_at)}${admin.added_by ? ` by ${admin.added_by}` : ''}`
            : 'Original admin')),
        h('button', {
          class: 'btn btn-outline btn-sm btn-danger-outline', type: 'button',
          disabled: blocked, title: blocked ? why : undefined,
          'aria-label': blocked ? `Remove ${admin.email} (unavailable: ${why})` : `Remove ${admin.email}`,
          onclick: () => remove(admin),
        }, 'Remove'));
    }));
  }

  async function load() {
    stateBox.replaceChildren(stateBlock({ kind: 'loading', title: 'Loading admins…' }));
    try {
      render((await run(() => client.rpc('admin_list_admins'))) || []);
      stateBox.replaceChildren();
    } catch (error) {
      console.error('Admin list failed', error);
      list.replaceChildren();
      stateBox.replaceChildren(stateBlock({
        kind: 'error', title: 'Could not load admins', message: error.message,
        action: { label: 'Try again', onClick: load },
      }));
    }
  }

  async function remove(admin) {
    const ok = await confirmDialog({
      title: `Remove ${admin.email}?`,
      message: 'They will immediately lose access to this dashboard and all admin-only data. They can be added again later.',
      confirmLabel: 'Remove admin', danger: true,
    });
    if (!ok) return;
    try {
      await run(() => client.rpc('admin_remove_admin', { p_email: admin.email }));
      toast(`${admin.email} is no longer an admin.`, { kind: 'success' });
    } catch (error) {
      toast(`Could not remove the admin. ${error.message}`, { kind: 'error' });
    }
    await load();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!isEmail(email)) { setError('Enter a valid email address.'); emailInput.focus(); return; }
    setError('');
    const button = $('#adminAddBtn');
    setBusy(button, true, 'Adding…');
    try {
      const rows = await run(() => client.rpc('admin_add_admin', { p_email: email }));
      const result = rows?.[0];
      emailInput.value = '';
      if (result?.already_admin) {
        toast(`${email} is already an admin.`, { kind: 'info' });
        note.textContent = defaultNote;
      } else {
        toast(`${email} is now an admin.`, { kind: 'success' });
        note.textContent = result?.has_account === false
          ? `${email} has not signed up yet. Until they do, anyone who registers that address would become an admin, so ask them to sign in soon, and remove the entry if it was a mistake.`
          : defaultNote;
      }
    } catch (error) {
      setError(error.message);
      emailInput.focus();
    } finally {
      setBusy(button, false);
    }
    await load();
  });

  return { load };
}
