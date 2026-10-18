// Settings tab: built from settings-schema.js so each field is labelled
// Public or Private and validated before it is written to portfolio_settings.

import { $, h } from './dom.js';
import { client, run } from './api.js';
import { toast, registerDirty, stateBlock, setBusy } from './ui.js';
import { SETTING_FIELDS, SETTING_GROUPS, validateSetting } from './settings-schema.js';

const TABLE = 'portfolio_settings';

export function initSettings() {
  const form = $('#settingsForm');
  const stateBox = $('#settingsState');
  let baseline = {}; // key -> stored value
  let loaded = false;
  let saving = false;

  const input = (key) => document.getElementById(`setting-${key}`);
  const errorBox = (key) => document.getElementById(`setting-${key}-error`);
  const current = () => Object.fromEntries(SETTING_FIELDS.map((f) => [f.key, input(f.key)?.value ?? '']));
  const normalized = (values) => Object.fromEntries(SETTING_FIELDS.map((f) => [f.key, String(values[f.key] ?? '').replace(/\r\n/g, '\n').trim()]));
  const isDirty = () => loaded && !saving && JSON.stringify(normalized(current())) !== JSON.stringify(normalized(baseline));
  registerDirty('settings', isDirty);

  function badge(isPublic) {
    return h('span', { class: `badge ${isPublic ? 'badge-public' : 'badge-private'}` },
      isPublic ? 'Public' : 'Private');
  }

  function fieldControl(field) {
    const id = `setting-${field.key}`;
    const describedBy = [field.help ? `${id}-help` : '', `${id}-error`].filter(Boolean).join(' ');
    const common = { id, name: field.key, class: 'input', 'aria-describedby': describedBy, autocomplete: 'off' };
    if (field.type === 'textarea') {
      return h('textarea', { ...common, class: 'input dashboard-textarea', maxlength: field.max + 200, rows: 6 });
    }
    if (field.type === 'select') {
      return h('select', common, Object.entries(field.options).map(([value, label]) => h('option', { value }, label)));
    }
    const type = field.type === 'email' ? 'email' : 'text';
    return h('input', { ...common, type, placeholder: field.placeholder || '', maxlength: (field.max || 300) + 50 });
  }

  function build() {
    form.replaceChildren();
    for (const group of SETTING_GROUPS) {
      const fields = SETTING_FIELDS.filter((f) => f.group === group.id);
      form.append(h('fieldset', { class: `dashboard-card settings-group ${group.isPublic ? 'is-public' : 'is-private'}` },
        h('legend', {}, group.title, ' ', badge(group.isPublic)),
        ...fields.map((field) => {
          const id = `setting-${field.key}`;
          return h('div', { class: 'field' },
            h('div', { class: 'label-row' },
              h('label', { class: 'label', for: id }, field.label, field.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
              field.max ? h('span', { class: 'counter', id: `${id}-count` }) : null),
            fieldControl(field),
            field.help ? h('p', { class: 'hint', id: `${id}-help` }, field.help) : null,
            h('p', { class: 'field-error', id: `${id}-error`, hidden: true }));
        })));
    }
    form.append(h('div', { class: 'dashboard-actions' },
      h('button', { id: 'saveSettingsBtn', class: 'btn btn-default', type: 'submit' }, 'Save settings'),
      h('button', { id: 'resetSettingsBtn', class: 'btn btn-outline', type: 'button', onclick: () => fill(baseline) }, 'Discard changes'),
      h('span', { id: 'settingsDirty', class: 'badge badge-warn', hidden: true }, 'Unsaved changes')));
  }

  function updateCounters() {
    for (const field of SETTING_FIELDS) {
      const counter = document.getElementById(`setting-${field.key}-count`);
      if (!counter) continue;
      const length = (input(field.key).value || '').trim().length;
      counter.textContent = `${length}/${field.max}`;
      counter.dataset.state = length > field.max ? 'over' : length >= field.max * 0.9 ? 'near' : 'ok';
    }
    $('#settingsDirty').hidden = !isDirty();
  }

  function fill(values) {
    for (const field of SETTING_FIELDS) {
      input(field.key).value = values[field.key] ?? '';
      setError(field.key, '');
    }
    updateCounters();
  }

  function setError(key, message) {
    const box = errorBox(key);
    box.textContent = message || '';
    box.hidden = !message;
    if (message) input(key).setAttribute('aria-invalid', 'true'); else input(key).removeAttribute('aria-invalid');
  }

  async function load({ quiet = false } = {}) {
    if (isDirty()) return; // never overwrite what is being typed
    if (!form.children.length) build();
    if (!quiet) {
      stateBox.replaceChildren(stateBlock({ kind: 'loading', title: 'Loading settings…' }));
      form.hidden = true;
    }
    try {
      const rows = await run(() => client.from(TABLE).select('key, value, is_public')
        .in('key', SETTING_FIELDS.map((f) => f.key)));
      baseline = Object.fromEntries((rows || []).map((row) => [row.key, row.value]));
      loaded = true;
      fill(baseline);
      stateBox.replaceChildren();
      form.hidden = false;
    } catch (error) {
      console.error('Settings query failed', error);
      stateBox.replaceChildren(stateBlock({
        kind: 'error', title: 'Could not load settings', message: error.message,
        action: { label: 'Try again', onClick: () => load() },
      }));
    }
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    const raw = current();
    const next = {};
    let firstBad = null;
    for (const field of SETTING_FIELDS) {
      const { error, value } = validateSetting(field, raw[field.key]);
      setError(field.key, error);
      if (error && !firstBad) firstBad = field.key;
      next[field.key] = value;
    }
    if (firstBad) {
      input(firstBad).focus();
      toast('Fix the highlighted settings before saving.', { kind: 'error' });
      return;
    }

    const before = normalized(baseline);
    const changed = SETTING_FIELDS.filter((f) => next[f.key] !== before[f.key]);
    if (!changed.length) {
      toast('No changes to save.', { kind: 'info' });
      return;
    }

    saving = true;
    const button = $('#saveSettingsBtn');
    setBusy(button, true, 'Saving…');
    try {
      // One request, one transaction. is_public comes from the schema, never from the form.
      await run(() => client.from(TABLE).upsert(
        changed.map((f) => ({ key: f.key, value: next[f.key], is_public: f.isPublic })),
        { onConflict: 'key' },
      ).select('key'));
      baseline = { ...baseline, ...next };
      fill(baseline);
      toast(`Saved ${changed.length} setting${changed.length === 1 ? '' : 's'}.`, { kind: 'success' });
    } catch (error) {
      console.error('Settings save failed', error);
      toast(`Could not save settings. ${error.message}`, { kind: 'error' });
    } finally {
      saving = false;
      setBusy(button, false);
      updateCounters();
    }
  }

  form.addEventListener('submit', save);
  form.addEventListener('input', updateCounters);

  return { load, isLoaded: () => loaded };
}
