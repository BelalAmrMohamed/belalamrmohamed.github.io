// Portfolio dashboard entry point: sign-in, the server-side admin check,
// tab navigation, session-expiry handling and wiring of the feature modules.
//
// SECURITY NOTE: nothing in the browser decides who is an admin. After sign-in
// the page asks the database (portfolio_admin_status RPC); every read/write is
// then enforced again by Row Level Security and admin-only RPCs. If this file
// were edited in dev tools, a non-admin would still be denied by Postgres.

import { $, $$ } from './admin/dom.js';
import { client, config, sessionEvents, isMissingFunction } from './admin/api.js';
import { toast, confirmDiscard, anyDirty } from './admin/ui.js';
import { initEditor } from './admin/project-editor.js';
import { initProjects } from './admin/projects.js';
import { initSettings } from './admin/settings.js';
import { initAiPanel } from './admin/ai-panel.js';
import { initAdmins } from './admin/admins.js';
import { initActivity } from './admin/activity.js';

const authView = $('.login');
const dashboardView = $('#dashboardView');
const authStatus = $('#auth-status');
const TABS = ['projects', 'settings', 'ai', 'admins', 'activity'];
const TAB_LABEL = { projects: 'Projects', settings: 'Settings', ai: 'AI assistant', admins: 'Admins', activity: 'Activity' };

let activeUserId = null;
let verifyingUserId = null;
let activeTab = null;
let userInitiatedSignOut = false;
let expiredShown = false;
let modules = null;

function showAuthStatus(message, kind = 'info') {
  authStatus.textContent = message;
  authStatus.dataset.kind = kind;
}

function toggleBusy(isBusy) {
  $$('#email-form button, #google-btn, #github-btn').forEach((button) => { button.disabled = isBusy; });
}

function setView(isAuthenticated) {
  authView.classList.toggle('hidden', isAuthenticated);
  dashboardView.classList.toggle('hidden', !isAuthenticated);
  document.title = isAuthenticated ? 'Dashboard | Belal Amr' : 'Sign in | Belal Amr';
}

// ---- feature modules ---------------------------------------------------------------------------
function buildModules() {
  let projectsApi = null;
  const editor = initEditor({
    getProjects: () => projectsApi?.getProjects() || [],
    onSaved: () => projectsApi.load(),
    showList: () => { $('#projectEditorView').hidden = true; $('#projectsListView').hidden = false; $('#h-projects').focus(); },
    showEditor: () => { $('#projectsListView').hidden = true; $('#projectEditorView').hidden = false; },
  });
  projectsApi = initProjects({ editor, onUpgradeNeeded: () => { $('#upgradeBanner').hidden = false; } });
  return {
    editor,
    projects: projectsApi,
    settings: initSettings(),
    ai: initAiPanel({ goToTab: (name) => switchTab(name) }),
    admins: initAdmins(),
    activity: initActivity(),
  };
}

// ---- tabs ------------------------------------------------------------------------------------------
async function switchTab(name, { fromHash = false } = {}) {
  if (!TABS.includes(name)) name = 'projects';
  if (name === activeTab) return;

  if (anyDirty() && !(await confirmDiscard())) {
    if (fromHash && activeTab) history.replaceState(null, '', `#${activeTab}`);
    return;
  }
  // Leaving the project editor discards it (the user just agreed, or nothing was dirty).
  if (modules.editor.isOpen()) await modules.editor.close({ force: true });

  activeTab = name;
  $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
  $$('.nav-btn').forEach((button) => {
    if (button.dataset.tab === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  document.title = `${TAB_LABEL[name]} | Dashboard | Belal Amr`;
  $(`#h-${name}`)?.focus({ preventScroll: true });

  if (name === 'settings') modules.settings.load({ quiet: modules.settings.isLoaded() });
  else if (name === 'ai') modules.ai.load();
  else if (name === 'admins') modules.admins.load();
  else if (name === 'activity') modules.activity.load();
  else if (name === 'projects' && modules.projects.isReady()) modules.projects.load();
}

// ---- sign-in state --------------------------------------------------------------------------------------
/** Asks the database whether this account is an admin. Never trusts the browser. */
async function checkAdmin(user) {
  const { data, error } = await client.rpc('portfolio_admin_status');
  if (!error) return { isAdmin: Boolean(data?.[0]?.is_admin), legacy: false };

  if (isMissingFunction(error)) {
    // Migrations not applied yet: fall back to the old single-email gate so the
    // dashboard still opens. Row Level Security still protects every write.
    const allowed = Boolean(config.adminEmail) && user.email?.toLowerCase() === config.adminEmail.toLowerCase();
    return { isAdmin: allowed, legacy: true };
  }
  throw error;
}

async function acceptSessionUser(user) {
  if (!user) {
    const hadSession = activeUserId !== null;
    activeUserId = null;
    activeTab = null;
    setView(false);
    if (hadSession && !userInitiatedSignOut) {
      modules?.editor.stashDraft();
      showAuthStatus('Your session ended. Please sign in again.', 'error');
    }
    userInitiatedSignOut = false;
    return;
  }

  if (activeUserId === user.id || verifyingUserId === user.id) return; // refresh / duplicate event

  verifyingUserId = user.id;
  let verdict;
  try {
    verdict = await checkAdmin(user);
  } finally {
    verifyingUserId = null;
  }
  const { isAdmin, legacy } = verdict;
  if (!isAdmin) {
    activeUserId = null;
    setView(false);
    showAuthStatus('This account is not authorized to manage this portfolio.', 'error');
    const { error } = await client.auth.signOut();
    if (error) {
      console.error('Could not clear the unauthorized session', error);
      showAuthStatus('This account is not authorized, and its session could not be cleared. Sign out manually.', 'error');
    }
    return;
  }

  activeUserId = user.id;
  expiredShown = false;
  showAuthStatus('');
  $('#userEmail').textContent = user.email || '';
  $('#upgradeBanner').hidden = !legacy;
  setView(true);

  modules ||= buildModules();
  const startTab = location.hash.replace('#', '');
  activeTab = null;
  await switchTab(TABS.includes(startTab) ? startTab : 'projects');
  await modules.projects.load();
  modules.editor.offerDraft();
}

// ---- auth actions -------------------------------------------------------------------------------------------
async function signInWithPassword(event) {
  event.preventDefault();
  const email = $('#email').value.trim();
  const password = $('#password').value;
  toggleBusy(true);
  showAuthStatus('Signing in…');
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('Supabase did not return a signed-in user.');
  } catch (error) {
    console.error('Email sign-in failed', error);
    showAuthStatus(error.message || 'Sign-in failed.', 'error');
  } finally {
    toggleBusy(false);
  }
}

async function signInWithProvider(provider) {
  toggleBusy(true);
  showAuthStatus(`Redirecting to ${provider === 'google' ? 'Google' : 'GitHub'}…`);
  try {
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/admin` },
    });
    if (error) throw error;
  } catch (error) {
    console.error(`${provider} OAuth sign-in failed`, error);
    showAuthStatus(error.message || 'OAuth sign-in failed.', 'error');
    toggleBusy(false);
  }
}

async function requestPasswordReset(event) {
  event.preventDefault();
  const email = $('#email').value.trim();
  if (!email) {
    showAuthStatus('Enter your email address first.', 'error');
    $('#email').focus();
    return;
  }
  try {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/admin` });
    if (error) throw error;
    showAuthStatus('If the address belongs to an account, a password reset link has been sent.', 'success');
  } catch (error) {
    console.error('Password reset request failed', error);
    showAuthStatus(error.message || 'Password reset request failed.', 'error');
  }
}

