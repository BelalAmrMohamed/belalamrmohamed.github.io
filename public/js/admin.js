const demoProjects = [
  {
    id: 'demo-1',
    title: 'Number Systems App',
    summary: 'A learning-focused app for binary, decimal, octal, and hexadecimal conversion.',
    category: 'Mobile App',
    project_url: 'https://github.com/BelalAmrMohamed/NumberSystemsApp',
    github_url: 'https://github.com/BelalAmrMohamed/NumberSystemsApp',
    image_url: 'images/portfolio/gellary/g-numbersystems.jpg',
    featured: true,
    status: 'featured',
  },
  {
    id: 'demo-2',
    title: 'Encryption Methods',
    summary: 'An educational website for explaining classic ciphers and cryptographic techniques.',
    category: 'Education',
    project_url: 'https://belalamrmohamed.github.io/Encryption-Methods/',
    github_url: 'https://github.com/BelalAmrMohamed/Encryption-Methods',
    image_url: 'images/portfolio/gellary/g-encyption.jpg',
    featured: true,
    status: 'active',
  },
  {
    id: 'demo-3',
    title: 'Quiz Master',
    summary: 'A student-focused platform for logic, programming, and AI revision quizzes.',
    category: 'Web Platform',
    project_url: 'https://basmagi-quiz.vercel.app/',
    github_url: 'https://github.com/BelalAmrMohamed',
    image_url: 'images/portfolio/gellary/g-quiz.jpg',
    featured: false,
    status: 'active',
  },
];

const appState = {
  projects: [...demoProjects],
  currentUser: null,
};

const config = window.BELAL_PORTFOLIO_CONFIG || {};
let activeSupabaseClient = null;

function getSupabaseClient() {
  if (window.BELAL_PORTFOLIO_CONFIG.demoMode) {
    return null;
  }

  if (!window.supabase) {
    return null;
  }

  if (!activeSupabaseClient && window.BELAL_PORTFOLIO_CONFIG.supabaseUrl && window.BELAL_PORTFOLIO_CONFIG.anonKey) {
    activeSupabaseClient = window.supabase.createClient(window.BELAL_PORTFOLIO_CONFIG.supabaseUrl, window.BELAL_PORTFOLIO_CONFIG.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return activeSupabaseClient;
}

const authView = document.getElementById('authView');
const dashboardView = document.getElementById('dashboardView');
const loginForm = document.getElementById('loginForm');
const projectForm = document.getElementById('projectForm');
const projectList = document.getElementById('projectList');
const authStatus = document.getElementById('authStatus');
const totalProjectsEl = document.getElementById('totalProjects');
const featuredProjectsEl = document.getElementById('featuredProjects');
const userEmailEl = document.getElementById('userEmail');
const projectIdInput = document.getElementById('projectId');
const formTitle = document.getElementById('formTitle');

function setStatus(message, type = 'info') {
  authStatus.textContent = message || '';
  authStatus.className = `status ${type}`;
}

function getProjectFormState() {
  return {
    id: projectIdInput.value || undefined,
    title: document.getElementById('projectTitle').value.trim(),
    category: document.getElementById('projectCategory').value.trim() || 'Web Development',
    project_url: document.getElementById('projectUrl').value.trim(),
    github_url: document.getElementById('projectGithub').value.trim(),
    image_url: document.getElementById('projectImage').value.trim(),
    summary: document.getElementById('projectSummary').value.trim(),
    status: document.getElementById('projectStatus').value,
    featured: document.getElementById('projectStatus').value === 'featured',
  };
}

function resetProjectForm() {
  projectForm.reset();
  document.getElementById('projectStatus').value = 'featured';
  projectIdInput.value = '';
  formTitle.textContent = 'Add project';
}

function renderProjectList() {
  const projects = appState.projects || [];
  totalProjectsEl.textContent = String(projects.length);
  featuredProjectsEl.textContent = String(projects.filter((project) => project.featured).length);

  if (!projects.length) {
    projectList.innerHTML = '<li class="empty-state">No projects yet. Add your first portfolio item.</li>';
    return;
  }

  projectList.innerHTML = projects
    .map((project) => `
      <li class="project-item">
        <div class="project-item-header">
          <strong>${project.title}</strong>
          <span class="tag">${project.category || 'General'}</span>
        </div>
        <p>${project.summary || 'No summary provided yet.'}</p>
        <div class="project-item-actions">
          <button class="mini-btn secondary-btn" type="button" data-edit-id="${project.id}">Edit</button>
          <button class="mini-btn danger-btn" type="button" data-delete-id="${project.id}">Delete</button>
        </div>
      </li>
    `)
    .join('');

  projectList.querySelectorAll('[data-edit-id]').forEach((button) => {
    button.addEventListener('click', () => populateProjectForm(button.dataset.editId));
  });

  projectList.querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', () => deleteProject(button.dataset.deleteId));
  });
}

