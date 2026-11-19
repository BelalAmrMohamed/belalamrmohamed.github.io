// Shared header/footer for the category pages (single source for navigation,
// so links and active state cannot drift between pages). index.html carries the same
// markup statically; keep it in sync with WORK_LINKS/NAV_LINKS.
import { WORK_TYPES } from './portfolio-repo.js';

// Work-type pages live in the "Work" dropdown; everything else is a top-level link.
export const WORK_LINKS = [
  { href: WORK_TYPES.website.path, label: 'Websites', desc: 'Sites and web builds' },
  { href: WORK_TYPES.app_tool.path, label: 'Apps & Tools', desc: 'Web apps and utilities' },
  { href: WORK_TYPES.graphic_case.path, label: 'Graphic Designs', desc: 'Branding and visual cases' },
  { href: WORK_TYPES.ui_component.path, label: 'UI Components', desc: 'Previews with source' },
  { href: WORK_TYPES.edited_video.path, label: 'Videos', desc: 'YouTube and edited videos' },
];
export const NAV_LINKS = [
  { href: '/#about', label: 'About' },
  { href: '/#contact', label: 'Say Hello' },
  { href: '/admin', label: 'Admin', className: 'nav-admin' },
];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function navLink(link, currentPath) {
  const li = el('li');
  const cls = [link.className, link.href === currentPath ? 'current' : ''].filter(Boolean).join(' ');
  if (cls) li.className = cls;
  const a = el('a', { href: link.href }, link.label);
  if (link.href === currentPath) a.setAttribute('aria-current', 'page');
  li.appendChild(a);
  return li;
}

function workMenu(currentPath) {
  const active = WORK_LINKS.some((l) => l.href === currentPath);
  const li = el('li', { class: `has-menu${active ? ' current' : ''}` });
  const trigger = el('button', { type: 'button', class: 'nav-trigger', 'aria-expanded': 'false', 'aria-controls': 'nav-work' }, 'Work');
  const panel = el('div', { class: 'nav-panel', id: 'nav-work' });
  WORK_LINKS.forEach((l) => {
    const a = el('a', { href: l.href }, el('strong', {}, l.label), el('small', {}, l.desc));
    if (l.href === currentPath) a.setAttribute('aria-current', 'page');
    panel.appendChild(a);
  });
  li.append(trigger, panel);
  return li;
}

export function renderShell() {
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  const header = document.querySelector('[data-site-header]');
  if (header) {
    // main.js binds the mobile toggle before this header exists, so nav.js owns it on shell pages.
    document.body.dataset.shellNav = '1';
    header.className = 's-header';
    const mobile = el('div', { class: 'header-mobile' },
      el('span', { class: 'mobile-home-link' }, el('a', { href: '/' }, 'Belal.')),
      el('a', { class: 'mobile-menu-toggle', href: '#0', 'aria-label': 'Toggle menu' }, el('span', {}, 'Menu')));
    const ul = el('ul', {}, el('li', {}, el('a', { href: '/', class: 'home-link' }, 'Belal.')));
    ul.appendChild(workMenu(currentPath));
    NAV_LINKS.forEach((link) => ul.appendChild(navLink(link, currentPath)));
    const nav = el('nav', { class: 'column lg-12 main-nav', 'aria-label': 'Primary' }, ul);
    header.replaceChildren(mobile, el('div', { class: 'row wide main-nav-wrap' }, nav));
  }
  const footer = document.querySelector('[data-site-footer]');
  if (footer) {
    footer.className = 's-footer';
    footer.replaceChildren(el('div', { class: 'row' },
      el('div', { class: 'column ss-copyright' },
        el('span', {}, `© Belal Amr Mohamed ${new Date().getFullYear()}`),
        el('span', {}, 'Rights reserved ', el('a', {
          href: 'https://belalamrmohamed.github.io/License/', target: '_blank', rel: 'noopener noreferrer',
        }, 'License')))));
  }
}
