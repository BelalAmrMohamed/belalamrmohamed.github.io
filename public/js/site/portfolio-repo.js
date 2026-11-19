// Shared public data access for every portfolio page (plan section 5).
// Browser-only, publishable key only. Never put a service-role key here.
// Public queries always filter on is_published + non-archived; RLS enforces the
// same rules server-side, so these filters are for efficiency, not security.

export const WORK_TYPES = Object.freeze({
  website: { label: 'Websites', path: '/websites' },
  app_tool: { label: 'Apps & Tools', path: '/apps-tools' },
  graphic_case: { label: 'Graphic Designs', path: '/graphic-designs' },
  ui_component: { label: 'UI Components', path: '/ui-components' },
  edited_video: { label: 'Videos', path: '/videos' },
});

const WORK_COLUMNS =
  'id, title, summary, category, project_url, github_url, image_url, featured, status, work_type, slug, sort_order, created_at';

let clientPromise = null;

export function getClient() {
  if (clientPromise) return clientPromise;
  const config = window.BELAL_PORTFOLIO_CONFIG || {};
  if (!window.supabase || !config.supabaseUrl || !config.publishableKey) {
    return Promise.reject(new Error('Portfolio Supabase configuration is missing.'));
  }
  clientPromise = Promise.resolve(
    window.supabase.createClient(config.supabaseUrl, config.publishableKey)
  );
  return clientPromise;
}

// Returns an absolute http(s) URL, a same-site relative path, or null.
export function safeUrl(value, { allowRelative = false } = {}) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\s*\/\//.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
    if (isRelative) return allowRelative ? trimmed : null;
    return parsed.href;
  } catch {
    return null;
  }
}

// Published, non-archived work items, optionally filtered by type / featured.
export async function fetchWorks({ workType = null, featuredOnly = false, limit = 60 } = {}) {
  const client = await getClient();
  let query = client
    .from('portfolio_projects')
    .select(WORK_COLUMNS)
    .eq('is_published', true)
    .neq('status', 'archived');
  if (workType) query = query.eq('work_type', workType);
  if (featuredOnly) query = query.eq('featured', true);
  const { data, error } = await query
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .order('title', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Featured items for the landing page, grouped client-side by work_type.
// Rows without a work_type (not yet classified) are skipped here; the
// landing page keeps its legacy Works section for those.
export async function fetchFeaturedByType(perType = 3) {
  const rows = await fetchWorks({ featuredOnly: true, limit: 60 });
  const groups = {};
  for (const row of rows) {
    if (!WORK_TYPES[row.work_type]) continue;
    (groups[row.work_type] ||= []);
    if (groups[row.work_type].length < perType) groups[row.work_type].push(row);
  }
  return groups;
}

// Ordered media for graphic cases. One bounded query for all parents (no N+1).
export async function fetchAssetsFor(projectIds) {
  if (!projectIds.length) return {};
  const client = await getClient();
  const { data, error } = await client
    .from('portfolio_assets')
    .select('id, portfolio_project_id, media_kind, role, bucket, storage_path, external_url, alt_text, caption, sort_order')
    .in('portfolio_project_id', projectIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  const byProject = {};
  for (const asset of data || []) (byProject[asset.portfolio_project_id] ||= []).push(asset);
  return byProject;
}

// Public URL for a managed upload, derived from the configured project.
export function assetUrl(asset) {
  if (asset.external_url) return safeUrl(asset.external_url);
  const config = window.BELAL_PORTFOLIO_CONFIG || {};
  if (!asset.storage_path || !asset.bucket || !config.supabaseUrl) return null;
  const encoded = asset.storage_path.split('/').map(encodeURIComponent).join('/');
  return `${config.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(asset.bucket)}/${encoded}`;
}

// Cosmetic site settings. Failures must never block page content.
export async function fetchSettings(keys) {
  const client = await getClient();
  const { data, error } = await client.from('portfolio_settings').select('key, value').in('key', keys);
  if (error) throw error;
  return Object.fromEntries((data || []).map(({ key, value }) => [key, value]));
}
