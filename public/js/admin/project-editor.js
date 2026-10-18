// Project editor: form, inline validation, character counters, image upload,
// live preview, unsaved-changes tracking and saving.

import { $, $$, h, debounce, safeStorage, announce } from './dom.js';
import { client, run } from './api.js';
import { toast, registerDirty, confirmDiscard, setBusy } from './ui.js';
import { topSortOrder } from './model.js';
import {
  validateProject, validateImageFile, isUrlOrSitePath, IMAGE_MAX_BYTES, LIMITS,
} from './validators.js';
import { uploadProjectImage, removeObjects, removeUnreferencedImages } from './images.js';

const TABLE = 'portfolio_projects';
const DRAFT_KEY = 'portfolio_admin_project_draft';

const FIELDS = {
  title: 'projectTitle',
  category: 'projectCategory',
  summary: 'projectSummary',
  image_url: 'projectImage',
  project_url: 'projectUrl',
  github_url: 'projectGithub',
  status: 'projectStatus',
};
const ERROR_IDS = {
  title: 'projectTitleError',
  category: 'projectCategoryError',
  summary: 'projectSummaryError',
  image_url: 'projectImageError',
  project_url: 'projectUrlError',
  github_url: 'projectGithubError',
};

export function initEditor({ getProjects, onSaved, showList, showEditor }) {
  const form = $('#projectForm');
  const el = (id) => document.getElementById(id);
  const imageFile = $('#imageFile');

  let editing = null; // the stored project being edited, or null for a new one
  let baseline = '';
  let pendingFile = null; // File chosen but not yet uploaded
  let pendingPreviewUrl = null;
  let removeRequested = false;
  let saving = false;
  let open = false;

  // ---- form <-> values --------------------------------------------------------------------------
  function readValues() {
    return {
      title: el('projectTitle').value,
      category: el('projectCategory').value,
      summary: el('projectSummary').value,
      image_url: el('projectImage').value,
      project_url: el('projectUrl').value,
      github_url: el('projectGithub').value,
      status: el('projectStatus').value,
      is_published: el('projectPublished').checked,
    };
  }

  function writeValues(project) {
    el('projectTitle').value = project?.title || '';
    el('projectCategory').value = project?.category || '';
    el('projectSummary').value = project?.summary || '';
    el('projectImage').value = project?.image_url || '';
    el('projectUrl').value = project?.project_url || '';
    el('projectGithub').value = project?.github_url || '';
    el('projectStatus').value = project?.status || 'active';
    el('projectPublished').checked = project ? Boolean(project.is_published) : false;
  }

  const snapshot = () => JSON.stringify({ ...readValues(), file: pendingFile ? pendingFile.name + pendingFile.size : '', removeRequested });
  const isDirty = () => open && !saving && snapshot() !== baseline;

  registerDirty('project-form', isDirty);

  // ---- errors ---------------------------------------------------------------------------------------
  function setError(field, message) {
    const input = el(FIELDS[field]);
    const box = el(ERROR_IDS[field]);
    if (!input || !box) return;
    box.textContent = message || '';
    box.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  function clearErrors() {
    Object.keys(ERROR_IDS).forEach((field) => setError(field, ''));
    const summary = el('formErrorSummary');
    summary.hidden = true;
    summary.textContent = '';
  }

  function currentForValidation() {
    const values = readValues();
    // While a file is waiting to upload the URL box is ignored.
    if (pendingFile) values.image_url = '';
    return values;
  }

  function validateField(field) {
    const { errors } = validateProject(currentForValidation());
    setError(field, errors[field] || '');
  }

  // ---- counters ----------------------------------------------------------------------------------------
  function updateCounters() {
    $$('.counter').forEach((counter) => {
      const input = el(counter.dataset.countFor);
      const max = Number(counter.dataset.max);
      const length = input.value.trim().length;
      counter.textContent = `${length}/${max}`;
      counter.dataset.state = length > max ? 'over' : length >= max * 0.9 ? 'near' : 'ok';
    });
  }

  // ---- image ---------------------------------------------------------------------------------------------
  function effectiveImageSrc() {
    if (pendingPreviewUrl) return pendingPreviewUrl;
    if (removeRequested) return '';
    const value = el('projectImage').value.trim();
    return value && isUrlOrSitePath(value) ? value : '';
  }

  function renderImage() {
    const src = effectiveImageSrc();
    const preview = el('imagePreview');
    const placeholder = el('imagePlaceholder');
    if (src) {
      preview.hidden = false;
      preview.src = src;
      placeholder.hidden = true;
    } else {
      preview.hidden = true;
      preview.removeAttribute('src');
      placeholder.hidden = false;
    }
    const hasImage = Boolean(src) || (editing?.image_url && !removeRequested);
    el('removeImageBtn').hidden = !hasImage && !pendingFile;
    el('uploadBtn').textContent = hasImage || pendingFile ? 'Replace image' : 'Upload image';
    el('projectImage').disabled = Boolean(pendingFile);
    el('imageFileNote').textContent = pendingFile
      ? `${pendingFile.name} (${(pendingFile.size / 1048576).toFixed(2)} MB) will be uploaded when you save.`
      : '';
  }

  function dropPending() {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = null;
    pendingFile = null;
    imageFile.value = '';
  }

  function chooseFile(file) {
    const problem = validateImageFile(file);
    if (problem) {
      setError('image_url', problem);
      toast(problem, { kind: 'error' });
      imageFile.value = '';
      return;
    }
    setError('image_url', '');
    dropPending();
    pendingFile = file;
    pendingPreviewUrl = URL.createObjectURL(file);
    removeRequested = false;
    renderImage();
    renderPreview();
    announce(`Image ${file.name} selected.`);
  }

  function removeImage() {
    dropPending();
    el('projectImage').value = '';
    removeRequested = Boolean(editing?.image_url);
    setError('image_url', '');
    renderImage();
    renderPreview();
    announce('Image removed.');
  }

  // ---- live preview ------------------------------------------------------------------------------------------
  function renderPreview() {
    const values = readValues();
    const title = values.title.trim() || 'Untitled project';
    const category = values.category.trim() || 'Category';
    const summary = values.summary.trim();
    const src = effectiveImageSrc();
    const link = values.project_url.trim() || values.github_url.trim();
    const linkOk = /^https?:\/\//i.test(link);

    const picture = () => (src
      ? h('img', { src, alt: '', class: 'pv-img' })
      : h('div', { class: 'pv-img pv-img-empty' }, 'No image'));

    $('#previewCard').replaceChildren(
      picture(),
      h('div', { class: 'pv-text' },
        h('div', { class: 'pv-cat' }, category),
        h('div', { class: 'pv-title' }, title)));

    $('#previewModal').replaceChildren(
      src ? picture() : null,
      h('div', { class: 'pv-desc' },
        h('h4', {}, title),
        h('p', {}, summary || 'No description yet.'),
        h('ul', { class: 'pv-catlist' }, h('li', {}, category))),
      linkOk ? h('span', { class: 'pv-link' }, 'Project link') : null);

    const badge = $('#previewVisibility');
    const hidden = values.status === 'archived' ? 'Hidden: archived' : !values.is_published ? 'Hidden: saved as a draft' : null;
    badge.textContent = hidden || (values.status === 'featured' ? 'Visible on the site · featured' : 'Visible on the site');
    badge.dataset.state = hidden ? 'hidden' : 'visible';
  }

  const refresh = debounce(() => {
    updateCounters();
    renderPreview();
    syncDirtyBadge();
  }, 60);

  function syncDirtyBadge() {
    $('#dirtyBadge').hidden = !isDirty();
  }

  // ---- open / close -----------------------------------------------------------------------------------------------
  async function openEditor(project) {
    if (open && !(await confirmDiscard(['project-form']))) return;
    editing = project || null;
    dropPending();
    removeRequested = false;
    clearErrors();
    writeValues(project);
    $('#projectId').value = project?.id || '';
    $('#formTitle').textContent = project ? 'Edit project' : 'New project';
    el('saveProjectBtn').textContent = project ? 'Save changes' : 'Create project';
    open = true;
    renderImage();
    updateCounters();
    renderPreview();
    baseline = snapshot();
    syncDirtyBadge();
    showEditor();
    $('#formTitle').focus();
  }

  async function close({ force = false } = {}) {
    if (!open) return true;
    if (!force && !(await confirmDiscard(['project-form']))) return false;
    open = false;
    dropPending();
    editing = null;
    showList();
    return true;
  }

  // ---- save -------------------------------------------------------------------------------------------------------
  async function save(event) {
    event.preventDefault();
    if (saving) return;
    clearErrors();
    const { errors, value } = validateProject(currentForValidation());
    const failing = Object.keys(errors);
    if (failing.length) {
      failing.forEach((field) => setError(field, errors[field]));
      const summary = el('formErrorSummary');
      summary.textContent = `Fix ${failing.length} field${failing.length === 1 ? '' : 's'} before saving: ${failing.map((f) => ({ title: 'title', category: 'category', summary: 'description', image_url: 'image', project_url: 'project URL', github_url: 'GitHub URL', status: 'status' }[f])).join(', ')}.`;
      summary.hidden = false;
      el(FIELDS[failing[0]]).focus();
      return;
    }

    saving = true;
    const button = el('saveProjectBtn');
    setBusy(button, true, pendingFile ? 'Uploading image…' : 'Saving…');
    let uploadedPath = null;
    const previousImage = editing?.image_url || null;

    try {
      if (pendingFile) {
        const uploaded = await uploadProjectImage(pendingFile);
        uploadedPath = uploaded.path;
        value.image_url = uploaded.url;
      } else if (removeRequested) {
        value.image_url = null;
      }

      const projects = getProjects();
      let rows;
      if (editing) {
        // .select() so that a silently denied update (0 rows) is reported, not ignored.
        rows = await run(() => client.from(TABLE).update(value).eq('id', editing.id).select('id'));
        if (!rows.length) throw new Error('The project was not updated. It may have been deleted, or you may not have permission.');
      } else {
        rows = await run(() => client.from(TABLE).insert({ ...value, sort_order: topSortOrder(projects) }).select('id'));
      }

      const wasNew = !editing;
      if (previousImage && previousImage !== value.image_url) {
        removeUnreferencedImages([previousImage], projects.filter((p) => p.id !== editing.id));
      }
      baseline = snapshot(); // so closing does not ask about discarding
      saving = false;
      toast(wasNew ? 'Project created.' : 'Project saved.', { kind: 'success' });
      await close({ force: true });
      await onSaved(rows[0]?.id);
    } catch (error) {
      console.error('Project save failed', error);
      if (uploadedPath) removeObjects([uploadedPath]);
      toast(`Could not save the project. ${error.message}`, { kind: 'error' });
      const summary = el('formErrorSummary');
      summary.textContent = `Could not save: ${error.message}`;
      summary.hidden = false;
    } finally {
      saving = false;
      setBusy(button, false);
    }
  }

  // ---- draft kept across a session expiry -------------------------------------------------------------------------
  function stashDraft() {
    if (!open || !isDirty()) return;
    const store = safeStorage('session');
    try {
      store?.setItem(DRAFT_KEY, JSON.stringify({ id: editing?.id || null, values: readValues() }));
    } catch { /* storage unavailable: nothing to do */ }
  }

  function offerDraft() {
    const store = safeStorage('session');
    let draft = null;
    try { draft = JSON.parse(store?.getItem(DRAFT_KEY) || 'null'); } catch { draft = null; }
    if (!draft?.values) return;
    toast('You have an unsaved project from before your session ended.', {
      kind: 'info', timeout: 20000,
      action: {
        label: 'Restore',
        onClick: async () => {
          const original = draft.id ? getProjects().find((p) => p.id === draft.id) : null;
          if (draft.id && !original) { toast('That project no longer exists.', { kind: 'error' }); return; }
          await openEditor(original || null);
          writeValues({ ...draft.values, is_published: draft.values.is_published });
          el('projectPublished').checked = Boolean(draft.values.is_published);
          updateCounters();
          renderPreview();
          syncDirtyBadge();
          try { store.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        },
      },
    });
    try { store.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  // ---- wiring ----------------------------------------------------------------------------------------------------------
  form.addEventListener('submit', save);
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  for (const [field, id] of Object.entries(FIELDS)) {
    if (!ERROR_IDS[field]) continue;
    el(id).addEventListener('blur', () => validateField(field));
  }
  el('projectImage').addEventListener('input', () => {
    // Typing a new link cancels an earlier "remove image".
    if (removeRequested) { removeRequested = false; renderImage(); }
  });
  $('#uploadBtn').addEventListener('click', () => imageFile.click());
  imageFile.addEventListener('change', () => { if (imageFile.files[0]) chooseFile(imageFile.files[0]); });
  $('#removeImageBtn').addEventListener('click', removeImage);
  el('imageThumb').addEventListener('dragover', (e) => { e.preventDefault(); e.currentTarget.classList.add('is-over'); });
  el('imageThumb').addEventListener('dragleave', (e) => e.currentTarget.classList.remove('is-over'));
  el('imageThumb').addEventListener('drop', (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('is-over');
    if (e.dataTransfer?.files?.[0]) chooseFile(e.dataTransfer.files[0]);
  });
  el('imagePreview').addEventListener('error', () => {
    if (!pendingFile) setError('image_url', 'This image could not be loaded. Check the link.');
  });
  el('imagePreview').addEventListener('load', () => { if (!pendingFile) setError('image_url', ''); });
  $('#backToListBtn').addEventListener('click', () => close());
  $('#cancelEditBtn').addEventListener('click', () => close());

  return {
    open: openEditor,
    close,
    isOpen: () => open,
    setCategories: () => {},
    stashDraft,
    offerDraft,
    limits: { LIMITS, IMAGE_MAX_BYTES },
  };
}