function populateProjectForm(projectId) {
  const project = (appState.projects || []).find((item) => item.id === projectId);
  if (!project) return;

  projectIdInput.value = project.id;
  document.getElementById('projectTitle').value = project.title || '';
  document.getElementById('projectCategory').value = project.category || 'Web Development';
  document.getElementById('projectUrl').value = project.project_url || '';
  document.getElementById('projectGithub').value = project.github_url || '';
  document.getElementById('projectImage').value = project.image_url || '';
  document.getElementById('projectSummary').value = project.summary || '';
  document.getElementById('projectStatus').value = project.status || 'active';
  formTitle.textContent = 'Edit project';
}

async function loadProjects() {
  const client = getSupabaseClient();

  if (!client) {
    appState.projects = [...demoProjects];
    renderProjectList();
    return;
  }

  try {
    const { data, error } = await client
      .from('portfolio_projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase project fetch failed. Using demo data instead.', error);
      appState.projects = [...demoProjects];
      setStatus('Demo data is loaded until the portfolio schema is applied in Supabase.', 'info');
      renderProjectList();
      return;
    }

    appState.projects = data && data.length ? data : [...demoProjects];
    renderProjectList();
  } catch (error) {
    console.error('Unhandled project fetch issue', error);
    appState.projects = [...demoProjects];
    renderProjectList();
  }
}

async function saveProject(event) {
  event.preventDefault();

  const payload = getProjectFormState();
  if (!payload.title) {
    setStatus('Project title is required before saving.', 'error');
    return;
  }

  const client = getSupabaseClient();

  if (!client) {
    if (payload.id) {
      appState.projects = appState.projects.map((project) => (project.id === payload.id ? { ...project, ...payload } : project));
    } else {
      const nextProject = {
        ...payload,
        id: `demo-${Date.now()}`,
      };
      appState.projects = [nextProject, ...appState.projects];
    }
    setStatus('Saved in demo mode. Connect Supabase to persist data.', 'success');
    renderProjectList();
    resetProjectForm();
    return;
  }

  const record = {
    title: payload.title,
    category: payload.category,
    project_url: payload.project_url || null,
    github_url: payload.github_url || null,
    image_url: payload.image_url || null,
    summary: payload.summary || null,
    featured: payload.featured,
    status: payload.status || 'active',
  };

  try {
    let response;

    if (payload.id) {
      response = await client
        .from('portfolio_projects')
        .update(record)
        .eq('id', payload.id)
        .select();
    } else {
      response = await client
        .from('portfolio_projects')
        .insert(record)
        .select();
    }

    if (response.error) {
      throw response.error;
    }

    setStatus(payload.id ? 'Project updated successfully.' : 'Project created successfully.', 'success');
    resetProjectForm();
    await loadProjects();
  } catch (error) {
    console.error('Project save error', error);
    setStatus('Could not save this project. Check that your Supabase schema has been applied.', 'error');
  }
}

