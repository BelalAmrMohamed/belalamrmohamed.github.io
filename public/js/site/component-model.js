// Pure helpers for UI components (no DOM, no network) shared by the admin and /ui-components.
export const FORMATS = Object.freeze({
  react_ts_tailwind: { label: 'React + TypeScript + Tailwind' },
  html_css_js: { label: 'HTML / CSS / JS' },
});
export const PREVIEW_PREFIX = '/previews/';
export const MAX_FILES = 20;
export const MAX_SOURCE_CHARS = 200000;

// Previews are prebuilt static pages committed under /previews/ (served with a CSP sandbox header).
export function validatePreviewPath(value) {
  const v = String(value ?? '').trim();
  if (!v) return { ok: true, value: null };
  if (v.length > 500 || !v.startsWith(PREVIEW_PREFIX) || !/^\/previews\/[A-Za-z0-9._\/-]+\.html$/.test(v) || /(^|\/)\.\.?(\/|$)/.test(v)) {
    return { ok: false, error: 'Use a path like /previews/my-button/index.html (an .html file under /previews/).' };
  }
  return { ok: true, value: v };
}

export function validateFilePath(value) {
  const v = String(value ?? '').trim();
  if (!v || v.length > 200 || v.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(v) || !/^[A-Za-z0-9._\/@-]+$/.test(v)) {
    return { ok: false, error: 'Use a relative path such as src/Button.tsx (letters, digits, . _ - / only).' };
  }
  return { ok: true, value: v };
}

export function languageOf(path) {
  const ext = String(path).split('.').pop().toLowerCase();
  return { tsx: 'TSX', ts: 'TypeScript', jsx: 'JSX', js: 'JavaScript', css: 'CSS', html: 'HTML', json: 'JSON' }[ext] || 'Text';
}

// Entry file first, then by sort_order, then path.
export function orderFiles(files) {
  return [...files].sort((a, b) =>
    (b.is_entry ? 1 : 0) - (a.is_entry ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.path.localeCompare(b.path));
}

export function downloadName(path) {
  return String(path).split('/').pop().replace(/[^A-Za-z0-9._-]/g, '_') || 'component.txt';
}

// Format order used everywhere: React first, then HTML.
export function orderVariants(variants) {
  const rank = (f) => Object.keys(FORMATS).indexOf(f);
  return [...variants].sort((a, b) => rank(a.format) - rank(b.format));
}

// Dependencies are documentation for visitors and an allowlist for the curated build (plan section 10).
export const ALLOWED_DEPENDENCIES = Object.freeze(['react', 'react-dom', 'tailwindcss', 'typescript']);

// "react@18.3.1, tailwindcss@3.4.17" -> { react: '18.3.1', ... }; exact versions only.
export function parseDependencies(text) {
  const out = {};
  const parts = String(text ?? '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const m = /^([a-z0-9-]+)@(\d+\.\d+\.\d+)$/.exec(part);
    if (!m) return { ok: false, error: `"${part}" is not name@x.y.z.` };
    if (!ALLOWED_DEPENDENCIES.includes(m[1])) return { ok: false, error: `${m[1]} is not on the allowlist (${ALLOWED_DEPENDENCIES.join(', ')}).` };
    out[m[1]] = m[2];
  }
  return { ok: true, value: out };
}

export function formatDependencies(obj) {
  return Object.entries(obj || {}).map(([k, v]) => `${k}@${v}`).join(', ');
}

// Checks a whole variant draft before saving. Returns an array of messages (empty = valid).
export function validateVariantDraft({ preview, depsText, files }) {
  const errors = [];
  if (!validatePreviewPath(preview).ok) errors.push(validatePreviewPath(preview).error);
  const d = parseDependencies(depsText); if (!d.ok) errors.push(d.error);
  if (!files.length) errors.push('Add at least one source file.');
  if (files.length > MAX_FILES) errors.push(`At most ${MAX_FILES} files.`);
  const seen = new Set();
  for (const f of files) {
    const p = validateFilePath(f.path);
    if (!p.ok) { errors.push(`${f.path || '(empty path)'}: ${p.error}`); continue; }
    if (seen.has(p.value)) errors.push(`Duplicate path ${p.value}.`);
    seen.add(p.value);
    if (String(f.source).length > MAX_SOURCE_CHARS) errors.push(`${p.value} is larger than ${MAX_SOURCE_CHARS} characters.`);
  }
  if (files.length && files.filter((f) => f.is_entry).length !== 1) errors.push('Mark exactly one file as the entry file.');
  return errors;
}

// ---- previews stored with the component (no deploy needed) ----------------------------------
// A variant's preview page lives in a reserved file row. It is only ever rendered inside a sandboxed iframe
// (sandbox="allow-scripts", no allow-same-origin) via srcdoc, so it runs in an opaque origin with no access to this site.
export const PREVIEW_FILE = '.preview/index.html';
export const PREVIEW_CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src data: blob: https:; font-src data: https://fonts.gstatic.com; media-src data: blob: https:; connect-src 'none'";

export const sourceFiles = (files) => (files || []).filter((f) => f.path !== PREVIEW_FILE);

const norm = (p) => String(p).replace(/^\.\//, '').replace(/^\//, '');

function withCsp(html) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${meta}`) : `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`;
}

// Inlines same-component CSS/JS referenced from an HTML entry file.
export function inlineAssets(html, files) {
  const byPath = new Map(files.map((f) => [norm(f.path), f.source]));
  return html
    .replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (tag, href) =>
      (/rel=["']?stylesheet/i.test(tag) && byPath.has(norm(href))) ? `<style>${byPath.get(norm(href))}</style>` : tag)
    .replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src) =>
      byPath.has(norm(src)) ? `<script>${byPath.get(norm(src)).replace(/<\/script/gi, '<\\/script')}</script>` : tag);
}

// The document to show in the sandboxed preview frame, or null when the variant has no previewable page.
export function previewDocument(variant) {
  const files = variant.files || [];
  const explicit = files.find((f) => f.path === PREVIEW_FILE && f.source.trim());
  if (explicit) return withCsp(explicit.source);
  if (variant.format === 'html_css_js') {
    const src = sourceFiles(files);
    const entry = src.find((f) => f.is_entry && /\.html?$/i.test(f.path)) || src.find((f) => /\.html?$/i.test(f.path));
    if (entry) return withCsp(inlineAssets(entry.source, src));
  }
  return null;
}
