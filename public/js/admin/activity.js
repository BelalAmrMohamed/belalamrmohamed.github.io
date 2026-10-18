// Activity tab: read-only view of the audit log (admin-only RPC, keyset paging).

import { $, h, formatDateTime, timeAgo } from './dom.js';
import { client, run } from './api.js';
import { stateBlock, setBusy } from './ui.js';

const PAGE = 30;

const ENTITY_LABEL = { project: 'project', setting: 'setting', admin: 'admin' };

function describe(row) {
  const label = row.entity_label ? `“${row.entity_label}”` : '';
  switch (`${row.entity}:${row.action}`) {
    case 'project:insert': return `added project ${label}`;
    case 'project:update': return `edited project ${label}`;
    case 'project:delete': return `deleted project ${label}`;
    case 'project:reorder': return `reordered projects (${row.changes?.moved ?? '?'} moved)`;
    case 'setting:insert': return `created setting ${label}`;
    case 'setting:update': return `changed setting ${label}`;
    case 'setting:delete': return `deleted setting ${label}`;
    case 'admin:add_admin': return `added admin ${row.entity_label}`;
    case 'admin:remove_admin': return `removed admin ${row.entity_label}`;
    default: return `${row.action} ${ENTITY_LABEL[row.entity] || row.entity} ${label}`.trim();
  }
}

const show = (value) => {
  if (value === null || value === undefined || value === '') return '(empty)';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
};

function details(row) {
  const changes = row.changes && typeof row.changes === 'object' ? Object.entries(row.changes) : [];
  if (!changes.length) return null;
  if (row.action === 'update') {
    return h('ul', { class: 'diff' }, changes.map(([field, change]) => h('li', {},
      h('code', {}, field), ': ', h('del', {}, show(change.from)), ' → ', h('ins', {}, show(change.to)))));
  }
  if (row.action === 'reorder') return null;
  return h('ul', { class: 'diff' }, changes.slice(0, 8).map(([field, value]) => h('li', {}, h('code', {}, field), ': ', show(value))));
}

export function initActivity() {
  const list = $('#activityList');
  const stateBox = $('#activityState');
  const more = $('#activityMoreBtn');
  const filter = $('#activityFilter');
  let lastId = null;
  let loading = false;

  function renderRows(rows) {
    for (const row of rows) {
      const extra = details(row);
      list.append(h('li', { class: 'activity-item', dataset: { action: row.action } },
        h('div', { class: 'activity-line' },
          h('span', { class: 'activity-action', 'aria-hidden': 'true' }, { insert: '+', update: '✎', delete: '×', reorder: '⇅', add_admin: '+', remove_admin: '−' }[row.action] || '•'),
          h('span', { class: 'activity-text' }, h('strong', {}, row.actor_email), ' ', describe(row)),
          h('time', { datetime: row.created_at, title: formatDateTime(row.created_at) }, timeAgo(row.created_at))),
        extra ? h('details', { class: 'activity-details' }, h('summary', {}, 'Details'), extra) : null));
    }
  }

  async function load({ append = false } = {}) {
    if (loading) return;
    loading = true;
    if (!append) {
      lastId = null;
      list.replaceChildren();
      more.hidden = true;
      stateBox.replaceChildren(stateBlock({ kind: 'loading', title: 'Loading activity…' }));
    } else {
      setBusy(more, true, 'Loading…');
    }
    try {
      const rows = (await run(() => client.rpc('admin_list_activity', {
        p_limit: PAGE, p_before: lastId, p_entity: filter.value || null,
      }))) || [];
      stateBox.replaceChildren();
      if (!rows.length && !append) {
        stateBox.replaceChildren(stateBlock({
          kind: 'empty', title: 'No activity yet',
          message: 'Changes to projects, settings and admins will be listed here.',
        }));
      }
      renderRows(rows);
      if (rows.length) lastId = rows[rows.length - 1].id;
      more.hidden = rows.length < PAGE;
    } catch (error) {
      console.error('Activity load failed', error);
      stateBox.replaceChildren(stateBlock({
        kind: 'error', title: 'Could not load activity', message: error.message,
        action: { label: 'Try again', onClick: () => load({ append }) },
      }));
    } finally {
      loading = false;
      setBusy(more, false);
    }
  }

  filter.addEventListener('change', () => load());
  $('#activityRefreshBtn').addEventListener('click', () => load());
  more.addEventListener('click', () => load({ append: true }));

  return { load };
}