async function deleteProject(projectId) {
  const project = (appState.projects || []).find((item) => item.id === projectId);
  if (!project) return;

  const confirmed = window.confirm(`Delete "${project.title}" from the portfolio?`);
  if (!confirmed) return;

  const client = getSupabaseClient();

  if (!client) {
    appState.projects = (appState.projects || []).filter((item) => item.id !== projectId);
    setStatus('Project removed from demo mode.', 'success');
    renderProjectList();
    return;
  }

  try {
    const { error } = await client.from('portfolio_projects').delete().eq('id', projectId);
    if (error) {
      throw error;
    }
    setStatus('Project deleted.', 'success');
    await loadProjects();
  } catch (error) {
    console.error('Delete failed', error);
    setStatus('Unable to delete project right now. Please verify the table permissions.', 'error');
  }
}

async function signInWithEmail(event) {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    setStatus('Please add both your email and your password.', 'error');
    return;
  }

  const client = getSupabaseClient();
  if (!client || window.BELAL_PORTFOLIO_CONFIG.demoMode) {
    appState.currentUser = { email };
    setSession(appState.currentUser);
    setStatus('Demo mode enabled. You can manage the portfolio until Supabase is configured.', 'success');
    return;
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
    setSession(data.user);
    setStatus('Signed in successfully.', 'success');
  } catch (error) {
    console.error('Email sign-in failed', error);
    setStatus('Invalid credentials or unknown Supabase user. Use the demo mode or create the account in Supabase.', 'error');
  }
}

async function signInWithProvider(provider) {
  const client = getSupabaseClient();
  if (!client) {
    setStatus('OAuth providers require a Supabase configuration. Use email demo mode instead.', 'error');
    return;
  }

  try {
    const redirectUrl = `${window.location.origin}${window.location.pathname}`;
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('OAuth login failed', error);
    setStatus('OAuth sign-in was not completed. Check your Supabase Auth provider configuration.', 'error');
  }
}

async function signOut() {
  const client = getSupabaseClient();
  if (!client || window.BELAL_PORTFOLIO_CONFIG.demoMode) {
    window.BELAL_PORTFOLIO_CONFIG.demoMode = false;
    appState.currentUser = null;
    setSession(null);
    setStatus('Signed out from demo mode.', 'success');
    return;
  }

  try {
    const { error } = await client.auth.signOut();
    if (error) {
      throw error;
    }
    setSession(null);
  } catch (error) {
    console.error('Sign out failed', error);
    setStatus('There was a problem signing out.', 'error');
  }
}

function setSession(user) {
  const isLoggedIn = Boolean(user);
  authView.classList.toggle('hidden', isLoggedIn);
  dashboardView.classList.toggle('hidden', !isLoggedIn);

  appState.currentUser = user;
  userEmailEl.textContent = user?.email || 'admin';

  if (isLoggedIn) {
    loadProjects();
  }
}

async function initializeApp() {
  const client = getSupabaseClient();

  if (!client) {
    setStatus('Supabase is not configured, so demo mode is active. Add your real keys to enable live auth.', 'info');
    setSession({ email: 'admin@demo.local' });
    return;
  }

  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (error) {
      throw error;
    }

    if (session) {
      setSession(session.user);
    } else {
      setSession(null);
    }

    client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession?.user || null);
    });
  } catch (error) {
    console.error('Session initialization failed', error);
    setSession(null);
  }
}

loginForm.addEventListener('submit', signInWithEmail);
document.getElementById('demoModeBtn').addEventListener('click', () => {
  window.BELAL_PORTFOLIO_CONFIG.demoMode = true;
  document.getElementById('email').value = 'admin@demo.local';
  document.getElementById('password').value = 'demo-password';
  signInWithEmail({ preventDefault: () => {} });
});
document.getElementById('googleLoginBtn').addEventListener('click', () => signInWithProvider('google'));
document.getElementById('githubLoginBtn').addEventListener('click', () => signInWithProvider('github'));
document.getElementById('signOutBtn').addEventListener('click', signOut);
projectForm.addEventListener('submit', saveProject);
document.getElementById('resetProjectForm').addEventListener('click', resetProjectForm);

resetProjectForm();
initializeApp();
