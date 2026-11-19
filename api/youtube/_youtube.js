// Pure-ish YouTube sync logic (no Vercel types). All network access goes through
// the injected `fetchImpl`, so it is unit-tested with a fake. The API key is only
// ever placed in a request URL inside this module and is never logged or returned.

const API = 'https://www.googleapis.com/youtube/v3';
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_RE = /^@[A-Za-z0-9._-]{3,100}$/;
export const MAX_PAGES_PER_RUN = 10; // 10 x 50 = 500 newest uploads per run
export const RECONCILE_BATCH = 150; // known videos re-checked per run
export const LOCK_MINUTES = 10;

/** Typed error whose `code` is the only thing ever stored or sent to clients. */
export class SyncError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** Accepts @handle, UC… id, or a youtube.com/@handle | /channel/UC… URL. */
export function parseChannelInput(raw) {
  const text = String(raw ?? '').trim();
  if (!text || text.length > 300) return null;
  if (CHANNEL_ID_RE.test(text)) return { kind: 'id', value: text };
  if (HANDLE_RE.test(text)) return { kind: 'handle', value: text };
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (!/^(www\.|m\.)?youtube\.com$/i.test(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] && HANDLE_RE.test(decodeURIComponent(parts[0]))) return { kind: 'handle', value: decodeURIComponent(parts[0]) };
  if (parts[0] === 'channel' && CHANNEL_ID_RE.test(parts[1] || '')) return { kind: 'id', value: parts[1] };
  return null;
}

// Maps Google's error reason to a fixed, sanitized code. Only the code is kept; the body is never stored or returned.
async function classifyGoogleError(res) {
  let reasons = '';
  try {
    const body = await res.json();
    const parts = [...(body?.error?.errors || []).map((e) => e?.reason), ...(body?.error?.details || []).map((d) => d?.reason), body?.error?.status];
    reasons = parts.filter((p) => typeof p === 'string').join(' ');
  } catch { /* unreadable body: fall through to the status-based code */ }
  if (/quotaExceeded|rateLimitExceeded|dailyLimitExceeded|RATE_LIMIT_EXCEEDED|RESOURCE_EXHAUSTED/i.test(reasons) || res.status === 429) return 'youtube_quota_exceeded';
  if (/accessNotConfigured|SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED|serviceDisabled/i.test(reasons)) return 'youtube_api_not_enabled';
  if (/REFERRER_BLOCKED|IP_ADDRESS_BLOCKED|ipRefererBlocked|forbidden/i.test(reasons)) return 'youtube_key_restricted';
  if (/keyInvalid|API_KEY_INVALID|badRequest|INVALID_ARGUMENT/i.test(reasons) || res.status === 400 || res.status === 401) return 'youtube_key_invalid';
  return 'youtube_quota_or_forbidden';
}

async function ytGet(deps, endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', deps.apiKey);
  let res;
  try { res = await deps.fetchImpl(url.toString(), { headers: { accept: 'application/json' } }); }
  catch { throw new SyncError('youtube_network'); }
  if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 429) {
    throw new SyncError(await classifyGoogleError(res));
  }
  if (res.status === 404) throw new SyncError('youtube_not_found');
  if (!res.ok) throw new SyncError('youtube_error');
  return res.json();
}

/** Looks a channel up by id or handle. Returns the fields we store, or throws SyncError('channel_not_found'). */
export async function resolveChannel(deps, input) {
  const parsed = parseChannelInput(input);
  if (!parsed) throw new SyncError('invalid_channel_input');
  const data = await ytGet(deps, 'channels', {
    part: 'snippet,contentDetails',
    ...(parsed.kind === 'id' ? { id: parsed.value } : { forHandle: parsed.value }),
  });
  const item = data.items?.[0];
  if (!item || !CHANNEL_ID_RE.test(item.id || '')) throw new SyncError('channel_not_found');
  return {
    channel_id: item.id,
    handle: item.snippet?.customUrl && String(item.snippet.customUrl).startsWith('@') ? item.snippet.customUrl.slice(0, 100) : (parsed.kind === 'handle' ? parsed.value : null),
    display_name: String(item.snippet?.title || '').slice(0, 200),
    uploads_playlist_id: item.contentDetails?.relatedPlaylists?.uploads || null,
    thumbnail_url: pickThumb(item.snippet?.thumbnails),
  };
}

function pickThumb(thumbs) {
  const url = thumbs?.high?.url || thumbs?.medium?.url || thumbs?.default?.url || null;
  return url && /^https:\/\//i.test(url) && url.length <= 500 ? url : null;
}

const PRIVACY = new Set(['public', 'unlisted', 'private']);

/** Maps one videos.list item to the columns the sync job owns. */
export function videoRow(item, channelRef, nowIso) {
  return {
    youtube_video_id: item.id,
    channel_ref: channelRef,
    title: String(item.snippet?.title || '').slice(0, 300),
    description: String(item.snippet?.description || '').slice(0, 6000),
    published_at: item.snippet?.publishedAt || null,
    thumbnail_url: pickThumb(item.snippet?.thumbnails),
    privacy_status: PRIVACY.has(item.status?.privacyStatus) ? item.status.privacyStatus : 'private',
    last_synced_at: nowIso,
    // is_visible / featured / sort_order are deliberately absent: admin-owned.
  };
}

