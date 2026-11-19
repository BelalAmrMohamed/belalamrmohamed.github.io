// =============================================================================
// api/youtube/sync.js
//   GET  /api/youtube/sync            Vercel Cron (Authorization: Bearer CRON_SECRET)
//   POST /api/youtube/sync            admin only (Authorization: Bearer <Supabase user JWT>)
//        { action: "sync", channelId?: uuid }   sync one or all active channels
//        { action: "resolve", input: string }   preview a channel before saving it
//
// Server-only env: YOUTUBE_DATA_API_KEY, CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY (used to ask the database
// whether the caller is an admin, exactly like the dashboard does).
// Errors returned to clients are short codes only.
// =============================================================================
import { timingSafeEqual } from 'node:crypto';
import { resolveChannel, syncAll, SyncError } from './_youtube.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

async function isAdmin(env, token, fetchImpl) {
  if (!token || !env.SUPABASE_PUBLISHABLE_KEY) return false;
  const res = await fetchImpl(`${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/portfolio_admin_status`, {
    method: 'POST', headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}',
  }).catch(() => null);
  if (!res || !res.ok) return false;
  const data = await res.json().catch(() => null);
  return Boolean(data?.[0]?.is_admin);
}

export function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    const send = (status, body) => { res.status(status).setHeader('cache-control', 'no-store'); res.json(body); };
    const missing = ['YOUTUBE_DATA_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !env[k]);
    if (missing.length) return send(500, { error: 'not_configured' });

    const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1] || '';
    const deps = {
      fetchImpl, apiKey: env.YOUTUBE_DATA_API_KEY, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    };

    try {
      if (req.method === 'GET') {
        if (!env.CRON_SECRET || !safeEqual(token, env.CRON_SECRET)) return send(401, { error: 'unauthorized' });
        return send(200, { results: await syncAll(deps) });
      }
      if (req.method !== 'POST') { res.setHeader('allow', 'GET, POST'); return send(405, { error: 'method_not_allowed' }); }
      if (!(await isAdmin(env, token, fetchImpl))) return send(401, { error: 'unauthorized' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (body.action === 'resolve') return send(200, { channel: await resolveChannel(deps, body.input) });
      if (body.action === 'sync') {
        if (body.channelId !== undefined && !UUID_RE.test(String(body.channelId))) return send(400, { error: 'invalid_channel' });
        return send(200, { results: await syncAll(deps, body.channelId || null) });
      }
      return send(400, { error: 'invalid_action' });
    } catch (error) {
      const code = error instanceof SyncError ? error.code : 'server_error';
      return send(code === 'channel_not_found' ? 404 : code === 'invalid_channel_input' ? 400 : 502, { error: code });
    }
  };
}

export default createHandler();
