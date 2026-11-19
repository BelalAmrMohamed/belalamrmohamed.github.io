// Videos page. Section 1: cached YouTube metadata (never calls YouTube from the
// visitor's browser). RLS only returns visible + public videos of connected
// channels. The player loads on click, from youtube-nocookie.com.
// Section 2: videos edited for others and uploaded in the admin (portfolio_assets,
// role edited_video). Plain <video controls preload="metadata">, no autoplay.
import { getClient, fetchWorks, fetchAssetsFor, assetUrl, safeUrl } from './portfolio-repo.js';
import { renderShell } from './shell.js';

renderShell();

const status = document.getElementById('workStatus');
const section = document.getElementById('ytSection');
const grid = document.getElementById('ytGrid');
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function card(video) {
  const li = document.createElement('li');
  li.className = 'work-card';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'work-card__open';
  open.setAttribute('aria-label', `Play video: ${video.title}`);
  const pic = document.createElement('div');
  pic.className = 'work-card__pic';
  if (video.thumbnail_url && /^https:\/\//.test(video.thumbnail_url)) {
    const img = document.createElement('img');
    img.src = video.thumbnail_url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => img.remove());
    pic.appendChild(img);
  }
  const text = document.createElement('div');
  text.className = 'work-card__text';
  const cat = document.createElement('span');
  cat.className = 'work-card__cat';
  cat.textContent = video.published_at ? new Date(video.published_at).toLocaleDateString() : 'YouTube';
  const title = document.createElement('span');
  title.className = 'work-card__title';
  title.textContent = video.title;
  text.append(cat, title);
  open.append(pic, text);
  open.addEventListener('click', () => {
    if (!VIDEO_ID.test(video.youtube_video_id)) return;
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${video.youtube_video_id}?autoplay=1&rel=0`;
    frame.title = video.title;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.className = 'yt-frame';
    pic.replaceChildren(frame);
    open.disabled = true;
  }, { once: true });
  li.appendChild(open);
  return li;
}

async function loadYoutube() {
  const client = await getClient();
  const { data, error } = await client.from('youtube_videos')
    .select('id, youtube_video_id, title, published_at, thumbnail_url, featured, sort_order')
    .eq('is_visible', true).eq('privacy_status', 'public')
    .order('featured', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(60);
  if (error) throw error;
  return (data || []).map(card);
}

function editedCard(work, assets) {
  const video = (assets || []).find((a) => a.media_kind === 'video' && a.role === 'edited_video');
  const src = video && assetUrl(video);
  if (!src) return null;
  const poster = (assets || []).find((a) => a.media_kind === 'image' && a.role === 'poster');
  const li = document.createElement('li');
  li.className = 'work-card';
  const box = document.createElement('div');
  box.className = 'work-card__open';
  const pic = document.createElement('div');
  pic.className = 'work-card__pic';
  const player = document.createElement('video');
  player.className = 'edited-video';
  player.controls = true;
  player.preload = 'metadata';
  player.playsInline = true;
  player.setAttribute('aria-label', work.title);
  const posterUrl = (poster && assetUrl(poster)) || safeUrl(work.image_url, { allowRelative: true });
  if (posterUrl) player.poster = posterUrl;
  player.src = src;
  pic.appendChild(player);
  const text = document.createElement('div');
  text.className = 'work-card__text';
  const cat = document.createElement('span');
  cat.className = 'work-card__cat';
  cat.textContent = work.category || '';
  const title = document.createElement('span');
  title.className = 'work-card__title';
  title.textContent = work.title;
  text.append(cat, title);
  if (work.summary) {
    const p = document.createElement('p');
    p.textContent = work.summary;
    text.appendChild(p);
  }
  box.append(pic, text);
  li.appendChild(box);
  return li;
}

async function loadEdited() {
  const works = await fetchWorks({ workType: 'edited_video' });
  const assets = works.length ? await fetchAssetsFor(works.map((w) => w.id)) : {};
  return works.map((w) => editedCard(w, assets[w.id])).filter(Boolean);
}

async function load() {
  const edited = document.getElementById('editedSection');
  const editedGrid = document.getElementById('editedGrid');
  // Each section fails on its own: one broken source must not hide the other.
  const [yt, ed] = await Promise.allSettled([loadYoutube(), loadEdited()]);
  const ytCards = yt.status === 'fulfilled' ? yt.value : [];
  const edCards = ed.status === 'fulfilled' ? ed.value : [];
  grid.replaceChildren(...ytCards);
  section.hidden = !ytCards.length;
  editedGrid.replaceChildren(...edCards);
  edited.hidden = !edCards.length;
  const failed = yt.status === 'rejected' && ed.status === 'rejected';
  if (failed) console.error('Failed to load videos', yt.reason, ed.reason);
  status.textContent = failed ? 'This section is temporarily unavailable. Please try again later.'
    : (!ytCards.length && !edCards.length ? 'Videos will appear here soon.' : '');
  status.hidden = !status.textContent;
}
load();
