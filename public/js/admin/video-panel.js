// Edited-video manager: one MP4 (<= 50 MB) plus an optional poster image per
// "Edited video" item. Stored as portfolio_assets rows (video in the
// portfolio-videos bucket, poster in portfolio-images). Like the case-images
// panel, changes here are written immediately. The upload uses XMLHttpRequest so
// the admin gets real progress, cancel and retry.

import { $, h, newId, announce } from './dom.js';
import { client, config, run, call } from './api.js';
import { toast, confirmDialog } from './ui.js';
import { validateImageFile, IMAGE_BUCKET, IMAGE_TYPES } from './validators.js';
import { removeObjects } from './images.js';
import {
  VIDEO_BUCKET, VIDEO_MAX_BYTES, validateVideoFile, makeVideoPath, makeAssetPath, pickVideoAsset,
  storagePublicUrl, coverSyncPlan,
} from '../site/asset-model.js';

const TABLE = 'portfolio_assets';
const COLUMNS = 'id, portfolio_project_id, media_kind, role, bucket, storage_path, external_url, alt_text, caption, mime_type, byte_size, sort_order, created_at';

/** Upload with progress. Resolves on success; rejects with Error (message is user-facing). */
function xhrUpload({ bucket, path, file, token, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    xhr.open('POST', `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`);
    xhr.setRequestHeader('apikey', config.publishableKey);
    xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=31536000');
    xhr.setRequestHeader('content-type', file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const error = new Error(
        xhr.status === 413 ? 'The file is larger than the allowed limit.'
          : xhr.status === 415 || xhr.status === 400 ? 'The server rejected this file (type or size).'
            : xhr.status === 401 || xhr.status === 403 ? 'Not allowed. Sign in again.' : `Upload failed (${xhr.status}).`);
      error.status = xhr.status;
      reject(error);
    };
    xhr.onerror = () => reject(new Error('Network error during upload. Try again.'));
    xhr.onabort = () => { const e = new Error('Upload cancelled.'); e.cancelled = true; reject(e); };
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

async function token() {
  const { data } = await client.auth.getSession();
  return data?.session?.access_token || '';
}

export function initVideoPanel({ getProject, syncCover }) {
  const root = $('#videoSection');
  const note = $('#videoNote');
  const body = $('#videoBody');
  const status = $('#videoStatus');

  let assets = [];
  let projectId = null;
  let busy = false;
  let changed = false;
  let generation = 0;
  let abort = null;
  let progress = null; // { name, ratio } while uploading

  const setStatus = (m) => { status.textContent = m || ''; };
  const video = () => pickVideoAsset(assets);
  const poster = () => assets.find((a) => a.media_kind === 'image' && a.role === 'poster') || null;
  const urlOf = (a) => a && (a.external_url || storagePublicUrl(config.supabaseUrl, a.bucket, a.storage_path));

  // ---- rendering ----------------------------------------------------------------------------
  function render() {
    const v = video(); const p = poster();
    const children = [];

    if (progress) {
      children.push(h('div', { class: 'video-progress', role: 'group', 'aria-label': 'Upload progress' },
        h('progress', { max: 100, value: Math.round(progress.ratio * 100), 'aria-label': `Uploading ${progress.name}` }),
        h('span', { class: 'hint' }, `${progress.name}: ${Math.round(progress.ratio * 100)}%`),
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => abort?.abort() }, 'Cancel upload')));
    }

    if (v) {
      const url = urlOf(v);
      const playError = h('p', { class: 'field-error', hidden: true, role: 'alert' },
        'This browser cannot play this file. Re-export it as MP4 (H.264 video, AAC audio) before publishing.');
      const player = h('video', { controls: true, preload: 'metadata', playsinline: true, class: 'video-player', 'aria-label': 'Preview of the uploaded video' });
      if (p && urlOf(p)) player.poster = urlOf(p);
      player.addEventListener('error', () => { playError.hidden = false; });
      player.src = url;
      children.push(player, playError,
        h('p', { class: 'hint' }, `${((v.byte_size || 0) / 1048576).toFixed(1)} MB · ${v.mime_type || 'video/mp4'}. Play it above to check it before you publish.`));
    } else if (!progress) {
      children.push(h('p', { class: 'hint' }, 'No video uploaded yet.'));
    }

    children.push(h('div', { class: 'image-buttons' },
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: busy, onclick: () => $('#videoFile').click() }, v ? 'Replace video' : 'Upload video'),
      v ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: busy, onclick: () => removeVideo(v) }, 'Remove video') : null,
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: busy, onclick: () => $('#posterFile').click() }, p ? 'Replace poster' : 'Upload poster'),
      p ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: busy, onclick: () => removePoster(p) }, 'Remove poster') : null));
    if (p && urlOf(p)) children.push(h('img', { class: 'video-poster-thumb', src: urlOf(p), alt: 'Poster image', loading: 'lazy' }));
    body.replaceChildren(...children);
  }

  async function reload() {
    const mine = generation;
    try {
      const rows = await run(() => client.from(TABLE).select(COLUMNS).eq('portfolio_project_id', projectId)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true }));
      if (mine !== generation) return;
      assets = rows;
      render();
      setStatus('Changes here are saved immediately.');
    } catch (e) {
      if (mine !== generation) return;
      body.replaceChildren();
      note.hidden = false;
      note.textContent = e.missing ? 'Videos need the latest database migration. Apply it and refresh.' : `Could not load the video. ${e.message}`;
    }
  }

  async function syncLegacyCover() {
    const project = getProject();
    if (!project) return;
    const plan = coverSyncPlan({ currentUrl: project.image_url, assets, supabaseUrl: config.supabaseUrl, bucket: IMAGE_BUCKET, projectId: project.id });
    if (!plan.change) return;
    const rows = await run(() => client.from('portfolio_projects').update({ image_url: plan.url }).eq('id', project.id).select('id'));
    if (!rows.length) throw new Error('The cover image could not be updated.');
    syncCover(plan.url);
  }

  // ---- actions ---------------------------------------------------------------------------------------
  async function uploadVideo(file) {
    const problem = validateVideoFile(file);
    if (problem) { toast(`${file.name}: ${problem}`, { kind: 'error' }); return; }
    const previous = video();
    const path = makeVideoPath(projectId, newId());
    busy = true; abort = new AbortController(); progress = { name: file.name, ratio: 0 }; render();
    setStatus('Uploading…');
    let uploaded = false;
    try {
      const send = async () => xhrUpload({
        bucket: VIDEO_BUCKET, path, file, token: await token(), signal: abort.signal,
        onProgress: (ratio) => { progress.ratio = ratio; const bar = body.querySelector('progress'); if (bar) { bar.value = Math.round(ratio * 100); bar.nextSibling.textContent = `${file.name}: ${Math.round(ratio * 100)}%`; } },
      });
      try { await send(); } catch (e) {
        if (e.status !== 401) throw e;
        const { error } = await client.auth.refreshSession(); // one retry after a token refresh
        if (error) throw e;
        await send();
      }
      uploaded = true;
      const rows = await run(() => client.from(TABLE).insert({
        portfolio_project_id: projectId, media_kind: 'video', role: 'edited_video', bucket: VIDEO_BUCKET, storage_path: path,
        mime_type: file.type, byte_size: file.size, alt_text: '', caption: '', sort_order: 0,
      }).select(COLUMNS));
      if (previous) {
        // Replace: drop the old row, then its file (only after the new one is saved).
        await run(() => client.from(TABLE).delete().eq('id', previous.id).select('id'));
        call(() => client.storage.from(VIDEO_BUCKET).remove([previous.storage_path])).catch(() => {});
      }
      changed = true;
      toast('Video uploaded. Play it to check before you publish.', { kind: 'success' });
      announce('Video uploaded.');
    } catch (e) {
      if (uploaded) call(() => client.storage.from(VIDEO_BUCKET).remove([path])).catch(() => {}); // no orphan if the row failed
      if (!e.cancelled) toast(`Could not upload the video. ${e.message}`, { kind: 'error' });
      else toast('Upload cancelled.', { kind: 'info' });
    } finally {
      busy = false; abort = null; progress = null; $('#videoFile').value = '';
      await reload();
    }
  }

  async function removeVideo(v) {
    const ok = await confirmDialog({ title: 'Remove this video?', message: 'The video file is deleted and the item will have no video. This cannot be undone.', confirmLabel: 'Remove video', danger: true });
    if (!ok) return;
    busy = true; render();
    try {
      const rows = await run(() => client.from(TABLE).delete().eq('id', v.id).select('id'));
      if (!rows.length) throw new Error('Not removed. You may not have permission.');
      call(() => client.storage.from(VIDEO_BUCKET).remove([v.storage_path])).catch(() => {});
      changed = true; announce('Video removed.');
    } catch (e) { toast(`Could not remove the video. ${e.message}`, { kind: 'error' }); }
    busy = false; await reload();
  }

  async function uploadPoster(file) {
    const problem = validateImageFile(file);
    if (problem) { toast(`${file.name}: ${problem}`, { kind: 'error' }); return; }
    const previous = poster();
    const path = makeAssetPath(projectId, newId(), IMAGE_TYPES[file.type]);
    busy = true; render(); setStatus('Uploading poster…');
    try {
      const { error } = await call(() => client.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false }));
      if (error) throw new Error(error.message || 'Upload failed.');
      try {
        const rows = await run(() => client.from(TABLE).insert({
          portfolio_project_id: projectId, media_kind: 'image', role: 'poster', bucket: IMAGE_BUCKET, storage_path: path,
          mime_type: file.type, byte_size: file.size, alt_text: '', caption: '', sort_order: 1,
        }).select(COLUMNS));
        assets = [...assets.filter((a) => a.id !== previous?.id), rows[0]];
      } catch (e) { removeObjects([path]); throw e; }
      if (previous) {
        await run(() => client.from(TABLE).delete().eq('id', previous.id).select('id'));
        removeObjects([previous.storage_path]);
      }
      changed = true;
      await syncLegacyCover();
      toast('Poster saved.', { kind: 'success' });
    } catch (e) { toast(`Could not save the poster. ${e.message}`, { kind: 'error' }); }
    busy = false; $('#posterFile').value = ''; await reload();
  }

  async function removePoster(p) {
    busy = true; render();
    try {
      const rows = await run(() => client.from(TABLE).delete().eq('id', p.id).select('id'));
      if (!rows.length) throw new Error('Not removed. You may not have permission.');
      assets = assets.filter((a) => a.id !== p.id);
      changed = true;
      await syncLegacyCover();
      const cover = getProject()?.image_url;
      if (!(cover && cover === urlOf(p))) removeObjects([p.storage_path]);
    } catch (e) { toast(`Could not remove the poster. ${e.message}`, { kind: 'error' }); }
    busy = false; await reload();
  }

  $('#videoFile').addEventListener('change', (e) => { if (e.target.files[0]) uploadVideo(e.target.files[0]); });
  $('#posterFile').addEventListener('change', (e) => { if (e.target.files[0]) uploadPoster(e.target.files[0]); });

  return {
    async show({ project, workType, ready }) {
      generation += 1;
      abort?.abort();
      const visible = ready && workType === 'edited_video';
      root.hidden = !visible;
      if (!visible) { assets = []; projectId = null; return; }
      if (!project) {
        projectId = null; assets = []; body.replaceChildren();
        note.hidden = false; note.textContent = 'Save the item first, then upload its video here.'; setStatus('');
        return;
      }
      projectId = project.id; note.hidden = true; setStatus('Loading…');
      await reload();
    },
    hasChanges: () => changed,
    resetChanges: () => { changed = false; },
    isUploading: () => Boolean(progress),
  };
}