async function fetchVideoItems(deps, ids) {
  const found = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const data = await ytGet(deps, 'videos', { part: 'snippet,status', id: ids.slice(i, i + 50).join(','), maxResults: '50' });
    for (const item of data.items || []) if (/^[A-Za-z0-9_-]{11}$/.test(item.id || '')) found.set(item.id, item);
  }
  return found;
}

// ---- PostgREST access (service role, server only) --------------------------------------------------------------
function rest(deps) {
  const base = `${deps.supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
  const headers = { apikey: deps.serviceKey, authorization: `Bearer ${deps.serviceKey}`, 'content-type': 'application/json' };
  return async (method, path, body, prefer) => {
    const res = await deps.fetchImpl(`${base}/${path}`, {
      method, headers: { ...headers, ...(prefer ? { prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new SyncError('database_error');
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  };
}

/**
 * Syncs one channel row ({ id, channel_id, uploads_playlist_id, ... }).
 * Returns { imported, updated, unavailable }. Never deletes anything and never
 * writes is_visible / featured / sort_order. A failure records a sanitized code.
 */
export async function syncChannel(deps, channel) {
  const db = rest(deps);
  const now = () => (deps.now ? deps.now() : new Date()).toISOString();
  const cutoff = new Date(Date.parse(now()) - LOCK_MINUTES * 60000).toISOString();

  // Claim: free when never started, finished, or the last claim is stale. Atomic in one PATCH.
  const claimed = await db('PATCH',
    `youtube_channels?id=eq.${encodeURIComponent(channel.id)}&is_active=eq.true&or=(sync_started_at.is.null,sync_finished_at.not.is.null,sync_started_at.lt.${cutoff})`,
    { sync_started_at: now(), sync_finished_at: null }, 'return=representation');
  if (!claimed.length) return { skipped: 'busy_or_inactive' };
  const row = claimed[0];

  try {
    let playlist = row.uploads_playlist_id;
    if (!playlist) {
      playlist = (await resolveChannel(deps, row.channel_id)).uploads_playlist_id;
      if (!playlist) throw new SyncError('no_uploads_playlist');
    }
    const known = new Set((await db('GET', `youtube_videos?select=youtube_video_id&channel_ref=eq.${row.id}&limit=5000`)).map((v) => v.youtube_video_id));

    // Newest-first scan; stop once a whole page is already known (incremental).
    const seen = [];
    let pageToken = '';
    for (let page = 0; page < MAX_PAGES_PER_RUN; page += 1) {
      const data = await ytGet(deps, 'playlistItems', {
        part: 'contentDetails', playlistId: playlist, maxResults: '50', ...(pageToken ? { pageToken } : {}),
      });
      const ids = (data.items || []).map((i) => i.contentDetails?.videoId).filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id || ''));
      seen.push(...ids);
      pageToken = data.nextPageToken || '';
      if (!pageToken || (ids.length && ids.every((id) => known.has(id)))) break;
    }

    // Bounded reconcile of known videos not seen this run (detects privacy changes/removals).
    const stale = (await db('GET',
      `youtube_videos?select=youtube_video_id&channel_ref=eq.${row.id}&order=last_synced_at.asc.nullsfirst&limit=${RECONCILE_BATCH}`))
      .map((v) => v.youtube_video_id).filter((id) => !seen.includes(id));

    const wanted = [...new Set([...seen, ...stale])];
    const items = await fetchVideoItems(deps, wanted);
    const stamp = now();
    const rows = [];
    let unavailable = 0;
    for (const id of wanted) {
      const item = items.get(id);
      if (item) rows.push(videoRow(item, row.id, stamp));
      else if (known.has(id)) {
        // Gone from YouTube: keep the row (admin history) but make it non-renderable.
        rows.push({ youtube_video_id: id, channel_ref: row.id, privacy_status: 'unavailable', last_synced_at: stamp });
        unavailable += 1;
      }
    }
    // Two homogeneous batches: PostgREST needs identical keys per bulk insert, and the
    // "unavailable" rows must only touch privacy_status / last_synced_at on conflict.
    for (const group of [rows.filter((r) => 'title' in r), rows.filter((r) => !('title' in r))]) {
      for (let i = 0; i < group.length; i += 100) {
        await db('POST', 'youtube_videos?on_conflict=youtube_video_id', group.slice(i, i + 100), 'resolution=merge-duplicates,return=minimal');
      }
    }
    const imported = rows.filter((r) => r.privacy_status !== 'unavailable' && !known.has(r.youtube_video_id)).length;

    await db('PATCH', `youtube_channels?id=eq.${row.id}`, {
      uploads_playlist_id: playlist, sync_finished_at: now(), last_success_at: now(), last_error_code: null,
    });
    return { imported, updated: rows.length - imported - unavailable, unavailable };
  } catch (error) {
    const code = error instanceof SyncError ? error.code : 'sync_failed';
    // A failed sync must not erase anything; just record the outcome and release the lock.
    await db('PATCH', `youtube_channels?id=eq.${row.id}`, { sync_finished_at: now(), last_error_code: code }).catch(() => {});
    return { error: code };
  }
}

export async function syncAll(deps, onlyChannelId = null) {
  const db = rest(deps);
  const filter = onlyChannelId ? `&id=eq.${encodeURIComponent(onlyChannelId)}` : '';
  const channels = await db('GET', `youtube_channels?select=id,channel_id,uploads_playlist_id&is_active=eq.true${filter}`);
  const results = [];
  for (const channel of channels) results.push({ id: channel.id, ...(await syncChannel(deps, channel)) });
  return results;
}
