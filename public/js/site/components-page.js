// /ui-components: searchable catalog; detail dialog with format tabs, sandboxed preview and source view.
// Source is rendered with textContent only. The preview is a prebuilt static page loaded in an iframe
// with sandbox="allow-scripts" (no allow-same-origin), so it gets an opaque origin and cannot touch this page.
import { fetchWorks, fetchComponentVariants, safeUrl } from './portfolio-repo.js';
import { renderShell } from './shell.js';
import { FORMATS, languageOf, orderFiles, orderVariants, downloadName, validatePreviewPath } from './component-model.js';

renderShell();

const status = document.getElementById('workStatus');
const grid = document.getElementById('cmpGrid');
const search = document.getElementById('cmpSearch');
const chipsBox = document.getElementById('cmpFormats');
let items = [];
let formatFilter = '';

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

function visibleItems() {
  const q = search.value.trim().toLowerCase();
  return items.filter((it) =>
    (!formatFilter || it.variants.some((v) => v.format === formatFilter))
    && (!q || `${it.work.title} ${it.work.summary || ''} ${it.work.category || ''}`.toLowerCase().includes(q)));
}

function renderGrid() {
  const list = visibleItems();
  grid.replaceChildren(...list.map(card));
  status.textContent = list.length ? '' : (items.length ? 'No components match your search.' : 'No components published yet.');
}

function card(it) {
  const li = el('li', 'work-card');
  const open = el('button', 'work-card__open');
  open.type = 'button';
  open.setAttribute('aria-label', `Open component: ${it.work.title}`);
  const pic = el('div', 'work-card__pic');
  const img = safeUrl(it.work.image_url, { allowRelative: true });
  if (img) { const i = el('img'); i.src = img; i.alt = ''; i.loading = 'lazy'; i.addEventListener('error', () => i.remove()); pic.appendChild(i); }
  const text = el('div', 'work-card__text');
  text.append(el('span', 'work-card__cat', it.variants.map((v) => FORMATS[v.format]?.label || v.format).join(' · ')),
    el('span', 'work-card__title', it.work.title));
  open.append(pic, text);
  open.addEventListener('click', () => openDetail(it));
  li.appendChild(open);
  return li;
}

function renderChips() {
  const present = Object.keys(FORMATS).filter((f) => items.some((it) => it.variants.some((v) => v.format === f)));
  if (present.length < 2) { chipsBox.hidden = true; return; }
  const make = (value, label) => {
    const b = el('button', 'cmp-chip', label); b.type = 'button';
    b.setAttribute('aria-pressed', String(formatFilter === value));
    b.addEventListener('click', () => { formatFilter = value; renderChips(); renderGrid(); });
    return b;
  };
  chipsBox.replaceChildren(make('', 'All'), ...present.map((f) => make(f, FORMATS[f].label)));
}

// ---- detail dialog ---------------------------------------------------------------------------
let dialog = null;
function openDetail(it) {
  dialog?.remove();
  dialog = el('dialog', 'work-dialog cmp-dialog');
  dialog.setAttribute('aria-label', it.work.title);
  const inner = el('div', 'work-dialog__inner');
  const close = el('button', 'btn btn--stroke work-dialog__close', 'Close'); close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  const title = el('h2', null, it.work.title); title.tabIndex = -1;
  inner.append(close, title);
  if (it.work.summary) inner.appendChild(el('p', null, it.work.summary));
  const body = el('div', 'cmp-body');
  inner.appendChild(body);
  dialog.appendChild(inner);
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => { dialog.remove(); dialog = null; });
  showVariant(body, orderVariants(it.variants), 0);
  dialog.showModal();
  title.focus();
}

function showVariant(body, variants, index) {
  const variant = variants[index];
  const files = orderFiles(variant.files);
  let fileIndex = 0;
  body.replaceChildren();

  if (variants.length > 1) {
    const tabs = el('div', 'cmp-chips'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Format');
    variants.forEach((v, i) => {
      const b = el('button', 'cmp-chip', FORMATS[v.format]?.label || v.format); b.type = 'button';
      b.setAttribute('aria-pressed', String(i === index));
      b.addEventListener('click', () => showVariant(body, variants, i));
      tabs.appendChild(b);
    });
    body.appendChild(tabs);
  }

  const preview = validatePreviewPath(variant.preview_path);
  if (preview.ok && preview.value) {
    const frame = el('iframe', 'cmp-preview');
    frame.setAttribute('sandbox', 'allow-scripts'); // deliberately NOT allow-same-origin
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('loading', 'lazy');
    frame.title = 'Component preview';
    frame.src = preview.value;
    body.append(el('h3', 'cmp-h', 'Preview'), frame);
  } else {
    body.appendChild(el('p', 'work-status', 'No live preview for this format yet.'));
  }

  body.appendChild(el('h3', 'cmp-h', 'Source'));
  if (!files.length) { body.appendChild(el('p', 'work-status', 'No source files.')); return; }
  const bar = el('div', 'cmp-filebar');
  const pre = el('pre', 'cmp-source'); const code = el('code'); pre.tabIndex = 0; pre.appendChild(code);
  const meta = el('p', 'cmp-meta');
  const tabs = el('div', 'cmp-chips'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Files');
  const copy = el('button', 'btn btn--stroke', 'Copy'); copy.type = 'button';
  const dl = el('button', 'btn btn--stroke', 'Download file'); dl.type = 'button';
  const live = el('span', 'visually-hidden'); live.setAttribute('role', 'status');

  function paintFile() {
    const f = files[fileIndex];
    code.textContent = f.source;
    meta.textContent = `${f.path} · ${languageOf(f.path)}`;
    [...tabs.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === fileIndex)));
  }
  files.forEach((f, i) => {
    const b = el('button', 'cmp-chip', f.path.split('/').pop()); b.type = 'button'; b.title = f.path;
    b.addEventListener('click', () => { fileIndex = i; paintFile(); });
    tabs.appendChild(b);
  });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(files[fileIndex].source); live.textContent = 'Copied.'; copy.textContent = 'Copied'; }
    catch { live.textContent = 'Copy failed. Select the text and copy it manually.'; }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
  });
  dl.addEventListener('click', () => {
    const f = files[fileIndex];
    const url = URL.createObjectURL(new Blob([f.source], { type: 'text/plain;charset=utf-8' }));
    const a = el('a'); a.href = url; a.download = downloadName(f.path); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  bar.append(copy, dl, live);
  const deps = Object.entries(variant.dependencies || {}).map(([k, v]) => `${k}@${v}`).join(', ');
  body.append(tabs, meta, bar, pre);
  if (deps) body.appendChild(el('p', 'cmp-meta', `Dependencies: ${deps}`));
  paintFile();
}

search.addEventListener('input', renderGrid);

(async function init() {
  try {
    const works = await fetchWorks({ workType: 'ui_component', limit: 100 });
    const byProject = await fetchComponentVariants(works.map((w) => w.id));
    items = works.map((work) => ({ work, variants: byProject[work.id] || [] })).filter((it) => it.variants.length);
    renderChips();
    renderGrid();
  } catch {
    status.textContent = 'Could not load components right now. Please try again later.';
  }
})();
