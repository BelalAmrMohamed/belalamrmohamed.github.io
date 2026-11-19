// Videos tab: connect/disconnect/delete YouTube channels, sync now, and
// hide / feature individual imported videos. Imports run on the server
// (/api/youtube/sync); this module only reads and edits the cached rows,
// which RLS limits to admins.

import { $, h, timeAgo, announce } from './dom.js';
import { client, run } from './api.js';
import { toast, confirmDialog, stateBlock, setBusy } from './ui.js';

const PAGE = 50;
const ERROR_TEXT = {
  invalid_channel_input: 'Enter a @handle, a channel ID (UC…) or a youtube.com channel link.',
  channel_not_found: 'No channel was found for that input.',
  youtube_quota_or_forbidden: 'YouTube refused the request (quota or API key restriction).',
  youtube_bad_request: 'YouTube rejected the request. Check the API key.',
  youtube_network: 'Could not reach YouTube.',
  youtube_error: 'YouTube returned an error.',
  not_configured: 'The sync service is not configured (missing server environment variables).',
  database_error: 'The database rejected the sync write.',
  unauthorized: 'Your session is not allowed to sync. Sign in again.',
};
const explain = (code) => ERROR_TEXT[code] || `Sync failed (${code || 'unknown'}).`;

async function callApi(payload) {
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  let res;
  try {
    res = await fetch('/api/youtube/sync', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
    });
  } catch { throw new Error('Network error. Check your connection.'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(explain(body.error));
  return body;
}

export function initYoutube() {
  const stateBox = $('#ytState');
  const form = $('#ytAddForm');
  const input = $('#ytInput');
  const preview = $('#ytPreview');
  const channelList = $('#ytChannels');
  const filter = $('#ytChannelFilter');
  const videoList = $('#ytVideos');
  const moreBtn = $('#ytMoreBtn');
  const videoState = $('#ytVideoState');

  let channels = [];
  let resolved = null;
  let videos = [];
  let hasMore = false;
  let loaded = false;

  // ---- channels ----------------------------------------------------------------------------
  function channelRow(c) {
    const status = c.last_error_code ? `Last sync failed: ${explain(c.last_error_code)}`
      : c.last_success_at ? `Synced ${timeAgo(c.last_success_at)}` : 'Not synced yet';
    const act = (label, fn, extra = {}) => h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: (e) => fn(e.currentTarget), ...extra }, label);
    return h('li', { class: 'yt-channel' },
      h('div', { class: 'yt-channel-main' },
        h('strong', {}, c.display_name || c.channel_id),
        h('span', { class: `badge ${c.is_active ? 'badge-public' : 'badge-private'}` }, c.is_active ? 'Connected' : 'Disconnected'),
        h('p', { class: 'hint' }, [c.handle, c.channel_id].filter(Boolean).join(' · ')),
        h('p', { class: c.last_error_code ? 'field-error' : 'hint' }, status)),
      h('div', { class: 'yt-actions' },
        c.is_active ? act('Sync now', (b) => syncNow(c, b)) : null,
        act(c.is_active ? 'Disconnect' : 'Reconnect', () => setActive(c, !c.is_active)),
        act('Delete', () => purge(c))));
  }

  function renderChannels() {
    channelList.replaceChildren(...channels.map(channelRow));
    $('#ytNoChannels').hidden = channels.length > 0;
    filter.replaceChildren(h('option', { value: '' }, 'All channels'),
      ...channels.map((c) => h('option', { value: c.id }, c.display_name || c.channel_id)));
  }

  async function loadChannels() {
    channels = await run(() => client.from('youtube_channels').select('*').order('created_at', { ascending: true }));
    renderChannels();
  }

  async function syncNow(channel, button) {
    setBusy(button, true, 'Syncing…');
    try {
      const { results } = await callApi({ action: 'sync', channelId: channel.id });
      const r = results?.[0] || {};
      if (r.error) toast(explain(r.error), { kind: 'error' });
      else if (r.skipped) toast('A sync for this channel is already running.', { kind: 'info' });
      else toast(`Synced: ${r.imported} new, ${r.updated} updated, ${r.unavailable} unavailable.`, { kind: 'success' });
      await Promise.all([loadChannels(), loadVideos(true)]);
    } catch (e) { toast(e.message, { kind: 'error' }); } finally { setBusy(button, false); }
  }

  async function setActive(channel, active) {
    try {
      const rows = await run(() => client.from('youtube_channels').update({ is_active: active }).eq('id', channel.id).select('id'));
      if (!rows.length) throw new Error('Not updated. You may not have permission.');
      toast(active ? 'Channel reconnected.' : 'Channel disconnected. Its videos are hidden from the site and kept.', { kind: 'success' });
      await Promise.all([loadChannels(), loadVideos(true)]);
    } catch (e) { toast(e.message, { kind: 'error' }); }
  }

  async function purge(channel) {
    const ok = await confirmDialog({
      title: `Delete “${channel.display_name || channel.channel_id}”?`,
      message: 'This permanently deletes the channel and every imported video row for it, including your hide/feature choices. Videos on YouTube are not affected. To keep the data, use Disconnect instead.',
      confirmLabel: 'Delete channel and videos', danger: true,
    });
    if (!ok) return;
    try {
      const rows = await run(() => client.from('youtube_channels').delete().eq('id', channel.id).select('id'));
      if (!rows.length) throw new Error('Not deleted. You may not have permission.');
      toast('Channel deleted.', { kind: 'success' });
      await Promise.all([loadChannels(), loadVideos(true)]);
    } catch (e) { toast(e.message, { kind: 'error' }); }
  }

  // ---- add flow: resolve on the server, show it, then connect -------------------------------------
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#ytLookupBtn');
    preview.replaceChildren(); resolved = null;
    setBusy(button, true, 'Looking up…');
    try {
      const { channel } = await callApi({ action: 'resolve', input: input.value });
      resolved = { ...channel, submitted_input: input.value.trim().slice(0, 300) };
      const exists = channels.some((c) => c.channel_id === channel.channel_id);
      preview.replaceChildren(
        h('p', { role: 'status' }, 'Found: ', h('strong', {}, channel.display_name || channel.channel_id), ` (${channel.channel_id})`),
        exists
          ? h('p', { class: 'hint' }, 'This channel is already in your list.')
          : h('button', { class: 'btn btn-default btn-sm', type: 'button', onclick: (e) => connect(e.currentTarget) }, 'Connect this channel'));
    } catch (e) {
      preview.replaceChildren(h('p', { class: 'field-error', role: 'alert' }, e.message));
    } finally { setBusy(button, false); }
  });

  async function connect(button) {
    if (!resolved) return;
    setBusy(button, true, 'Connecting…');
    try {
      const rows = await run(() => client.from('youtube_channels').insert({
        channel_id: resolved.channel_id, handle: resolved.handle, submitted_input: resolved.submitted_input,
        display_name: resolved.display_name, uploads_playlist_id: resolved.uploads_playlist_id,
        sort_order: channels.length,
      }).select('*'));
      toast('Channel connected. Importing videos…', { kind: 'success' });
      input.value = ''; preview.replaceChildren(); resolved = null;
      await loadChannels();
      const created = channels.find((c) => c.id === rows[0].id);
      if (created) await syncNow(created, button);
    } catch (e) { toast(`Could not connect. ${e.message}`, { kind: 'error' }); setBusy(button, false); }
  }

  // ---- videos --------------------------------------------------------------------------------------------------
  function videoRow(v) {
    const update = async (patch, control) => {
      control.disabled = true;
      try {
        const rows = await run(() => client.from('youtube_videos').update(patch).eq('id', v.id).select('id'));
        if (!rows.length) throw new Error('Not updated. You may not have permission.');
        Object.assign(v, patch); announce('Saved.');
      } catch (e) { toast(e.message, { kind: 'error' }); control.checked = !control.checked; } finally { control.disabled = false; }
    };
    const check = (label, key) => h('label', { class: 'dashboard-checkbox' },
      h('input', { type: 'checkbox', checked: Boolean(v[key]), 'aria-label': `${label}: ${v.title}`, onchange: (e) => update({ [key]: e.target.checked }, e.target) }),
      h('span', {}, label));
    const notPublic = v.privacy_status !== 'public';
    return h('li', { class: 'yt-video' },
      v.thumbnail_url ? h('img', { src: v.thumbnail_url, alt: '', loading: 'lazy', width: 96, height: 54 }) : h('span', { class: 'yt-nothumb' }),
      h('div', { class: 'yt-video-main' },
        h('strong', {}, v.title || v.youtube_video_id),
        h('p', { class: 'hint' }, notPublic ? `Not shown: YouTube status is ${v.privacy_status}` : (v.published_at ? new Date(v.published_at).toLocaleDateString() : ''))),
      h('div', { class: 'yt-flags' }, check('Visible', 'is_visible'), check('Featured', 'featured')));
  }

  async function loadVideos(reset = true) {
    if (reset) videos = [];
    videoState.replaceChildren(reset ? stateBlock({ kind: 'loading', title: 'Loading videos…' }) : '');
    try {
      let q = client.from('youtube_videos').select('*').order('published_at', { ascending: false, nullsFirst: false })
        .range(videos.length, videos.length + PAGE - 1);
      if (filter.value) q = q.eq('channel_ref', filter.value);
      const rows = await run(() => q);
      videos = reset ? rows : [...videos, ...rows];
      hasMore = rows.length === PAGE;
      videoList.replaceChildren(...videos.map(videoRow));
      videoState.replaceChildren(videos.length ? '' : stateBlock({ kind: 'empty', title: 'No imported videos yet', message: 'Connect a channel and sync it.' }));
      moreBtn.hidden = !hasMore;
    } catch (e) {
      videoState.replaceChildren(stateBlock({ kind: 'error', title: 'Could not load videos', message: e.message, action: { label: 'Try again', onClick: () => loadVideos(true) } }));
    }
  }

  filter.addEventListener('change', () => loadVideos(true));
  moreBtn.addEventListener('click', () => loadVideos(false));

  return {
    async load() {
      stateBox.replaceChildren(stateBlock({ kind: 'loading', title: 'Loading channels…' }));
      try {
        await loadChannels();
        stateBox.replaceChildren();
        loaded = true;
        await loadVideos(true);
      } catch (e) {
        stateBox.replaceChildren(stateBlock({
          kind: 'error', title: 'Could not load channels',
          message: e.missing ? 'Apply the latest database migration, then refresh.' : e.message,
          action: { label: 'Try again', onClick: () => this.load() },
        }));
      }
    },
    isLoaded: () => loaded,
  };
}
