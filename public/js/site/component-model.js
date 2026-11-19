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
