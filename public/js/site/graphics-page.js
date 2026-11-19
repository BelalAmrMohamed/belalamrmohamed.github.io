// Graphic Designs: one card per client/project, dialog shows its labeled assets.
import { fetchWorks, fetchAssetsFor, assetUrl, safeUrl } from './portfolio-repo.js';
import { renderShell } from './shell.js';
import { ROLE_LABELS, pickCoverAsset } from './asset-model.js';

renderShell();

const grid = document.getElementById('workGrid');
const status = document.getElementById('workStatus');
const dialog = document.getElementById('workDialog');
let lastTrigger = null;

function setStatus(message) { status.textContent = message; status.hidden = !message; }

const imageAssets = (assets) => (assets || []).filter((a) => a.media_kind === 'image' && assetUrl(a));

function coverUrl(work, assets) {
  const hit = pickCoverAsset(imageAssets(assets));
  return hit ? assetUrl(hit) : safeUrl(work.image_url, { allowRelative: true });
}

function card(work, assets) {
  const li = document.createElement('li');
  li.className = 'work-card';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'work-card__open';
  open.addEventListener('click', () => showDetails(work, assets, open));

  const pic = document.createElement('div');
  pic.className = 'work-card__pic';
  const src = coverUrl(work, assets);
  if (src) {
    const img = document.createElement('img');
    img.src = src; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => img.remove());
    pic.appendChild(img);
  }
  const text = document.createElement('div');
  text.className = 'work-card__text';
  const cat = document.createElement('span');
  cat.className = 'work-card__cat';
  const count = imageAssets(assets).length;
  cat.textContent = [work.category, count ? `${count} ${count === 1 ? 'asset' : 'assets'}` : ''].filter(Boolean).join(' · ');
  const title = document.createElement('span');
  title.className = 'work-card__title';
  title.textContent = work.title;
  text.append(cat, title);
  open.append(pic, text);
  li.appendChild(open);
  return li;
}

function showDetails(work, assets, trigger) {
  lastTrigger = trigger;
  const body = dialog.querySelector('[data-dialog-body]');
  body.replaceChildren();
  const h = document.createElement('h2');
  h.id = 'workDialogTitle';
  h.textContent = work.title;
  const p = document.createElement('p');
  p.textContent = work.summary || '';
  body.append(h, p);

  const list = document.createElement('ul');
  list.className = 'asset-gallery';
  for (const asset of imageAssets(assets)) {
    const li = document.createElement('li');
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = assetUrl(asset);
    img.alt = asset.alt_text || `${work.title} — ${ROLE_LABELS[asset.role] || 'image'}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    const cap = document.createElement('figcaption');
    cap.textContent = [ROLE_LABELS[asset.role], asset.caption].filter(Boolean).join(' — ');
    fig.append(img, cap);
    li.appendChild(fig);
    list.appendChild(li);
  }
  if (list.children.length) body.appendChild(list);
  dialog.showModal();
}

dialog.querySelector('[data-dialog-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => { if (lastTrigger) window.setTimeout(() => lastTrigger.focus(), 0); });

async function load() {
  setStatus('Loading…');
  try {
    const works = await fetchWorks({ workType: 'graphic_case' });
    // Assets are decoration: a failure still shows the cases with legacy covers.
    const assets = await fetchAssetsFor(works.map((w) => w.id)).catch((e) => { console.warn(e); return {}; });
    grid.replaceChildren(...works.map((w) => card(w, assets[w.id])));
    setStatus(works.length ? '' : 'Graphic designs will appear here soon.');
  } catch (error) {
    console.error('Failed to load graphic designs', error);
    setStatus('This section is temporarily unavailable. Please try again later.');
  }
}
load();
