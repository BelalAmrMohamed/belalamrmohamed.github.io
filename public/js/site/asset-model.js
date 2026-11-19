// Pure helpers for portfolio_assets (no DOM, no network, no window access) so the
// public graphics page and the admin asset manager share one definition and the
// logic can be unit-tested with plain Node.

// Image roles an admin can assign to a graphic case. `edited_video` exists in the
// database CHECK for the later Videos phase and is intentionally not offered here.
export const IMAGE_ROLES = Object.freeze([
  'cover', 'gallery', 'logo', 'youtube_thumbnail', 'opengraph', 'social_banner', 'poster',
]);

export const ROLE_LABELS = Object.freeze({
  cover: 'Cover',
  gallery: 'Image',
  logo: 'Logo',
  youtube_thumbnail: 'YouTube thumbnail',
  opengraph: 'Open Graph image',
  social_banner: 'Social banner',
  poster: 'Poster',
});

// Which asset represents a case on grids / as the legacy `image_url`.
export const COVER_ORDER = Object.freeze([
  'cover', 'logo', 'youtube_thumbnail', 'social_banner', 'opengraph', 'gallery', 'poster',
]);

export const ALT_MAX = 300;
export const CAPTION_MAX = 500;
export const MAX_ASSETS_PER_CASE = 40;

/** First image asset by COVER_ORDER (ties broken by the existing list order). */
export function pickCoverAsset(assets) {
  const images = (assets || []).filter((a) => a && a.media_kind !== 'video');
  for (const role of COVER_ORDER) {
    const hit = images.find((a) => a.role === role);
    if (hit) return hit;
  }
  return null;
}

/** Public URL of an object in a public Storage bucket (null when unusable). */
export function storagePublicUrl(supabaseUrl, bucket, path) {
  if (!supabaseUrl || !bucket || !path) return null;
  const encoded = String(path).split('/').map(encodeURIComponent).join('/');
  return `${String(supabaseUrl).replace(/\/+$/, '')}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`;
}

/** Folder that holds every upload belonging to one case. */
export function assetFolder(projectId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(projectId))) throw new Error('Invalid project id.');
  return `assets/${String(projectId).toLowerCase()}/`;
}

/** Object path for a new upload: assets/<project id>/<unique id>.<ext>. */
export function makeAssetPath(projectId, id, extension) {
  if (!/^[a-z0-9]{1,5}$/.test(extension)) throw new Error('Invalid file extension.');
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new Error('Invalid asset id.');
  return `${assetFolder(projectId)}${String(id).toLowerCase()}.${extension}`;
}

export function nextSortOrder(assets) {
  return (assets || []).reduce((max, a) => Math.max(max, Number(a.sort_order) || 0), -1) + 1;
}

/** Role proposed for a new upload: the first image of a case becomes its cover. */
export function defaultRoleFor(assets) {
  return (assets || []).some((a) => a.role === 'cover') ? 'gallery' : 'cover';
}

/**
 * Moves the asset `id` one place up (-1) or down (+1) and returns the rows whose
 * sort_order must change (always renumbered 0..n-1), or [] when nothing moves.
 */
export function reorderUpdates(assets, id, direction) {
  const list = [...assets];
  const from = list.findIndex((a) => a.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return [];
  [list[from], list[to]] = [list[to], list[from]];
  return list
    .map((a, index) => ({ id: a.id, sort_order: index, changed: a.sort_order !== index }))
    .filter((row) => row.changed)
    .map(({ id: rowId, sort_order }) => ({ id: rowId, sort_order }));
}

/** Validates the editable text fields of one asset. Returns { errors, value }. */
export function validateAssetMeta(raw) {
  const errors = {};
  const role = String(raw?.role ?? '');
  const alt = String(raw?.alt_text ?? '').trim();
  const caption = String(raw?.caption ?? '').trim();
  if (!IMAGE_ROLES.includes(role)) errors.role = 'Choose a role.';
  if (alt.length > ALT_MAX) errors.alt_text = `Keep the alt text under ${ALT_MAX} characters.`;
  if (caption.length > CAPTION_MAX) errors.caption = `Keep the caption under ${CAPTION_MAX} characters.`;
  return { errors, value: { role, alt_text: alt, caption } };
}

/**
 * Decides what `portfolio_projects.image_url` should become after the assets of
 * a case changed. The legacy cover is only touched while it is empty or still
 * points into this case's own asset folder, so a hand-entered cover link is never
 * overwritten. Returns `{ change: false }` or `{ change: true, url }`.
 */
export function coverSyncPlan({ currentUrl, assets, supabaseUrl, bucket, projectId }) {
  const folder = storagePublicUrl(supabaseUrl, bucket, assetFolder(projectId));
  const managed = !currentUrl || (folder && String(currentUrl).startsWith(folder));
  if (!managed) return { change: false };
  const cover = pickCoverAsset(assets);
  const url = cover ? (cover.external_url || storagePublicUrl(supabaseUrl, cover.bucket, cover.storage_path)) : null;
  if ((url || null) === (currentUrl || null)) return { change: false };
  return { change: true, url: url || null };
}
