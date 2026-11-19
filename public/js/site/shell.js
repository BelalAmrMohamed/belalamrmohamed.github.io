// Shared header/footer for the category pages (single source for navigation,
// so links and active state cannot drift between pages). index.html keeps its
// own anchor-based header; keep its extra links in sync with NAV_LINKS.
import { WORK_TYPES } from './portfolio-repo.js';

export const NAV_LINKS = [
  { href: '/#about', label: 'About' },
  { href: WORK_TYPES.website.path, label: 'Websites' },
  { href: WORK_TYPES.app_tool.path, label: 'Apps & Tools' },
  { href: WORK_TYPES.graphic_case.path, label: 'Graphic Designs' },
  { href: '/#contact', label: 'Say Hello' },
  { href: '/admin', label: 'Admin' },
];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function navLink(link, currentPath) {
  const li = el('li');
  if (link.href === currentPath) li.className = 'current';
  const a = el('a', { href: link.href }, link.label);
  if (link.href === currentPath) a.setAttribute('aria-current', 'page');
  li.appendChild(a);
  return li;
}

export function renderShell() {
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  const header = document.querySelector('[data-site-header]');
  if (header) {
    header.className = 's-header';
    const mobile = el('div', { class: 'header-mobile' },
      el('span', { class: 'mobile-home-link' }, el('a', { href: '/' }, 'Belal.')),
      el('a', { class: 'mobile-menu-toggle', href: '#0', 'aria-label': 'Toggle menu' }, el('span', {}, 'Menu')));
    const ul = el('ul', {}, el('li', {}, el('a', { href: '/', class: 'home-link' }, 'Belal.')));
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
