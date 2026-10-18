// AI assistant tab: usage statistics (admin-only RPC, aggregates only),
// what the assistant currently knows, and a test box that talks to the
// existing /api/ai-agent/chat route (same quota, same origin rules).

import { $, h, newId, safeStorage } from './dom.js';
import { client, run } from './api.js';
import { toast, stateBlock } from './ui.js';

const TEST_DEVICE_KEY = 'portfolio_admin_ai_test_device';
const dayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const nf = new Intl.NumberFormat();

export function initAiPanel({ goToTab }) {
  const statsBox = $('#aiStats');
  const knowledgeBox = $('#aiKnowledge');
  const testBox = $('#aiTest');
  const range = $('#aiRange');
  let testBuilt = false;
  let memoryDevice = null;
  const conversation = [];

  // ---- usage stats ---------------------------------------------------------------------------
  function statTile(label, value, note) {
    return h('article', { class: 'dashboard-card dashboard-stat' },
      h('span', {}, label), h('strong', {}, value), note ? h('small', {}, note) : null);
  }

  function renderChart(rows) {
    const max = Math.max(1, ...rows.map((r) => Number(r.requests)));
    const total = rows.reduce((sum, r) => sum + Number(r.requests), 0);
    const tip = h('div', { class: 'chart-tip', hidden: true, 'aria-hidden': 'true' });
    const label = (row) => `${dayFormat.format(new Date(`${row.usage_date}T00:00:00Z`))}: ${nf.format(row.requests)} request${Number(row.requests) === 1 ? '' : 's'}`;

    const bars = h('div', {
      class: 'chart-bars', role: 'img',
      'aria-label': `Bar chart of AI requests per day over the last ${rows.length} days. ${nf.format(total)} requests in total. A table with the same data follows.`,
    }, rows.map((row) => h('div', { class: 'chart-col', dataset: { tip: label(row) } },
      h('div', { class: 'chart-bar', style: `height:${Math.max(Number(row.requests) ? 3 : 0, (Number(row.requests) / max) * 100)}%` }))));

    bars.addEventListener('pointermove', (event) => {
      const col = event.target.closest('.chart-col');
      if (!col) { tip.hidden = true; return; }
      const box = bars.getBoundingClientRect();
      const colBox = col.getBoundingClientRect();
      tip.textContent = col.dataset.tip;
      tip.hidden = false;
      const x = Math.min(Math.max(colBox.left - box.left + colBox.width / 2, 60), box.width - 60);
      tip.style.left = `${x}px`;
    });
    bars.addEventListener('pointerleave', () => { tip.hidden = true; });

    const first = rows[0];
    const last = rows[rows.length - 1];
    const axisLabel = (row) => dayFormat.format(new Date(`${row.usage_date}T00:00:00Z`));

    const table = h('table', { class: 'data-table' },
      h('caption', { class: 'sr-only' }, 'AI requests per day'),
      h('thead', {}, h('tr', {}, ['Day (UTC)', 'Requests', 'Active browsers', 'Active networks'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, [...rows].reverse().map((row) => h('tr', {},
        h('th', { scope: 'row' }, row.usage_date),
        h('td', {}, nf.format(row.requests)), h('td', {}, nf.format(row.unique_devices)), h('td', {}, nf.format(row.unique_ips))))));

    return h('article', { class: 'dashboard-card chart-card' },
      h('h3', {}, 'Requests per day'),
      h('div', { class: 'chart' },
        h('div', { class: 'chart-y', 'aria-hidden': 'true' }, h('span', {}, nf.format(max)), h('span', {}, '0')),
        h('div', { class: 'chart-plot' }, bars, tip)),
      h('div', { class: 'chart-x', 'aria-hidden': 'true' }, h('span', {}, axisLabel(first)), h('span', {}, axisLabel(last))),
      h('details', { class: 'chart-table' }, h('summary', {}, 'View as table'), table));
  }

  async function loadStats() {
    statsBox.replaceChildren(stateBlock({ kind: 'loading', title: 'Loading usage…' }));
    try {
      const rows = await run(() => client.rpc('admin_ai_usage_stats', { p_days: Number(range.value) }));
      if (!rows?.length) throw new Error('No data returned.');
      const total = rows.reduce((sum, r) => sum + Number(r.requests), 0);
      const busiest = rows.reduce((a, b) => (Number(b.requests) > Number(a.requests) ? b : a), rows[0]);
      const peakBrowsers = Math.max(...rows.map((r) => Number(r.unique_devices)));
      const activeDays = rows.filter((r) => Number(r.requests) > 0).length;

      statsBox.replaceChildren(
        h('section', { class: 'dashboard-stats', 'aria-label': 'AI usage summary' },
          statTile('Requests', nf.format(total), `last ${rows.length} days`),
          statTile('Average per day', (total / rows.length).toFixed(1), `${activeDays} active day${activeDays === 1 ? '' : 's'}`),
          statTile('Busiest day', Number(busiest.requests) ? nf.format(busiest.requests) : '–',
            Number(busiest.requests) ? dayFormat.format(new Date(`${busiest.usage_date}T00:00:00Z`)) : 'no traffic yet'),
          statTile('Peak daily browsers', nf.format(peakBrowsers), 'distinct visitors in one day')),
        renderChart(rows),
        h('p', { class: 'hint' }, 'Counts include only requests that were allowed. Visitors are identified by hashed browser and network identifiers; no raw identifiers are ever shown. Days are UTC.'));
    } catch (error) {
      console.error('AI stats failed', error);
      statsBox.replaceChildren(stateBlock({
        kind: 'error', title: 'Could not load AI usage', message: error.message,
        action: { label: 'Try again', onClick: loadStats },
      }));
    }
  }

  // ---- knowledge summary ------------------------------------------------------------------------
  async function loadKnowledge() {
    knowledgeBox.replaceChildren(h('h3', {}, 'What the assistant knows'), stateBlock({ kind: 'loading', title: 'Checking…' }));
    try {
      const [projectsResult, settings] = await Promise.all([
        client.from('portfolio_projects').select('id', { count: 'exact', head: true })
          .eq('is_published', true).neq('status', 'archived'),
        run(() => client.from('portfolio_settings').select('key, value, is_public')),
      ]);
      if (projectsResult.error) throw new Error(projectsResult.error.message);
      const publicFilled = settings.filter((s) => s.is_public && s.value.trim());
      const extra = settings.find((s) => s.key === 'ai_extra_instructions');
      knowledgeBox.replaceChildren(
        h('h3', {}, 'What the assistant knows'),
        h('p', { class: 'hint' }, 'Built fresh on every question from your published data. Anything you publish below becomes assistant knowledge.'),
        h('ul', { class: 'facts' },
          h('li', {}, h('strong', {}, String(projectsResult.count ?? 0)), ' published projects (first 40 are used)'),
          h('li', {}, h('strong', {}, String(publicFilled.length)), ` public setting${publicFilled.length === 1 ? '' : 's'} with a value`),
          h('li', {}, h('strong', {}, extra?.value.trim() ? `${extra.value.trim().length} characters` : 'None'), ' of private extra instructions')),
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => goToTab('settings') }, 'Edit in Settings'),
        h('p', { class: 'hint' }, 'Daily limits are set in api/ai-agent/chat.js: 15 requests per browser and 60 per network address, per UTC day.'));
    } catch (error) {
      knowledgeBox.replaceChildren(h('h3', {}, 'What the assistant knows'), stateBlock({
        kind: 'error', title: 'Could not check', message: error.message,
        action: { label: 'Try again', onClick: loadKnowledge },
      }));
    }
  }

  // ---- test box ---------------------------------------------------------------------------------------
  function testDeviceId() {
    const store = safeStorage('local');
    try {
      let id = store?.getItem(TEST_DEVICE_KEY);
      if (!id) { id = newId(); store?.setItem(TEST_DEVICE_KEY, id); }
      return id;
    } catch {
      memoryDevice ||= newId();
      return memoryDevice;
    }
  }

  function buildTest() {
    testBuilt = true;
    const log = h('div', { id: 'aiLog', class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Test conversation' });
    const textarea = h('textarea', { id: 'aiPrompt', class: 'input dashboard-textarea', rows: 3, maxlength: 2000, placeholder: 'Ask something a visitor might ask…' });
    const send = h('button', { id: 'aiSend', class: 'btn btn-default', type: 'submit' }, 'Send');
    const clear = h('button', { class: 'btn btn-outline', type: 'button', onclick: () => { conversation.length = 0; log.replaceChildren(); textarea.focus(); } }, 'Clear');

    const add = (role, text, kind) => {
      const node = h('div', { class: `msg msg-${role}${kind ? ` msg-${kind}` : ''}` },
        h('span', { class: 'msg-who' }, role === 'user' ? 'You' : kind === 'error' ? 'Error' : 'Assistant'),
        h('div', { class: 'msg-text' }, text));
      log.append(node);
      log.scrollTop = log.scrollHeight;
      return node;
    };

    const form = h('form', { class: 'chat-form', novalidate: true }, h('label', { class: 'label', for: 'aiPrompt' }, 'Your message'), textarea,
      h('div', { class: 'dashboard-actions' }, send, clear));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (!text) { textarea.focus(); return; }
      textarea.value = '';
      add('user', text);
      conversation.push({ role: 'user', content: text });
      send.disabled = true;
      send.setAttribute('aria-busy', 'true');
      const waiting = add('assistant', 'Thinking…');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      try {
        const response = await fetch('/api/ai-agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: conversation.slice(-12), deviceId: testDeviceId() }),
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          let message = body.error || `The assistant returned an error (${response.status}).`;
          if (response.status === 403) message += ' If this site’s address is not on the allowed list, add it to ALLOWED_ORIGIN in the Vercel environment.';
          throw new Error(message);
        }
        waiting.querySelector('.msg-text').textContent = body.text || '(empty reply)';
        conversation.push({ role: 'assistant', content: body.text || '' });
      } catch (error) {
        conversation.pop();
        waiting.remove();
        add('assistant', error.name === 'AbortError' ? 'The request timed out after 60 seconds.' : error.message, 'error');
        toast('The test message failed.', { kind: 'error' });
      } finally {
        clearTimeout(timer);
        send.disabled = false;
        send.removeAttribute('aria-busy');
        textarea.focus();
      }
    });

    testBox.replaceChildren(
      h('h3', {}, 'Test the assistant'),
      h('p', { class: 'hint' }, 'Sends a real request to the public assistant, so it answers from your saved data. Test messages use the normal daily quota and appear in the usage numbers.'),
      log, form);
  }

  function load() {
    if (!testBuilt) buildTest();
    return Promise.all([loadStats(), loadKnowledge()]);
  }

  range.addEventListener('change', loadStats);
  $('#aiRefreshBtn').addEventListener('click', load);

  return { load };
}
