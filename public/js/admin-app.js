const config = window.BELAL_PORTFOLIO_CONFIG || {};
const supabaseLibrary = window.supabase;
const authView = document.querySelector('.login');
const dashboardView = document.getElementById('dashboardView');
const authStatus = document.getElementById('auth-status');
const dashboardStatus = document.getElementById('dashboardStatus');
const loginForm = document.getElementById('email-form');
const projectForm = document.getElementById('projectForm');
const settingsForm = document.getElementById('settingsForm');
const projectList = document.getElementById('projectList');
const projectIdField = document.getElementById('projectId');
const userEmail = document.getElementById('userEmail');
const supabaseClient = supabaseLibrary && config.supabaseUrl && config.publishableKey
  ? supabaseLibrary.createClient(config.supabaseUrl, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

let projects = [];
let activeUserId = null;

function showStatus(element, message, kind = 'info') {
  element.textContent = message;
  element.dataset.kind = kind;
}

function toggleBusy(isBusy) {
  document.querySelectorAll('#email-form button, #google-btn, #github-btn').forEach((button) => {
    button.disabled = isBusy;
  });
}

function setView(isAuthenticated) {
  authView.classList.toggle('hidden', isAuthenticated);
  dashboardView.classList.toggle('hidden', !isAuthenticated);
}

function createProjectCard(project) {
  const item = document.createElement('li');
  item.className = 'project-item';

  const header = document.createElement('div');
  header.className = 'project-item-header';
  const title = document.createElement('strong');
  title.textContent = project.title;
  const category = document.createElement('span');
  category.className = 'project-tag';
  category.textContent = project.category || 'Project';
  header.append(title, category);

  const summary = document.createElement('p');
  summary.textContent = project.summary || 'No description yet.';

  const meta = document.createElement('div');
  meta.className = 'project-item-meta';
  const status = document.createElement('span');
  status.className = 'project-tag';
  status.textContent = project.status;
  const published = document.createElement('span');
  published.className = 'project-tag';
  published.textContent = project.is_published ? 'Published' : 'Draft';
  meta.append(status, published);

  const actions = document.createElement('div');
  actions.className = 'project-item-actions';
  const editButton = document.createElement('button');
  editButton.className = 'btn btn-outline';
  editButton.type = 'button';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => populateProjectForm(project));

  const deleteButton = document.createElement('button');
  deleteButton.className = 'btn btn-outline delete-project';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => deleteProject(project));
  actions.append(editButton, deleteButton);

  item.append(header, summary, meta, actions);
  return item;
}

function renderProjects() {
  document.getElementById('totalProjects').textContent = String(projects.length);
  document.getElementById('featuredProjects').textContent = String(projects.filter((project) => project.featured).length);
  document.getElementById('publishedProjects').textContent = String(projects.filter((project) => project.is_published).length);

  projectList.replaceChildren();
  if (!projects.length) {
    const empty = document.createElement('li');
    empty.className = 'project-empty';
    empty.textContent = 'No projects yet. Add one using the project editor.';
    projectList.appendChild(empty);
    return;
  }

  projects.forEach((project) => projectList.appendChild(createProjectCard(project)));
}

function resetProjectForm() {
  projectForm.reset();
  projectIdField.value = '';
  document.getElementById('projectPublished').checked = true;
  document.getElementById('formTitle').textContent = 'Add project';
  document.getElementById('saveProjectBtn').textContent = 'Save project';
}

function populateProjectForm(project) {
  projectIdField.value = project.id;
  document.getElementById('projectTitle').value = project.title || '';
  document.getElementById('projectCategory').value = project.category || '';
  document.getElementById('projectSummary').value = project.summary || '';
  document.getElementById('projectImage').value = project.image_url || '';
  document.getElementById('projectUrl').value = project.project_url || '';
  document.getElementById('projectGithub').value = project.github_url || '';
  document.getElementById('projectStatus').value = project.status || 'active';
  document.getElementById('projectPublished').checked = Boolean(project.is_published);
  document.getElementById('formTitle').textContent = 'Edit project';
  document.getElementById('saveProjectBtn').textContent = 'Update project';
  document.getElementById('projectTitle').focus();
}

