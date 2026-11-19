import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChannelInput, syncChannel, resolveChannel } from '../api/youtube/_youtube.js';
import { createHandler } from '../api/youtube/sync.js';

const UC = 'UC' + 'a'.repeat(22);
const vid = (n) => 'v'.repeat(10) + n;
const item = (id, privacy = 'public') => ({ id, snippet: { title: 'T ' + id, description: 'd', publishedAt: '2026-01-01T00:00:00Z', thumbnails: { high: { url: 'https://i.ytimg.com/' + id } } }, status: { privacyStatus: privacy } });

// Fake YouTube + PostgREST. Admin-owned columns live only in `videos`, to prove merge semantics.
function world({ yt, channel, videos = {}, failYt = null }) {
  const w = { channel: { sync_started_at: null, sync_finished_at: null, ...channel }, videos, urls: [], ytCalls: 0 };
  w.fetch = async (url, init = {}) => {
    w.urls.push(url);
    const u = new URL(url); const body = init.body ? JSON.parse(init.body) : null;
    const json = (d, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(d), json: async () => d });
    if (u.hostname === 'www.googleapis.com') {
      w.ytCalls += 1; if (failYt) return json({}, failYt);
      const ep = u.pathname.split('/').pop();
      if (ep === 'channels') return json({ items: [{ id: UC, snippet: { title: 'Chan', customUrl: '@chan' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
      if (ep === 'playlistItems') { const pages = yt.pages; const idx = Number(u.searchParams.get('pageToken') || 0); return json({ items: pages[idx].map((id) => ({ contentDetails: { videoId: id } })), nextPageToken: idx + 1 < pages.length ? String(idx + 1) : undefined }); }
      if (ep === 'videos') return json({ items: u.searchParams.get('id').split(',').filter((i) => yt.videos[i]).map((i) => yt.videos[i]) });
    }
    const t = u.pathname.split('/').pop();
    if (t === 'youtube_channels' && init.method === 'PATCH') {
      if (u.searchParams.get('or') && !(w.channel.sync_started_at === null || w.channel.sync_finished_at !== null)) return json([]);
      Object.assign(w.channel, body); return json([{ ...w.channel, id: 'c1' }]);
    }
    if (t === 'youtube_videos' && init.method === 'GET') return json(Object.keys(w.videos).map((id) => ({ youtube_video_id: id })));
    if (t === 'youtube_videos' && init.method === 'POST') {
      const keys = new Set(body.map((r) => Object.keys(r).join(','))); assert.equal(keys.size, 1, 'homogeneous batch');
      for (const r of body) w.videos[r.youtube_video_id] = { is_visible: true, featured: false, sort_order: 0, ...(w.videos[r.youtube_video_id] || {}), ...r };
      return json([]);
    }
    return json([]);
  };
  return w;
}
const deps = (w) => ({ fetchImpl: w.fetch, apiKey: 'SECRETKEY', supabaseUrl: 'https://s.co', serviceKey: 'svc', now: () => new Date('2026-06-01T00:00:00Z') });
const CH = { id: 'c1', channel_id: UC, uploads_playlist_id: 'UU1', is_active: true };

test('parses handles, ids and URLs; rejects others', () => {
  assert.deepEqual(parseChannelInput('@belal'), { kind: 'handle', value: '@belal' });
  assert.deepEqual(parseChannelInput('https://www.youtube.com/@belal/videos'), { kind: 'handle', value: '@belal' });
  assert.deepEqual(parseChannelInput(`youtube.com/channel/${UC}`), { kind: 'id', value: UC });
  assert.equal(parseChannelInput('https://evil.com/@belal'), null);
  assert.equal(parseChannelInput('javascript:alert(1)'), null);
});

test('imports across pages, preserves admin flags, hides private/removed', async () => {
  const a = vid(1), b = vid(2), c = vid(3);
  const w = world({ channel: CH, yt: { pages: [[a, b], [c]], videos: { [a]: item(a), [b]: item(b, 'private'), [c]: item(c) } },
    videos: { [c]: { is_visible: false, featured: true, sort_order: 7, privacy_status: 'public' }, [vid(9)]: { privacy_status: 'public' } } });
  const r = await syncChannel(deps(w), CH);
  assert.equal(r.error, undefined);
  assert.equal(w.videos[c].is_visible, false); assert.equal(w.videos[c].featured, true); assert.equal(w.videos[c].sort_order, 7);
  assert.equal(w.videos[b].privacy_status, 'private');
  assert.equal(w.videos[vid(9)].privacy_status, 'unavailable', 'known video missing on YouTube becomes unavailable, row kept');
  assert.equal(w.videos[a].is_visible, true);
  assert.ok(w.channel.last_success_at && w.channel.last_error_code === null && w.channel.sync_finished_at);
});

test('busy channel is skipped; failure keeps data, records a safe code, releases lock', async () => {
  const busy = world({ channel: { ...CH, sync_started_at: '2026-06-01T00:00:00Z' }, yt: { pages: [[]], videos: {} } });
  assert.deepEqual(await syncChannel(deps(busy), CH), { skipped: 'busy_or_inactive' });
  const w = world({ channel: CH, yt: { pages: [[]], videos: {} }, failYt: 403, videos: { [vid(1)]: { privacy_status: 'public' } } });
  const r = await syncChannel(deps(w), CH);
  assert.deepEqual(r, { error: 'youtube_quota_or_forbidden' });
  assert.equal(w.channel.last_error_code, 'youtube_quota_or_forbidden'); assert.ok(w.channel.sync_finished_at);
  assert.equal(w.videos[vid(1)].privacy_status, 'public');
});

test('stops scanning once a full page is already known', async () => {
  const known = {}; const ids = [vid(1), vid(2)]; ids.forEach((i) => { known[i] = { privacy_status: 'public' }; });
  const w = world({ channel: CH, yt: { pages: [ids, [vid(3)]], videos: { [vid(1)]: item(vid(1)), [vid(2)]: item(vid(2)) } }, videos: known });
  await syncChannel(deps(w), CH);
  assert.equal(w.urls.filter((u) => u.includes('playlistItems')).length, 1);
});

test('API key never appears in anything stored or returned', async () => {
  const w = world({ channel: CH, yt: { pages: [[]], videos: {} }, failYt: 500 });
  const r = await syncChannel(deps(w), CH);
  assert.ok(!JSON.stringify([r, w.channel, w.videos]).includes('SECRETKEY'));
  const ch = await resolveChannel(deps(world({ channel: CH, yt: {} })), '@chan');
  assert.equal(ch.channel_id, UC);
});

function call(handler, { method = 'POST', headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, status(s) { this.code = s; return this; }, setHeader(k, v) { this.headers[k] = v; return this; }, json(d) { resolve({ code: this.code, d }); } };
    handler({ method, headers, body }, res);
  });
}
test('handler: cron secret and admin checks', async () => {
  const env = { YOUTUBE_DATA_API_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: 'https://s.co', SUPABASE_SERVICE_ROLE_KEY: 's', SUPABASE_PUBLISHABLE_KEY: 'p', CRON_SECRET: 'sekret' };
  const w = world({ channel: CH, yt: { pages: [[]], videos: {} } });
  const fetchImpl = async (url, init) => (String(url).includes('portfolio_admin_status')
    ? { ok: true, json: async () => [{ is_admin: init.headers.authorization === 'Bearer good' }] } : w.fetch(url, init));
  const h = createHandler({ env, fetchImpl });
  assert.equal((await call(h, { method: 'GET' })).code, 401);
  assert.equal((await call(h, { method: 'GET', headers: { authorization: 'Bearer wrong!' } })).code, 401);
  assert.equal((await call(h, { method: 'POST', headers: { authorization: 'Bearer bad' }, body: { action: 'sync' } })).code, 401);
  assert.equal((await call(h, { method: 'POST', headers: { authorization: 'Bearer good' }, body: { action: 'sync', channelId: 'nope' } })).code, 400);
  assert.equal((await call(h, { method: 'POST', headers: { authorization: 'Bearer good' }, body: { action: 'x' } })).code, 400);
  assert.equal((await call(h, { method: 'PUT' })).code, 405);
  assert.equal((await call(createHandler({ env: {}, fetchImpl }), { method: 'GET' })).code, 500);
});
