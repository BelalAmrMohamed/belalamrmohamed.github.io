// Pure helpers (no DOM, no network) shared by the admin modules.
// Kept free of browser globals so they can be unit-tested with plain Node.

export const LIMITS = Object.freeze({ title: 120, category: 80, summary: 1200, url: 500 });
export const STATUSES = Object.freeze(['featured', 'active', 'archived']);
export const IMAGE_BUCKET = 'portfolio-images';
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
});
export const IMPORT_MAX_ROWS = 200;
export const IMPORT_MAX_BYTES = 1024 * 1024;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const BAD_SCHEME_RE = /^\s*(javascript|data|vbscript|file|blob):/i;

export function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
}

/** Absolute http(s) URL with a host. Mirrors the database CHECK (`^https?://`). */
export function isHttpUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
  try {
    return Boolean(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** http(s) URL, or a site-relative path such as `images/portfolio/a.jpg`. */
export function isUrlOrSitePath(value) {
  if (typeof value !== 'string' || !value) return false;
  if (BAD_SCHEME_RE.test(value)) return false;
  if (/^\s*\/\//.test(value)) return false; // protocol-relative
  if (/(^|\/)\.\.(\/|$)/.test(value)) return false; // path traversal
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return isHttpUrl(value); // has a scheme
  return !/^\s/.test(value);
}

export function validateProject(raw) {
  const errors = {};
  const text = (key) => String(raw?.[key] ?? '').trim();
  const optional = (key) => text(key) || null;

  const title = text('title');
  const category = text('category');
  const summary = text('summary');
  const image = optional('image_url');
  const projectUrl = optional('project_url');
  const githubUrl = optional('github_url');
  const status = raw?.status || 'active';

  if (!title) errors.title = 'Enter a project title.';
  else if (title.length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`;

  if (!category) errors.category = 'Enter a category.';
  else if (category.length > LIMITS.category) errors.category = `Keep the category under ${LIMITS.category} characters.`;

  if (summary.length > LIMITS.summary) errors.summary = `Keep the description under ${LIMITS.summary} characters.`;

  if (image) {
    if (image.length > LIMITS.url) errors.image_url = `Keep the image link under ${LIMITS.url} characters.`;
    else if (!isUrlOrSitePath(image)) errors.image_url = 'Use an https:// link or a site path like images/portfolio/photo.jpg.';
  }
  for (const [key, value] of [['project_url', projectUrl], ['github_url', githubUrl]]) {
    if (!value) continue;
    if (value.length > LIMITS.url) errors[key] = `Keep the link under ${LIMITS.url} characters.`;
    else if (!isHttpUrl(value)) errors[key] = 'Enter a full link starting with https:// or http://';
  }
  if (!STATUSES.includes(status)) errors.status = 'Choose a status.';

  return {
    errors,
    value: {
      title,
      category,
      summary,
      image_url: image,
      project_url: projectUrl,
      github_url: githubUrl,
      status,
      featured: status === 'featured',
      is_published: Boolean(raw?.is_published),
    },
  };
}

export function validateImageFile(file) {
  if (!file) return 'Choose an image file.';
  if (!Object.hasOwn(IMAGE_TYPES, file.type)) return 'Use a JPEG, PNG, WebP, GIF or AVIF image.';
  if (file.size > IMAGE_MAX_BYTES) {
    return `That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${IMAGE_MAX_BYTES / 1048576} MB.`;
  }
  if (file.size === 0) return 'That file is empty.';
  return null;
}

export function makeImagePath(file, id) {
  return `projects/${id}.${IMAGE_TYPES[file.type] || 'img'}`;
}

/** Object path inside our bucket for a public URL, or null for anything else. */
export function storagePathFromUrl(url, supabaseUrl) {
  if (!url || !supabaseUrl) return null;
  const prefix = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${IMAGE_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const path = decodeURIComponent(url.slice(prefix.length).split(/[?#]/)[0]);
  return path && !path.includes('..') ? path : null;
}

/** Shape written by "Export JSON" (ids and timestamps are intentionally left out). */
export function projectToExport(project) {
  return {
    title: project.title,
    category: project.category,
    summary: project.summary,
    status: project.status,
    is_published: Boolean(project.is_published),
    image_url: project.image_url ?? null,
    project_url: project.project_url ?? null,
    github_url: project.github_url ?? null,
  };
}

export function buildExport(projects, now = new Date()) {
  return {
    app: 'portfolio-projects',
    version: 1,
    exported_at: now.toISOString(),
    projects: projects.map(projectToExport),
  };
}

/**
 * Parses and validates an import file. Accepts either `{ projects: [...] }`
 * (the export format) or a bare array. Rows that are missing `is_published`
 * import as drafts, which is the safe default.
 */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { rows: [], errors: [{ index: -1, label: 'File', messages: ['This is not valid JSON.'] }] };
  }
  const list = Array.isArray(data) ? data : data?.projects;
  if (!Array.isArray(list)) {
    return { rows: [], errors: [{ index: -1, label: 'File', messages: ['Expected a "projects" array.'] }] };
  }
  if (!list.length) return { rows: [], errors: [{ index: -1, label: 'File', messages: ['The file contains no projects.'] }] };
  if (list.length > IMPORT_MAX_ROWS) {
    return { rows: [], errors: [{ index: -1, label: 'File', messages: [`Import at most ${IMPORT_MAX_ROWS} projects at a time.`] }] };
  }

  const rows = [];
  const errors = [];
  list.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ index, label: `Item ${index + 1}`, messages: ['Not an object.'] });
      return;
    }
    const { errors: fieldErrors, value } = validateProject({
      ...item,
      status: item.status ?? 'active',
      is_published: item.is_published ?? false,
    });
    const messages = Object.values(fieldErrors);
    if (messages.length) errors.push({ index, label: value.title || `Item ${index + 1}`, messages });
    else rows.push(value);
  });
  return { rows, errors };
}

export function sanitizeText(value, max) {
  return String(value ?? '').replace(/\r\n/g, '\n').slice(0, max);
}
