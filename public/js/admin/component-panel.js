// UI component editor: one variant per format (React+TS+Tailwind, HTML/CSS/JS), each with a preview path,
// exact-version dependencies and source files. Like the other asset panels, saves are immediate and per format.
// Source is stored as text only and is never executed here; the public preview is a prebuilt page under /previews/.
import { $, h } from './dom.js';
import { client, run } from './api.js';
import { toast, confirmDialog } from './ui.js';
import {
  FORMATS, orderFiles, validateVariantDraft, parseDependencies, formatDependencies, validatePreviewPath, validateFilePath,
} from '../site/component-model.js';

export function initComponentPanel({ getProject }) {
  const root = $('#componentSection');
  const note = $('#componentNote');
  const body = $('#componentBody');
  let projectId = null;
  let generation = 0;
  let variants = {}; // format -> { row, files }
  let busy = false;

  async function load() {
    const mine = ++generation;
    try {
      const rows = await run(() => client.from('portfolio_component_variants')
        .select('id, format, entry_file, preview_path, dependencies, sort_order').eq('portfolio_project_id', projectId));
      const ids = rows.map((r) => r.id);
      const files = ids.length ? await run(() => client.from('portfolio_component_files')
        .select('id, variant_id, path, source, is_entry, sort_order').in('variant_id', ids)) : [];
      if (mine !== generation) return;
      variants = {};
      for (const r of rows) variants[r.format] = { row: r, files: orderFiles(files.filter((f) => f.variant_id === r.id)) };
      note.hidden = true;
      render();
    } catch (e) {
      if (mine !== generation) return;
      body.replaceChildren();
      note.hidden = false;
      note.textContent = e.missing ? 'Components need the latest database migration. Apply it and refresh.' : `Could not load components. ${e.message}`;
    }
  }

  function render() {
    body.replaceChildren(...Object.keys(FORMATS).map(formatBlock));
  }

  function formatBlock(format) {
    const existing = variants[format];
    const rows = (existing?.files || []).map((f) => ({ id: f.id, path: f.path, source: f.source, is_entry: f.is_entry }));
    if (!rows.length) rows.push({ id: null, path: format === 'react_ts_tailwind' ? 'src/Component.tsx' : 'index.html', source: '', is_entry: true });

    const preview = h('input', { type: 'text', value: existing?.row.preview_path || '', placeholder: '/previews/my-component/index.html', 'aria-label': `${FORMATS[format].label} preview path` });
    const deps = h('input', { type: 'text', value: formatDependencies(existing?.row.dependencies), placeholder: format === 'react_ts_tailwind' ? 'react@18.3.1, react-dom@18.3.1, tailwindcss@3.4.17' : '', 'aria-label': `${FORMATS[format].label} dependencies` });
    const errorBox = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const filesBox = h('div', { class: 'cmp-admin-files' });

    const paintFiles = () => filesBox.replaceChildren(...rows.map((r, i) => h('div', { class: 'cmp-admin-file' },
      h('div', { class: 'image-buttons' },
        h('input', { type: 'text', value: r.path, 'aria-label': 'File path', oninput: (e) => { r.path = e.target.value; } }),
        h('label', { class: 'hint' }, h('input', { type: 'radio', name: `entry-${format}`, checked: r.is_entry, onchange: () => { rows.forEach((x) => { x.is_entry = x === r; }); } }), ' Entry'),
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: rows.length < 2, onclick: () => { rows.splice(i, 1); if (!rows.some((x) => x.is_entry)) rows[0].is_entry = true; paintFiles(); } }, 'Remove')),
      h('textarea', { rows: 10, spellcheck: false, 'aria-label': `Source of ${r.path}`, class: 'cmp-admin-source', oninput: (e) => { r.source = e.target.value; } }, r.source))));
    paintFiles();

    async function save() {
      if (busy) return;
      const draftFiles = rows.map((r) => ({ ...r, path: r.path.trim() }));
      const errors = validateVariantDraft({ preview: preview.value, depsText: deps.value, files: draftFiles });
      if (errors.length) { errorBox.hidden = false; errorBox.textContent = errors.join(' '); return; }
      errorBox.hidden = true; busy = true;
      try {
        const variantRow = await run(() => client.from('portfolio_component_variants').upsert({
          portfolio_project_id: projectId, format,
          preview_path: validatePreviewPath(preview.value).value,
          dependencies: parseDependencies(deps.value).value,
          entry_file: draftFiles.find((f) => f.is_entry).path,
          build_state: validatePreviewPath(preview.value).value ? 'built' : 'none',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'portfolio_project_id,format' }).select('id').single());
        const keep = draftFiles.filter((f) => f.id).map((f) => f.id);
        for (const [order, f] of draftFiles.entries()) {
          const values = { variant_id: variantRow.id, path: validateFilePath(f.path).value, source: f.source, is_entry: !!f.is_entry, sort_order: order, updated_at: new Date().toISOString() };
          if (f.id) await run(() => client.from('portfolio_component_files').update(values).eq('id', f.id).select('id'));
          else { const row = await run(() => client.from('portfolio_component_files').insert(values).select('id').single()); keep.push(row.id); }
        }
        // Removals last, so a failed save never loses source that was only partly rewritten.
        const stale = (existing?.files || []).map((f) => f.id).filter((id) => !keep.includes(id));
        if (stale.length) await run(() => client.from('portfolio_component_files').delete().in('id', stale).select('id'));
        toast(`${FORMATS[format].label} saved.`, { kind: 'success' });
      } catch (e) { errorBox.hidden = false; errorBox.textContent = `Could not save. ${e.message}`; }
      finally { busy = false; await load(); }
    }

    async function remove() {
      if (!existing || !(await confirmDialog({ title: `Remove ${FORMATS[format].label}?`, message: 'Its source files are deleted. The component stays published with its other format, if any.', confirmLabel: 'Remove', danger: true }))) return;
      try { await run(() => client.from('portfolio_component_variants').delete().eq('id', existing.row.id).select('id')); toast('Format removed.', { kind: 'success' }); }
      catch (e) { toast(`Could not remove. ${e.message}`, { kind: 'error' }); }
      await load();
    }

    return h('fieldset', { class: 'cmp-admin-format' },
      h('legend', {}, `${FORMATS[format].label}${existing ? '' : ' (not added)'}`),
      h('label', { class: 'hint' }, 'Preview path (prebuilt page committed under /previews/; leave empty for none)'), preview,
      h('label', { class: 'hint' }, 'Dependencies (exact versions, allowlisted)'), deps,
      filesBox,
      h('div', { class: 'image-buttons' },
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { rows.push({ id: null, path: '', source: '', is_entry: false }); paintFiles(); } }, 'Add file'),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: save }, existing ? 'Save format' : 'Add format'),
        existing ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: remove }, 'Remove format') : null),
      errorBox);
  }

  return {
    show({ project, workType, ready }) {
      const visible = !!ready && workType === 'ui_component';
      root.hidden = !visible;
      projectId = project?.id || null;
      generation++;
      if (!visible) { body.replaceChildren(); return; }
      if (!projectId) { note.hidden = false; note.textContent = 'Save this component first, then add its formats and source.'; body.replaceChildren(); return; }
      note.hidden = true; load();
    },
    hasChanges: () => false,
    resetChanges() {},
  };
}
