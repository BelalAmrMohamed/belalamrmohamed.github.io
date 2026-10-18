// The settings the dashboard manages. Every row is stored in
// public.portfolio_settings; `isPublic` is written to the is_public column,
// so a public setting is readable by anyone (and is part of the AI assistant's
// knowledge) while a private one is readable only by admins and the server.

import { isEmail, isHttpUrl, isUrlOrSitePath } from './validators.js';

export const AVAILABILITY = Object.freeze({
  '': 'Not set',
  open: 'Open to work',
  limited: 'Limited availability',
  unavailable: 'Not available',
});

export const SETTING_GROUPS = Object.freeze([
  { id: 'site', title: 'Site identity', isPublic: true },
  { id: 'about', title: 'About', isPublic: true },
  { id: 'contact', title: 'Contact links', isPublic: true },
  { id: 'availability', title: 'Availability', isPublic: true },
  { id: 'ai', title: 'AI assistant', isPublic: false },
]);

export const SETTING_FIELDS = Object.freeze([
  { key: 'site_title', group: 'site', label: 'Site title', type: 'text', max: 120, required: true, isPublic: true,
    help: 'Shown in the page title and the hero heading.' },
  { key: 'site_tagline', group: 'site', label: 'Tagline', type: 'text', max: 240, required: true, isPublic: true,
    help: 'Used as the page description.' },
  { key: 'about_bio', group: 'about', label: 'Bio / about text', type: 'textarea', max: 3000, isPublic: true,
    help: 'Replaces the About paragraph on the site when filled in. Leave empty to keep the text written in the page.' },
  { key: 'contact_email', group: 'contact', label: 'Email', type: 'email', max: 254, isPublic: true, placeholder: 'you@example.com' },
  { key: 'contact_github', group: 'contact', label: 'GitHub', type: 'url', max: 300, isPublic: true, placeholder: 'https://github.com/username' },
  { key: 'contact_linkedin', group: 'contact', label: 'LinkedIn', type: 'url', max: 300, isPublic: true, placeholder: 'https://www.linkedin.com/in/username' },
  { key: 'contact_telegram', group: 'contact', label: 'Telegram', type: 'telegram', max: 300, isPublic: true, placeholder: '@username or https://t.me/username',
    help: 'A bare @username is saved as https://t.me/username.' },
  { key: 'cv_url', group: 'contact', label: 'CV link', type: 'urlOrPath', max: 500, isPublic: true, placeholder: 'https://… or Belal CV.pdf',
    help: 'A full link, or a file path on this site.' },
  { key: 'availability_status', group: 'availability', label: 'Availability', type: 'select', isPublic: true,
    options: AVAILABILITY },
  { key: 'availability_note', group: 'availability', label: 'Availability note', type: 'text', max: 240, isPublic: true,
    placeholder: 'e.g. Taking freelance projects from November', help: 'Optional detail the assistant can mention.' },
  { key: 'ai_extra_instructions', group: 'ai', label: 'Extra instructions for the AI assistant', type: 'textarea', max: 2000, isPublic: false,
    help: 'Private: never shown to visitors and never sent to the browser. The assistant follows it but can still paraphrase what it knows, so do not put secrets here.' },
]);

const TELEGRAM_HANDLE_RE = /^@?([A-Za-z0-9_]{4,32})$/;

export function validateSetting(field, rawValue) {
  const value = String(rawValue ?? '').replace(/\r\n/g, '\n').trim();
  if (!value) {
    return field.required ? { error: `${field.label} is required.`, value } : { error: null, value: '' };
  }
  if (field.max && value.length > field.max) {
    return { error: `Keep this under ${field.max} characters.`, value };
  }
  switch (field.type) {
    case 'email':
      return isEmail(value) ? { error: null, value } : { error: 'Enter a valid email address.', value };
    case 'url':
      return isHttpUrl(value) ? { error: null, value } : { error: 'Enter a full link starting with https://', value };
    case 'urlOrPath':
      return isUrlOrSitePath(value) ? { error: null, value } : { error: 'Use an https:// link or a file path on this site.', value };
    case 'telegram': {
      const handle = value.match(TELEGRAM_HANDLE_RE);
      if (handle) return { error: null, value: `https://t.me/${handle[1]}` };
      const bare = value.match(/^(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,32})\/?$/i);
      if (bare) return { error: null, value: `https://t.me/${bare[1]}` };
      return isHttpUrl(value) ? { error: null, value } : { error: 'Use @username or a https://t.me/… link.', value };
    }
    case 'select':
      return Object.hasOwn(field.options, value) ? { error: null, value } : { error: 'Choose one of the options.', value };
    default:
      return { error: null, value };
  }
}
