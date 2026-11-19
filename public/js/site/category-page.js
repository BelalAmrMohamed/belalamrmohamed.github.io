// Renders a work-type category page (Websites, Apps & Tools).
// Titles/summaries are written with textContent only (never innerHTML).
import { fetchWorks, fetchSettings, safeUrl, WORK_TYPES } from './portfolio-repo.js';
import { renderShell } from './shell.js';

renderShell();

const grid = document.getElementById('workGrid');
const status = document.getElementById('workStatus');
const dialog = document.getElementById('workDialog');
const workType = grid && grid.dataset.workType;

function setStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}

function card(work) {
  const li = document.createElement('li');
  li.className = 'work-card';

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'work-card__open';
  open.addEventListener('click', () => showDetails(work, open));

  const imgUrl = safeUrl(work.image_url, { allowRelative: true });
  const pic = document.createElement('div');
  pic.className = 'work-card__pic';
  if (imgUrl) {
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
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
  open.append(pic, text);
  li.appendChild(open);
  return li;
}

let lastTrigger = null;
function showDetails(work, trigger) {
  lastTrigger = trigger;
  const body = dialog.querySelector('[data-dialog-body]');
  body.replaceChildren();

  const imgUrl = safeUrl(work.image_url, { allowRelative: true });
  if (imgUrl) {
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = work.title;
    body.appendChild(img);
  }
  const h = document.createElement('h2');
  h.id = 'workDialogTitle';
  h.textContent = work.title;
  const p = document.createElement('p');
  p.textContent = work.summary || '';
  body.append(h, p);

  const actions = document.createElement('p');
  actions.className = 'work-dialog__actions';
  [[work.project_url, 'Open project'], [work.github_url, 'Source on GitHub']].forEach(([url, label]) => {
    const href = safeUrl(url);
    if (!href) return;
    const a = document.createElement('a');
    a.className = 'btn btn--medium';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    actions.appendChild(a);
  });
  if (actions.children.length) body.appendChild(actions);
  dialog.showModal();
}

dialog.querySelector('[data-dialog-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => { if (lastTrigger) window.setTimeout(() => lastTrigger.focus(), 0); });

async function load() {
  setStatus('Loading…');
  try {
    const works = await fetchWorks({ workType });
    grid.replaceChildren(...works.map(card));
    setStatus(works.length ? '' : `${WORK_TYPES[workType].label} will appear here soon.`);
  } catch (error) {
    console.error('Failed to load works', error);
    setStatus('This section is temporarily unavailable. Please try again later.');
  }
}

// Settings are cosmetic: ignore failures.
fetchSettings(['contact_email']).catch(() => {});
load();