async function loadProjects() {
  showStatus(dashboardStatus, 'Loading portfolio data…');
  try {
    const { data, error } = await supabaseClient
      .from('portfolio_projects')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;
    projects = data || [];
    renderProjects();
    showStatus(dashboardStatus, '');
  } catch (error) {
    console.error('Project query failed', error);
    showStatus(dashboardStatus, `Could not load projects: ${error.message || 'Unexpected error.'}`, 'error');
  }
}

function getProjectRecord() {
  const status = document.getElementById('projectStatus').value;
  return {
    title: document.getElementById('projectTitle').value.trim(),
    category: document.getElementById('projectCategory').value.trim(),
    summary: document.getElementById('projectSummary').value.trim(),
    image_url: document.getElementById('projectImage').value.trim() || null,
    project_url: document.getElementById('projectUrl').value.trim() || null,
    github_url: document.getElementById('projectGithub').value.trim() || null,
    status,
    featured: status === 'featured',
    is_published: document.getElementById('projectPublished').checked,
  };
}

async function saveProject(event) {
  event.preventDefault();
  const record = getProjectRecord();
  const projectId = projectIdField.value;

  if (!record.title || !record.category) {
    showStatus(dashboardStatus, 'Project title and category are required.', 'error');
    return;
  }

  const saveButton = document.getElementById('saveProjectBtn');
  saveButton.disabled = true;
  try {
    const query = projectId
      ? supabaseClient.from('portfolio_projects').update(record).eq('id', projectId)
      : supabaseClient.from('portfolio_projects').insert(record);
    const { error } = await query.select('id').single();
    if (error) throw error;

    resetProjectForm();
    showStatus(dashboardStatus, projectId ? 'Project updated.' : 'Project created.', 'success');
    await loadProjects();
  } catch (error) {
    console.error('Project save failed', error);
    showStatus(dashboardStatus, `Could not save the project: ${error.message}`, 'error');
  } finally {
    saveButton.disabled = false;
  }
}

async function deleteProject(project) {
  if (!window.confirm(`Delete “${project.title}”? This cannot be undone.`)) return;

  try {
    const { error } = await supabaseClient
      .from('portfolio_projects')
      .delete()
      .eq('id', project.id);
    if (error) throw error;

    if (projectIdField.value === project.id) resetProjectForm();
    showStatus(dashboardStatus, 'Project deleted.', 'success');
    await loadProjects();
  } catch (error) {
    console.error('Project delete failed', error);
    showStatus(dashboardStatus, `Could not delete the project: ${error.message}`, 'error');
  }
}

async function loadSettings() {
  try {
    const { data, error } = await supabaseClient
      .from('portfolio_settings')
      .select('key, value')
      .in('key', ['site_title', 'site_tagline']);

    if (error) throw error;
    const settings = Object.fromEntries((data || []).map((setting) => [setting.key, setting.value]));
    document.getElementById('siteTitle').value = settings.site_title || '';
    document.getElementById('siteTagline').value = settings.site_tagline || '';
  } catch (error) {
    console.error('Site settings query failed', error);
    showStatus(dashboardStatus, `Could not load site settings: ${error.message || 'Unexpected error.'}`, 'error');
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = [
    { key: 'site_title', value: document.getElementById('siteTitle').value.trim(), is_public: true },
    { key: 'site_tagline', value: document.getElementById('siteTagline').value.trim(), is_public: true },
  ];

  try {
    const { error } = await supabaseClient
      .from('portfolio_settings')
      .upsert(settings, { onConflict: 'key' });
    if (error) throw error;
    showStatus(dashboardStatus, 'Public site details saved.', 'success');
  } catch (error) {
    console.error('Site settings save failed', error);
    showStatus(dashboardStatus, `Could not save site settings: ${error.message}`, 'error');
  }
}

async function acceptSessionUser(user) {
  if (!user) {
    activeUserId = null;
    setView(false);
    return;
  }

  if (!config.adminEmail || user.email?.toLowerCase() !== config.adminEmail.toLowerCase()) {
    activeUserId = null;
    setView(false);
    showStatus(authStatus, 'This account is not authorized to manage this portfolio.', 'error');
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      console.error('Could not clear the unauthorized session', error);
      showStatus(authStatus, 'This account is not authorized, and its session could not be cleared. Sign out manually.', 'error');
    }
    return;
  }

  if (activeUserId === user.id) return;
  activeUserId = user.id;
  userEmail.textContent = user.email;
  setView(true);
  await Promise.all([loadProjects(), loadSettings()]);
}

