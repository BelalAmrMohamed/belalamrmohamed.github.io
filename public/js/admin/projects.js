// Projects tab: list, search/filter/sort, drag-and-drop + keyboard reordering,
// bulk actions, duplicate, delete and JSON export/import.

import { $, $$, h, debounce, announce, downloadFile, formatDateTime } from './dom.js';
import { client, run } from './api.js';
import { toast, confirmDialog, confirmDiscard, registerDirty, stateBlock, skeletonRows, setBusy } from './ui.js';
import {
  sortProjects, filterProjects, hasActiveFilters, moveInArray, sameOrder, topSortOrder, stats,
} from './model.js';
import { buildExport, parseImport, IMPORT_MAX_BYTES, validateProject, LIMITS } from './validators.js';
import { removeUnreferencedImages } from './images.js';

const TABLE = 'portfolio_projects';

export function initProjects({ editor, onUpgradeNeeded }) {
  const els = {
    list: $('#projectList'),
    state: $('#projectsState'),
    query: $('#filterQuery'),
    status: $('#filterStatus'),
    category: $('#filterCategory'),
    published: $('#filterPublished'),
    sort: $('#sortMode'),
    clear: $('#clearFiltersBtn'),
    hint: $('#reorderHint'),
    reorderBar: $('#reorderBar'),
    reorderText: $('#reorderText'),
    saveOrder: $('#saveOrderBtn'),
    undoOrder: $('#undoOrderBtn'),
    bulkBar: $('#bulkBar'),
    bulkText: $('#bulkText'),
    selectAll: $('#selectAll'),
    count: $('#resultCount'),
    categoryOptions: $('#categoryOptions'),
  };

  let projects = [];
  let loadState = 'idle'; // idle | loading | error | ready
  let loadError = '';
  let pendingOrder = null; // full list of ids in the unsaved order, or null
  let reorderMissing = false;
  let busy = false;
  const selected = new Set();
  const filters = { query: '', status: '', category: '', published: '' };
  let sortMode = 'manual';

  registerDirty('reorder', () => hasPendingOrder());

  // ---- derived state --------------------------------------------------------------
  const manualIds = () => sortProjects(projects, 'manual').map((p) => p.id);
  const hasPendingOrder = () => Boolean(pendingOrder) && !sameOrder(pendingOrder, manualIds());
  const currentIds = () => (hasPendingOrder() ? pendingOrder : manualIds());
  const byId = (id) => projects.find((p) => p.id === id);
  const canReorder = () =>
    sortMode === 'manual' && !hasActiveFilters(filters) && !busy && loadState === 'ready' && !reorderMissing;

  function visibleProjects() {
    const base = sortMode === 'manual' ? currentIds().map(byId).filter(Boolean) : sortProjects(projects, sortMode);
    return filterProjects(base, filters);
  }

  const categories = () =>
    [...new Set(projects.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  // ---- loading -----------------------------------------------------------------------
  async function load() {
    loadState = 'loading';
    render();
    try {
      projects = (await run(() => client.from(TABLE).select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false }))) || [];
      const ids = new Set(projects.map((p) => p.id));
      for (const id of [...selected]) if (!ids.has(id)) selected.delete(id);
      if (pendingOrder) {
        const kept = pendingOrder.filter((id) => ids.has(id));
        const fresh = manualIds().filter((id) => !kept.includes(id));
        pendingOrder = [...fresh, ...kept];
      }
      loadState = 'ready';
      loadError = '';
    } catch (error) {
      console.error('Project query failed', error);
      loadState = 'error';
      loadError = error.message;
    }
    render();
    editor.setCategories(categories());
  }

  // ---- rendering ----------------------------------------------------------------------
  function renderStats() {
    const s = stats(projects);
    const ready = loadState === 'ready';
    $('#statTotal').textContent = ready ? String(s.total) : '–';
    $('#statPublished').textContent = ready ? String(s.published) : '–';
    $('#statFeatured').textContent = ready ? String(s.featured) : '–';
    $('#statHidden').textContent = ready ? String(s.hidden) : '–';
  }

  function renderFilterOptions() {
    const current = els.category.value;
    els.category.replaceChildren(
      h('option', { value: '' }, 'All categories'),
      ...categories().map((c) => h('option', { value: c }, c)),
    );
    els.category.value = categories().includes(current) ? current : '';
    filters.category = els.category.value;
    els.categoryOptions.replaceChildren(...categories().map((c) => h('option', { value: c })));
  }

  function renderBars(visible) {
    const dirty = hasPendingOrder();
    els.reorderBar.hidden = !dirty;
    if (dirty) {
      const base = manualIds();
      const moved = currentIds().filter((id, i) => id !== base[i]).length;
      els.reorderText.textContent = `Unsaved order: ${moved} project${moved === 1 ? '' : 's'} moved. The public site is not changed until you save.`;
    }
    els.saveOrder.disabled = busy;
    els.undoOrder.disabled = busy;

    els.bulkBar.hidden = selected.size === 0;
    els.bulkText.textContent = `${selected.size} selected`;
    for (const button of $$('button', els.bulkBar)) button.disabled = busy;

    const visibleSelected = visible.filter((p) => selected.has(p.id)).length;
    els.selectAll.checked = visible.length > 0 && visibleSelected === visible.length;
    els.selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
    els.selectAll.disabled = !visible.length || busy;
    els.clear.hidden = !hasActiveFilters(filters) && sortMode === 'manual';
  }

  function renderHint() {
    if (reorderMissing) {
      els.hint.textContent = 'Reordering needs the latest database migration.';
    } else if (sortMode === 'manual' && !hasActiveFilters(filters)) {
      els.hint.textContent = 'Drag the ⠿ handle (or focus it and use the arrow keys) to rearrange. This is the order of your public site.';
    } else {
      els.hint.textContent = 'Reordering is off while searching, filtering or using another sort. Choose “Site order” and clear the filters to rearrange.';
    }
  }

  function render() {
    renderStats();
    renderFilterOptions();
    els.state.replaceChildren();
    els.list.replaceChildren();
    els.list.removeAttribute('aria-busy');

    if (loadState === 'loading' || loadState === 'idle') {
      els.list.setAttribute('aria-busy', 'true');
      els.list.append(skeletonRows(4));
      els.count.textContent = '';
      renderBars([]);
      renderHint();
      return;
    }
    if (loadState === 'error') {
      els.state.append(stateBlock({
        kind: 'error', title: 'Could not load projects', message: loadError,
        action: { label: 'Try again', onClick: load },
      }));
      renderBars([]);
      els.count.textContent = '';
      return;
    }

    const visible = visibleProjects();
    if (!projects.length) {
      els.state.append(stateBlock({
        kind: 'empty', title: 'No projects yet',
        message: 'Add your first project and it will appear on your public portfolio.',
        action: { label: 'New project', onClick: () => editor.open(null) },
      }));
    } else if (!visible.length) {
      els.state.append(stateBlock({
        kind: 'empty', title: 'No projects match',
        message: 'Try a different search or clear the filters.',
        action: { label: 'Clear filters', onClick: clearFilters },
      }));
    }
    const ids = currentIds();
    visible.forEach((project) => els.list.append(projectItem(project, ids)));
    els.count.textContent = projects.length ? `${visible.length} of ${projects.length} shown` : '';
    renderBars(visible);
    renderHint();
  }

  const tag = (text, extra = '') => h('span', { class: `project-tag ${extra}`.trim() }, text);

  function projectItem(project, ids) {
    const reorderable = canReorder();
    const index = ids.indexOf(project.id);
    const isHidden = !project.is_published || project.status === 'archived';
    const placeholder = () => h('span', { class: 'project-thumb project-thumb-empty', 'aria-hidden': 'true' }, '▣');
    const thumb = project.image_url
      ? h('img', {
        class: 'project-thumb', src: project.image_url, alt: '', loading: 'lazy',
        onerror: (e) => e.target.replaceWith(placeholder()),
      })
      : placeholder();

    const button = (label, text, onclick, extra = {}) =>
      h('button', {
        class: 'btn btn-outline btn-sm', type: 'button', 'aria-label': `${label}: ${project.title}`,
        onclick, disabled: busy, ...extra,
      }, text);

    return h('li', { class: `project-item${isHidden ? ' is-hidden' : ''}`, dataset: { id: project.id } },
      h('div', { class: 'project-select' },
        h('input', {
          type: 'checkbox', checked: selected.has(project.id), 'aria-label': `Select ${project.title}`,
          onchange: (e) => {
            if (e.target.checked) selected.add(project.id); else selected.delete(project.id);
            renderBars(visibleProjects());
          },
        })),
      h('button', {
        class: 'drag-handle', type: 'button', dataset: { action: 'handle' },
        'aria-label': `Reorder ${project.title}. Drag, or press the up and down arrow keys.`,
        disabled: !reorderable,
        onpointerdown: (e) => startDrag(e, e.currentTarget.closest('.project-item')),
        onkeydown: (e) => handleKeys(e, project),
      }, '⠿'),
      thumb,
      h('div', { class: 'project-main' },
        h('div', { class: 'project-title-row' },
          h('strong', {}, project.title),
          tag(project.category),
          tag(project.status === 'featured' ? '★ Featured' : project.status === 'archived' ? 'Archived' : 'Active', `tag-${project.status}`),
          tag(project.is_published ? 'Published' : 'Draft', project.is_published ? 'tag-live' : 'tag-draft')),
        h('p', { class: 'project-summary' }, project.summary || 'No description yet.'),
        h('p', { class: 'project-date' }, `Updated ${formatDateTime(project.updated_at)}`)),
      h('div', { class: 'project-actions' },
        h('span', { class: 'move-buttons' },
          button('Move up', '↑', () => moveBy(project.id, -1), { disabled: !reorderable || index <= 0, dataset: { action: 'up' } }),
          button('Move down', '↓', () => moveBy(project.id, 1), { disabled: !reorderable || index === ids.length - 1, dataset: { action: 'down' } })),
        button('Edit', 'Edit', () => editor.open(project)),
        button('Duplicate', 'Duplicate', () => duplicate(project)),
        button('Delete', 'Delete', () => remove([project]), { class: 'btn btn-outline btn-sm btn-danger-outline' })));
  }

  // ---- reordering -----------------------------------------------------------------------
  function setOrder(ids, focusId, focusAction) {
    pendingOrder = ids;
    render();
    if (focusId) {
      const item = els.list.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
      const target = item && (item.querySelector(`[data-action="${focusAction}"]:not(:disabled)`)
        || item.querySelector('[data-action="handle"]:not(:disabled)'));
      target?.focus();
    }
  }

  function moveBy(id, delta, focusAction = delta < 0 ? 'up' : 'down') {
    if (!canReorder()) return;
    const ids = currentIds();
    const from = ids.indexOf(id);
    const to = Math.min(Math.max(from + delta, 0), ids.length - 1);
    if (from < 0 || from === to) return;
    setOrder(moveInArray(ids, from, to), id, focusAction);
    announce(`${byId(id).title} moved to position ${to + 1} of ${ids.length}.`);
  }

  function handleKeys(event, project) {
    const arrows = { ArrowUp: -1, ArrowDown: 1 };
    if (event.key in arrows) {
      event.preventDefault();
      moveBy(project.id, arrows[event.key], 'handle');
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const ids = currentIds();
      const at = ids.indexOf(project.id);
      moveBy(project.id, event.key === 'Home' ? -at : ids.length - 1 - at, 'handle');
    }
  }

  /**
   * Pointer-based drag (mouse, pen and touch). The dragged row stays in the DOM
   * as a dimmed placeholder; a floating clone follows the pointer, and rows are
   * re-ordered visually with CSS `order`, so no node is detached mid-gesture
   * (which would drop touch pointer capture). The DOM is rebuilt on drop.
   */
  function startDrag(event, item) {
    if (!canReorder() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();

    const rows = $$('.project-item', els.list);
    const order = [...rows];
    const rect = item.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const ghost = item.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.inert = true;
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { width: `${rect.width}px`, left: `${rect.left}px`, top: `${rect.top}px` });
    document.body.append(ghost);
    item.classList.add('drag-placeholder');
    document.body.classList.add('is-dragging');
    order.forEach((row, i) => { row.style.order = String(i); });

    let pointerY = event.clientY;
    let frame = 0;
    let finished = false;

    const reposition = () => {
      const others = order.filter((row) => row !== item);
      let at = others.length;
      for (let i = 0; i < others.length; i += 1) {
        const r = others[i].getBoundingClientRect();
        if (pointerY < r.top + r.height / 2) { at = i; break; }
      }
      const next = [...others.slice(0, at), item, ...others.slice(at)];
      if (!sameOrder(next, order)) {
        order.splice(0, order.length, ...next);
        order.forEach((row, i) => { row.style.order = String(i); });
      }
    };

    const tick = () => {
      const edge = 90;
      if (pointerY < edge) window.scrollBy(0, -Math.ceil((edge - pointerY) / 5));
      else if (pointerY > window.innerHeight - edge) window.scrollBy(0, Math.ceil((pointerY - (window.innerHeight - edge)) / 5));
      reposition();
      frame = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      pointerY = e.clientY;
      ghost.style.top = `${e.clientY - offsetY}px`;
    };
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      ghost.remove();
      document.body.classList.remove('is-dragging');
      item.classList.remove('drag-placeholder');
      rows.forEach((row) => { row.style.order = ''; });
      if (!commit) return;
      const ids = order.map((row) => row.dataset.id);
      if (sameOrder(ids, currentIds())) return;
      setOrder(ids, item.dataset.id, 'handle');
      announce(`${byId(item.dataset.id).title} moved to position ${ids.indexOf(item.dataset.id) + 1} of ${ids.length}.`);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    frame = requestAnimationFrame(tick);
  }

  async function saveOrder() {
    if (!hasPendingOrder()) return;
    busy = true;
    setBusy(els.saveOrder, true, 'Saving…');
    renderBars(visibleProjects());
    try {
      await run(() => client.rpc('admin_reorder_projects', { p_ids: pendingOrder }));
      pendingOrder = null;
      toast('Project order saved. The public site now uses it.', { kind: 'success' });
    } catch (error) {
      if (error.missing) { reorderMissing = true; onUpgradeNeeded?.(); }
      toast(`Could not save the order. ${error.message}`, { kind: 'error' });
    } finally {
      busy = false;
      setBusy(els.saveOrder, false);
    }
    await load();
  }

  function undoOrder() {
    pendingOrder = null;
    render();
    announce('Order changes undone.');
  }

  // ---- filters ---------------------------------------------------------------------------------
  function syncFilters() {
    filters.query = els.query.value;
    filters.status = els.status.value;
    filters.category = els.category.value;
    filters.published = els.published.value;
    sortMode = els.sort.value;
    const visible = new Set(visibleProjects().map((p) => p.id));
    for (const id of [...selected]) if (!visible.has(id)) selected.delete(id);
    render();
  }

  function clearFilters() {
    els.query.value = '';
    els.status.value = '';
    els.category.value = '';
    els.published.value = '';
    els.sort.value = 'manual';
    syncFilters();
    els.query.focus();
  }

  // ---- mutations -----------------------------------------------------------------------------------
  async function mutate(label, task) {
    busy = true;
    render();
    try {
      await task();
      return true;
    } catch (error) {
      console.error(`${label} failed`, error);
      toast(`${label} failed. ${error.message}`, { kind: 'error' });
      return false;
    } finally {
      busy = false;
    }
  }

  const summarize = (list) => {
    const lines = list.slice(0, 5).map((p) => `“${p.title}”`);
    if (list.length > 5) lines.push(`…and ${list.length - 5} more`);
    return lines;
  };

  async function bulkUpdate(patch, doneText) {
    const ids = [...selected];
    if (!ids.length) return;
    const ok = await mutate('Update', async () => {
      // .select() makes a silent RLS denial (0 rows) visible instead of looking like success.
      const rows = await run(() => client.from(TABLE).update(patch).in('id', ids).select('id'));
      if (rows.length !== ids.length) throw new Error(`Only ${rows.length} of ${ids.length} projects were updated.`);
    });
    if (ok) {
      selected.clear();
      toast(`${doneText} (${ids.length}).`, { kind: 'success' });
    }
    await load();
  }

  async function bulkPublish() {
    const archived = [...selected].map(byId).filter((p) => p?.status === 'archived').length;
    await bulkUpdate({ is_published: true }, 'Published');
    if (archived) {
      toast(`${archived} archived project${archived === 1 ? ' stays' : 's stay'} hidden until you change its status.`, { kind: 'info' });
    }
  }

  async function bulkArchive() {
    const picked = [...selected].map(byId).filter(Boolean);
    if (!picked.length) return;
    const ok = await confirmDialog({
      title: `Archive ${picked.length} project${picked.length === 1 ? '' : 's'}?`,
      message: 'Archived projects are hidden from the public site and the AI assistant. Change the status later to restore them.',
      details: summarize(picked),
      confirmLabel: 'Archive',
    });
    if (ok) await bulkUpdate({ status: 'archived', featured: false }, 'Archived');
  }

  async function remove(list) {
    if (!list.length) return;
    const many = list.length > 1;
    const confirmed = await confirmDialog({
      title: many ? `Delete ${list.length} projects?` : `Delete “${list[0].title}”?`,
      message: 'This permanently deletes the project from the database and cannot be undone. Use Export JSON first if you might want it back.',
      details: many ? summarize(list) : [],
      confirmLabel: many ? `Delete ${list.length} projects` : 'Delete project',
      danger: true,
    });
    if (!confirmed) return;

    const ids = list.map((p) => p.id);
    const ok = await mutate('Delete', async () => {
      const rows = await run(() => client.from(TABLE).delete().in('id', ids).select('id'));
      if (rows.length !== ids.length) throw new Error(`Only ${rows.length} of ${ids.length} projects were deleted.`);
    });
    if (ok) {
      ids.forEach((id) => selected.delete(id));
      if (pendingOrder) pendingOrder = pendingOrder.filter((id) => !ids.includes(id));
      toast(many ? `${ids.length} projects deleted.` : 'Project deleted.', { kind: 'success' });
      removeUnreferencedImages(list.map((p) => p.image_url), projects.filter((p) => !ids.includes(p.id)));
    }
    await load();
  }

  async function duplicate(project) {
    const ok = await mutate('Duplicate', async () => {
      const title = `Copy of ${project.title}`.slice(0, LIMITS.title);
      const { value } = validateProject({ ...project, title, is_published: false });
      const created = await run(() => client.from(TABLE)
        .insert({ ...value, sort_order: topSortOrder(projects) }).select('id').single());
      // Place the copy directly below the original.
      const ids = manualIds().filter((id) => id !== created.id);
      ids.splice(ids.indexOf(project.id) + 1, 0, created.id);
      try {
        await run(() => client.rpc('admin_reorder_projects', { p_ids: ids }));
      } catch {
        toast('The copy was added at the top of the list (it could not be placed next to the original).', { kind: 'info' });
      }
    });
    if (ok) toast('Duplicated as an unpublished draft. Review it, then publish.', { kind: 'success' });
    await load();
  }

  // ---- export / import -----------------------------------------------------------------------------------
  function exportJson() {
    if (!projects.length) { toast('There are no projects to export.', { kind: 'info' }); return; }
    const data = buildExport(sortProjects(projects, 'manual'));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`portfolio-projects-${stamp}.json`, `${JSON.stringify(data, null, 2)}\n`);
    toast(`Exported ${projects.length} project${projects.length === 1 ? '' : 's'}.`, { kind: 'success' });
  }

  async function importJson(file) {
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) { toast('That file is larger than 1 MB.', { kind: 'error' }); return; }
    const { rows, errors } = parseImport(await file.text());
    const problems = errors.slice(0, 6).map((e) => `${e.label}: ${e.messages[0]}`);
    if (errors.length > 6) problems.push(`…and ${errors.length - 6} more problems`);

    if (!rows.length) {
      await confirmDialog({
        title: 'Nothing to import', message: 'No valid projects were found in that file.',
        details: problems, confirmLabel: 'OK', cancelLabel: 'Close',
      });
      return;
    }
    const existing = new Set(projects.map((p) => p.title.trim().toLowerCase()));
    const dupes = rows.filter((r) => existing.has(r.title.toLowerCase())).length;
    const details = [
      `${rows.filter((r) => r.is_published).length} will be published, ${rows.filter((r) => !r.is_published).length} saved as drafts.`,
      dupes ? `${dupes} share a title with an existing project and will be added again.` : null,
      errors.length ? `${errors.length} skipped because of problems:` : null,
      ...problems,
    ].filter(Boolean);
    const go = await confirmDialog({
      title: `Import ${rows.length} project${rows.length === 1 ? '' : 's'}?`,
      message: 'They are added at the end of the list. Nothing existing is changed or removed.',
      details, confirmLabel: `Import ${rows.length}`,
    });
    if (!go) return;

    const start = (projects.length ? Math.max(...projects.map((p) => p.sort_order)) : 0) + 10;
    const ok = await mutate('Import', async () => {
      await run(() => client.from(TABLE)
        .insert(rows.map((row, i) => ({ ...row, sort_order: start + i * 10 }))).select('id'));
    });
    if (ok) toast(`Imported ${rows.length} project${rows.length === 1 ? '' : 's'}.`, { kind: 'success' });
    await load();
  }

  // ---- wiring ----------------------------------------------------------------------------------------------
  els.query.addEventListener('input', debounce(syncFilters, 150));
  for (const control of [els.status, els.category, els.published, els.sort]) {
    control.addEventListener('change', syncFilters);
  }
  els.clear.addEventListener('click', clearFilters);
  els.saveOrder.addEventListener('click', saveOrder);
  els.undoOrder.addEventListener('click', undoOrder);
  els.selectAll.addEventListener('change', () => {
    const checked = els.selectAll.checked;
    visibleProjects().forEach((p) => (checked ? selected.add(p.id) : selected.delete(p.id)));
    render();
  });
  $('#bulkPublish').addEventListener('click', bulkPublish);
  $('#bulkUnpublish').addEventListener('click', () => bulkUpdate({ is_published: false }, 'Unpublished'));
  $('#bulkArchive').addEventListener('click', bulkArchive);
  $('#bulkDelete').addEventListener('click', () => remove([...selected].map(byId).filter(Boolean)));
  $('#bulkClear').addEventListener('click', () => { selected.clear(); render(); });
  $('#newProjectBtn').addEventListener('click', () => editor.open(null));
  $('#exportBtn').addEventListener('click', exportJson);
  const importInput = $('#importFile');
  $('#importBtn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const [file] = importInput.files;
    importInput.value = '';
    await importJson(file);
  });
  $('#refreshProjectsBtn').addEventListener('click', async () => {
    if (hasPendingOrder() && !(await confirmDiscard(['reorder']))) return;
    pendingOrder = null;
    await load();
  });

  return {
    load,
    getProjects: () => projects,
    isReady: () => loadState === 'ready',
  };
}
