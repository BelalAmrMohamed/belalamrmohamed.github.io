// Asset manager for graphic cases: ordered, labelled images stored in
// public.portfolio_assets. Unlike the project form (Save button), every change
// here is written immediately, and the panel says so. Files go to the existing
// admin-only images bucket (5 MB, raster types), under assets/<project id>/.

import { $, h, newId, announce } from './dom.js';
import { client, config, run, call } from './api.js';
import { toast, confirmDialog } from './ui.js';
import { validateImageFile, IMAGE_BUCKET, IMAGE_TYPES } from './validators.js';
import { removeObjects } from './images.js';
import {
  IMAGE_ROLES, ROLE_LABELS, ALT_MAX, CAPTION_MAX, MAX_ASSETS_PER_CASE,
  makeAssetPath, nextSortOrder, defaultRoleFor, reorderUpdates, validateAssetMeta,
  coverSyncPlan, storagePublicUrl,
} from '../site/asset-model.js';

const TABLE = 'portfolio_assets';
const COLUMNS = 'id, portfolio_project_id, media_kind, role, bucket, storage_path, external_url, alt_text, caption, sort_order, created_at';

function imageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve({ width: null, height: null }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

const urlOf = (asset) => asset.external_url || storagePublicUrl(config.supabaseUrl, asset.bucket, asset.storage_path);

/**
 * getProject() -> the stored project being edited (or null while creating).
 * syncCover(url) -> called after the legacy image_url was updated in the database.
 */
export function initAssetsPanel({ getProject, syncCover }) {
  const root = $('#assetsSection');
  const note = $('#assetsNote');
  const list = $('#assetList');
  const addBtn = $('#addAssetsBtn');
  const input = $('#assetFiles');
  const status = $('#assetsStatus');

  let assets = [];
  let projectId = null;
  let busy = false;
  let changed = false;
  let generation = 0; // ignores answers that arrive after the editor moved on

  const setStatus = (message) => { status.textContent = message || ''; };

  function setBusy(value) {
    busy = value;
    root.setAttribute('aria-busy', String(value));
    addBtn.disabled = value || !projectId || assets.length >= MAX_ASSETS_PER_CASE;
    list.querySelectorAll('button, select, input').forEach((control) => { control.disabled = value; });
  }

  // ---- rendering ---------------------------------------------------------------------------
  function row(asset, index) {
    const label = `image ${index + 1}`;
    const url = urlOf(asset);
    const roleSelect = h('select', { class: 'input', 'aria-label': `Role of ${label}` },
      IMAGE_ROLES.map((role) => h('option', { value: role }, ROLE_LABELS[role])));
    roleSelect.value = asset.role;
    const alt = h('input', {
      class: 'input', type: 'text', maxlength: ALT_MAX + 20, value: asset.alt_text || '',
      placeholder: 'Alt text (describe the image)', 'aria-label': `Alt text of ${label}`, autocomplete: 'off',
    });
    const caption = h('input', {
      class: 'input', type: 'text', maxlength: CAPTION_MAX + 20, value: asset.caption || '',
      placeholder: 'Caption (optional)', 'aria-label': `Caption of ${label}`, autocomplete: 'off',
    });
    const error = h('p', { class: 'field-error', hidden: true, role: 'alert' });

    async function saveMeta() {
      const { errors, value } = validateAssetMeta({ role: roleSelect.value, alt_text: alt.value, caption: caption.value });
      const message = errors.role || errors.alt_text || errors.caption || '';
      error.textContent = message;
      error.hidden = !message;
      if (message) return;
      if (value.role === asset.role && value.alt_text === (asset.alt_text || '') && value.caption === (asset.caption || '')) return;
      setBusy(true);
      try {
        const rows = await run(() => client.from(TABLE).update(value).eq('id', asset.id).select('id'));
        if (!rows.length) throw new Error('The image was not updated. It may have been removed, or you may not have permission.');
        Object.assign(asset, value);
        changed = true;
        announce(`Saved ${label}.`);
        await syncLegacyCover();
      } catch (e) {
        toast(`Could not save the image. ${e.message}`, { kind: 'error' });
        await reload();
      } finally {
        setBusy(false);
      }
    }
    roleSelect.addEventListener('change', saveMeta);
    alt.addEventListener('change', saveMeta);
    caption.addEventListener('change', saveMeta);
    for (const field of [alt, caption]) {
      field.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); field.blur(); } });
    }

    const mover = (direction, text, glyph) => h('button', {
      class: 'btn btn-outline btn-sm', type: 'button', 'aria-label': `${text}: ${label}`,
      disabled: direction < 0 ? index === 0 : index === assets.length - 1,
      onclick: () => move(asset, direction),
    }, glyph);

    return h('li', { class: 'asset-row', dataset: { assetId: asset.id } },
      h('div', { class: 'asset-thumb' }, url ? h('img', { src: url, alt: '', loading: 'lazy' }) : null),
      h('div', { class: 'asset-fields' }, roleSelect, alt, caption, error),
      h('div', { class: 'asset-actions' },
        mover(-1, 'Move up', '↑'),
        mover(1, 'Move down', '↓'),
        h('button', {
          class: 'btn btn-outline btn-sm', type: 'button',
          'aria-label': `Remove ${label}`, onclick: () => remove(asset, index),
        }, 'Remove')));
  }

  function render() {
    list.replaceChildren(...assets.map(row));
    addBtn.disabled = busy || !projectId || assets.length >= MAX_ASSETS_PER_CASE;
    setStatus(assets.length
      ? `${assets.length} ${assets.length === 1 ? 'image' : 'images'}. Changes here are saved immediately.`
      : 'No images yet. Changes here are saved immediately.');
  }

  // ---- data --------------------------------------------------------------------------------
  async function reload() {
    const mine = generation;
    try {
      const rows = await run(() => client.from(TABLE).select(COLUMNS)
        .eq('portfolio_project_id', projectId)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true }));
      if (mine !== generation) return;
      assets = rows;
      render();
    } catch (e) {
      if (mine !== generation) return;
      assets = [];
      list.replaceChildren();
      addBtn.disabled = true;
      note.hidden = false;
      note.textContent = e.missing
        ? 'Image groups need the latest database migration. Apply it and refresh.'
        : `Could not load the images. ${e.message}`;
      setStatus('');
    }
  }

  async function syncLegacyCover() {
    const project = getProject();
    if (!project) return;
    const plan = coverSyncPlan({
      currentUrl: project.image_url, assets, supabaseUrl: config.supabaseUrl,
      bucket: IMAGE_BUCKET, projectId: project.id,
    });
    if (!plan.change) return;
    const rows = await run(() => client.from('portfolio_projects')
      .update({ image_url: plan.url }).eq('id', project.id).select('id'));
    if (!rows.length) throw new Error('The cover image could not be updated.');
    syncCover(plan.url);
  }

  async function move(asset, direction) {
    const updates = reorderUpdates(assets, asset.id, direction);
    if (!updates.length) return;
    setBusy(true);
    try {
      await Promise.all(updates.map(({ id, sort_order }) =>
        run(() => client.from(TABLE).update({ sort_order }).eq('id', id).select('id'))
          .then((rows) => { if (!rows.length) throw new Error('An image could not be reordered.'); })));
      changed = true;
      await reload();
      announce('Image moved.');
      const buttons = list.querySelectorAll(`[data-asset-id="${asset.id}"] button`);
      const wanted = buttons[direction < 0 ? 0 : 1];
      (wanted && !wanted.disabled ? wanted : buttons[0])?.focus();
    } catch (e) {
      toast(`Could not reorder. ${e.message}`, { kind: 'error' });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function remove(asset, index) {
    const ok = await confirmDialog({
      title: 'Remove this image?',
      message: 'The image is removed from this case and its file is deleted. This cannot be undone.',
      confirmLabel: 'Remove image', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const rows = await run(() => client.from(TABLE).delete().eq('id', asset.id).select('id'));
      if (!rows.length) throw new Error('The image was not removed. It may already be gone, or you may not have permission.');
      assets = assets.filter((a) => a.id !== asset.id);
      changed = true;
      await syncLegacyCover();
      // Delete the file only once nothing (row or legacy cover) points at it.
      const cover = getProject()?.image_url;
      if (asset.bucket === IMAGE_BUCKET && asset.storage_path && !(cover && cover === urlOf(asset))) {
        removeObjects([asset.storage_path]);
      }
      render();
      announce(`Removed image ${index + 1}.`);
    } catch (e) {
      toast(`Could not remove the image. ${e.message}`, { kind: 'error' });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(files) {
    const room = Math.max(MAX_ASSETS_PER_CASE - assets.length, 0);
    const picked = [...files];
    if (picked.length > room) toast(`A case can hold ${MAX_ASSETS_PER_CASE} images. Only the first ${room} will be added.`, { kind: 'info' });
    setBusy(true);
    let added = 0;
    try {
      for (const file of picked.slice(0, room)) {
        const problem = validateImageFile(file);
        if (problem) { toast(`${file.name}: ${problem}`, { kind: 'error' }); continue; }
        setStatus(`Uploading ${file.name}…`);
        const path = makeAssetPath(projectId, newId(), IMAGE_TYPES[file.type]);
        const { error: uploadError } = await call(() => client.storage.from(IMAGE_BUCKET)
          .upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false }));
        if (uploadError) { toast(`${file.name}: ${uploadError.message || 'Upload failed.'}`, { kind: 'error' }); continue; }
        const size = await imageSize(file);
        try {
          const rows = await run(() => client.from(TABLE).insert({
            portfolio_project_id: projectId, media_kind: 'image', role: defaultRoleFor(assets),
            bucket: IMAGE_BUCKET, storage_path: path, alt_text: '', caption: '',
            mime_type: file.type, byte_size: file.size, width: size.width, height: size.height,
            sort_order: nextSortOrder(assets),
          }).select(COLUMNS));
          assets = [...assets, rows[0]];
          added += 1;
        } catch (e) {
          removeObjects([path]); // do not leave an orphaned file behind
          toast(`${file.name}: could not save. ${e.message}`, { kind: 'error' });
        }
      }
      if (added) {
        changed = true;
        await syncLegacyCover();
        toast(`${added} ${added === 1 ? 'image' : 'images'} added. Add alt text so they are accessible.`, { kind: 'success' });
      }
    } catch (e) {
      toast(`Could not finish adding images. ${e.message}`, { kind: 'error' });
    } finally {
      setBusy(false);
      input.value = '';
      render();
    }
  }

  addBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files.length) addFiles(input.files); });

  // ---- public API ------------------------------------------------------------------------------
  return {
    /** Called whenever the editor opens or the Type select changes. */
    async show({ project, workType, ready }) {
      generation += 1;
      const visible = ready && workType === 'graphic_case';
      root.hidden = !visible;
      if (!visible) { assets = []; projectId = null; return; }
      if (!project) {
        projectId = null;
        assets = [];
        list.replaceChildren();
        addBtn.disabled = true;
        note.hidden = false;
        note.textContent = 'Save the project first, then add its logo, thumbnail, banner and other images here.';
        setStatus('');
        return;
      }
      projectId = project.id;
      note.hidden = true;
      addBtn.disabled = true;
      setStatus('Loading images…');
      await reload();
    },
    /** True once an asset was changed during this editing session. */
    hasChanges: () => changed,
    resetChanges: () => { changed = false; },
  };
}