async function signInWithPassword(event) {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  toggleBusy(true);
  showStatus(authStatus, 'Signing in…');

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('Supabase did not return a signed-in user.');
  } catch (error) {
    console.error('Email sign-in failed', error);
    showStatus(authStatus, error.message || 'Sign-in failed.', 'error');
  } finally {
    toggleBusy(false);
  }
}

async function signInWithProvider(provider) {
  if (!supabaseClient) return;
  toggleBusy(true);
  showStatus(authStatus, `Redirecting to ${provider === 'google' ? 'Google' : 'GitHub'}…`);

  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/admin` },
    });
    if (error) throw error;
  } catch (error) {
    console.error(`${provider} OAuth sign-in failed`, error);
    showStatus(authStatus, error.message || 'OAuth sign-in failed.', 'error');
    toggleBusy(false);
  }
}

async function requestPasswordReset(event) {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  if (!email) {
    showStatus(authStatus, 'Enter your email address first.', 'error');
    document.getElementById('email').focus();
    return;
  }

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin`,
    });
    if (error) throw error;
    showStatus(authStatus, 'If the address belongs to an account, a password reset link has been sent.', 'success');
  } catch (error) {
    console.error('Password reset request failed', error);
    showStatus(authStatus, error.message || 'Password reset request failed.', 'error');
  }
}

async function signOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    setView(false);
    showStatus(authStatus, 'You are signed out.', 'success');
  } catch (error) {
    console.error('Sign-out failed', error);
    showStatus(dashboardStatus, error.message || 'Sign-out failed.', 'error');
  }
}

function initialize() {
  if (!supabaseClient) {
    showStatus(authStatus, 'Supabase configuration is missing. Authentication is unavailable.', 'error');
    toggleBusy(true);
    return;
  }

  loginForm.addEventListener('submit', signInWithPassword);
  document.getElementById('google-btn').addEventListener('click', () => signInWithProvider('google'));
  document.getElementById('github-btn').addEventListener('click', () => signInWithProvider('github'));
  document.getElementById('reset-password').addEventListener('click', requestPasswordReset);
  document.getElementById('signOutBtn').addEventListener('click', signOut);
  document.getElementById('refreshProjectsBtn').addEventListener('click', loadProjects);
  document.getElementById('resetProjectForm').addEventListener('click', resetProjectForm);
  projectForm.addEventListener('submit', saveProject);
  settingsForm.addEventListener('submit', saveSettings);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => {
      void acceptSessionUser(session?.user || null).catch((error) => {
        console.error('Could not process the Supabase auth state', error);
        activeUserId = null;
        setView(false);
        showStatus(authStatus, 'Could not verify your account. Please sign in again.', 'error');
      });
    }, 0);
  });

  supabaseClient.auth.getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      return acceptSessionUser(data.session?.user || null);
    })
    .catch((error) => {
      console.error('Could not restore the Supabase session', error);
      showStatus(authStatus, 'Could not restore your session. Please sign in again.', 'error');
      setView(false);
    });
}

initialize();