async function signOut() {
  if (anyDirty() && !(await confirmDiscard())) return;
  userInitiatedSignOut = true;
  try {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    activeUserId = null;
    setView(false);
    showAuthStatus('You are signed out.', 'success');
  } catch (error) {
    userInitiatedSignOut = false;
    console.error('Sign-out failed', error);
    toast(error.message || 'Sign-out failed.', { kind: 'error' });
  }
}

// ---- session expiry + password recovery -------------------------------------------------------------------------
function showExpiredDialog() {
  if (expiredShown || activeUserId === null) return;
  expiredShown = true;
  modules?.editor.stashDraft();
  const dialog = $('#expiredDialog');
  dialog.addEventListener('cancel', (event) => event.preventDefault()); // must choose
  dialog.showModal();
  $('#expiredBtn').focus();
}

async function finishExpiry() {
  $('#expiredDialog').close();
  userInitiatedSignOut = true;
  await client.auth.signOut({ scope: 'local' }).catch(() => {});
  activeUserId = null;
  setView(false);
  showAuthStatus('Please sign in again to continue.', 'error');
}

function showPasswordDialog() {
  const dialog = $('#passwordDialog');
  if (!dialog.open) dialog.showModal();
  $('#newPassword').focus();
}

function wirePasswordDialog() {
  const dialog = $('#passwordDialog');
  const status = $('#pwStatus');
  $('#pwSkip').addEventListener('click', () => dialog.close());
  $('#passwordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#newPassword').value;
    if (password.length < 8) {
      status.textContent = 'Use at least 8 characters.';
      status.hidden = false;
      return;
    }
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      status.textContent = error.message;
      status.hidden = false;
      return;
    }
    status.hidden = true;
    $('#newPassword').value = '';
    dialog.close();
    toast('Password updated.', { kind: 'success' });
  });
}

// ---- boot -------------------------------------------------------------------------------------------------------------
function initialize() {
  if (!client) {
    showAuthStatus('Supabase configuration is missing. Authentication is unavailable.', 'error');
    toggleBusy(true);
    return;
  }

  $('#email-form').addEventListener('submit', signInWithPassword);
  $('#google-btn').addEventListener('click', () => signInWithProvider('google'));
  $('#github-btn').addEventListener('click', () => signInWithProvider('github'));
  $('#reset-password').addEventListener('click', requestPasswordReset);
  $('#signOutBtn').addEventListener('click', signOut);
  $('#expiredBtn').addEventListener('click', finishExpiry);
  wirePasswordDialog();
  sessionEvents.addEventListener('expired', showExpiredDialog);

  $$('.nav-btn').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  window.addEventListener('hashchange', () => {
    if (activeUserId) switchTab(location.hash.replace('#', ''), { fromHash: true });
  });

  const handleSession = (session) => {
    void acceptSessionUser(session?.user || null).catch((error) => {
      console.error('Could not process the Supabase auth state', error);
      activeUserId = null;
      setView(false);
      showAuthStatus('Could not verify your account. Please sign in again.', 'error');
    });
  };

  client.auth.onAuthStateChange((event, session) => {
    // Never await Supabase calls inside this callback (deadlock risk): defer.
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') showPasswordDialog();
      handleSession(session);
    }, 0);
  });

  client.auth.getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      handleSession(data.session);
    })
    .catch((error) => {
      console.error('Could not restore the Supabase session', error);
      showAuthStatus('Could not restore your session. Please sign in again.', 'error');
      setView(false);
    });
}

initialize();
