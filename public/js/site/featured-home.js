// Landing page: featured work grouped by type, each group linking to its page.
// Renders nothing (the section stays hidden) until at least one classified,
// featured item exists, so the legacy Works section keeps working meanwhile.
import { fetchFeaturedByType, fetchAssetsFor, safeUrl, assetUrl, WORK_TYPES } from './portfolio-repo.js';
import { pickCoverAsset } from './asset-model.js';

const section = document.getElementById('featured-work');
const root = document.getElementById('featuredByType');

function cardFor(work, type, assets) {
  const li = document.createElement('li');
  li.className = 'work-card';
  const a = document.createElement('a');
  a.className = 'work-card__open';
  a.href = WORK_TYPES[type].path;
  const pic = document.createElement('div');
  pic.className = 'work-card__pic';
  const cover = pickCoverAsset((assets || []).filter((x) => assetUrl(x)));
  const src = (cover && assetUrl(cover)) || safeUrl(work.image_url, { allowRelative: true });
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
  cat.textContent = work.category || '';
  const title = document.createElement('span');
  title.className = 'work-card__title';
  title.textContent = work.title;
  text.append(cat, title);
  a.append(pic, text);
  li.appendChild(a);
  return li;
}

async function load() {
  if (!section || !root) return;
  try {
    const groups = await fetchFeaturedByType(3);
    const types = Object.keys(WORK_TYPES).filter((t) => groups[t]?.length);
    if (!types.length) return;
    const ids = (groups.graphic_case || []).map((w) => w.id);
    const assets = await fetchAssetsFor(ids).catch(() => ({}));
    root.replaceChildren(...types.map((type) => {
      const block = document.createElement('div');
      block.className = 'featured-group';
      const head = document.createElement('div');
      head.className = 'featured-group__head';
      const h3 = document.createElement('h3');
      h3.textContent = WORK_TYPES[type].label;
      const all = document.createElement('a');
      all.href = WORK_TYPES[type].path;
      all.textContent = `View all ${WORK_TYPES[type].label}`;
      head.append(h3, all);
      const ul = document.createElement('ul');
      ul.className = 'work-grid';
      groups[type].forEach((w) => ul.appendChild(cardFor(w, type, assets[w.id])));
      block.append(head, ul);
      return block;
    }));
    section.hidden = false;
  } catch (error) {
    console.warn('Featured work unavailable', error); // decoration only
  }
}
load();
