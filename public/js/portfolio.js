(function () {
  const config = window.BELAL_PORTFOLIO_CONFIG || {};
  const listRoot = document.getElementById('portfolioList');
  const modalRoot = document.getElementById('portfolioModals');
  if (!listRoot || !modalRoot) return;

  function safeLink(value, allowRelative = false) {
    if (!value) return null;
    try {
      const parsed = new URL(value, window.location.origin);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        if (allowRelative || parsed.origin !== window.location.origin) return parsed.href;
        return value.startsWith('/') || !value.includes('://') ? value : parsed.href;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function setText(parent, selector, text) {
    const element = parent.querySelector(selector);
    if (element) element.textContent = text;
  }

  function createProjectCard(project, index) {
    const item = document.createElement('li');
    item.className = 'folio-list__item column';
    item.setAttribute('data-animate-el', '');

    const modalId = `portfolio-modal-${index}`;
    const openModal = document.createElement('a');
    openModal.className = 'folio-list__item-link';
    openModal.href = `#${modalId}`;

    const picture = document.createElement('div');
    picture.className = 'folio-list__item-pic';
    const image = document.createElement('img');
    image.src = safeLink(project.image_url, true) || 'images/portfolio/ns.jpg';
    image.alt = project.title || 'Portfolio project';
    image.loading = 'lazy';
    picture.appendChild(image);

    const text = document.createElement('div');
    text.className = 'folio-list__item-text';
    const category = document.createElement('div');
    category.className = 'folio-list__item-cat';
    category.textContent = project.category || 'Project';
    const title = document.createElement('div');
    title.className = 'folio-list__item-title';
    title.textContent = project.title || 'Untitled project';
    text.append(category, title);
    openModal.append(picture, text);
    item.appendChild(openModal);

    const projectUrl = safeLink(project.project_url) || safeLink(project.github_url);
    if (projectUrl) {
      const externalLink = document.createElement('a');
      externalLink.className = 'folio-list__proj-link';
      externalLink.href = projectUrl;
      externalLink.target = '_blank';
      externalLink.rel = 'noopener noreferrer';
      externalLink.title = `Open ${project.title || 'project'}`;
      externalLink.setAttribute('aria-label', `Open ${project.title || 'project'}`);
      externalLink.innerHTML = '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8.14645 3.14645C8.34171 2.95118 8.65829 2.95118 8.85355 3.14645L12.8536 7.14645C13.0488 7.34171 13.0488 7.65829 12.8536 7.85355L8.85355 11.8536C8.65829 12.0488 8.34171 12.0488 8.14645 11.8536C7.95118 11.6583 7.95118 11.3417 8.14645 11.1464L11.2929 8H2.5C2.22386 8 2 7.77614 2 7.5C2 7.22386 2.22386 7 2.5 7H11.2929L8.14645 3.85355C7.95118 3.65829 7.95118 3.34171 8.14645 3.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/></svg>';
      item.appendChild(externalLink);
    }

    return { item, modalId, project };
  }

  function createProjectModal(project, id) {
    const wrapper = document.createElement('div');
    wrapper.id = id;
    wrapper.hidden = true;
    const modal = document.createElement('div');
    modal.className = 'modal-popup';

    const imageUrl = safeLink(project.image_url, true);
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = project.title || 'Portfolio project';
      image.loading = 'lazy';
      modal.appendChild(image);
    }

    const description = document.createElement('div');
    description.className = 'modal-popup__desc';
    const heading = document.createElement('h5');
    heading.textContent = project.title || 'Project';
    const summary = document.createElement('p');
    summary.textContent = project.summary || '';
    const categoryList = document.createElement('ul');
    categoryList.className = 'modal-popup__cat';
    const categoryItem = document.createElement('li');
    categoryItem.textContent = project.category || 'Project';
    categoryList.appendChild(categoryItem);
    description.append(heading, summary, categoryList);
    modal.appendChild(description);

    const projectUrl = safeLink(project.project_url) || safeLink(project.github_url);
    if (projectUrl) {
      const link = document.createElement('a');
      link.href = projectUrl;
      link.className = 'modal-popup__details';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Project link';
      modal.appendChild(link);
    }

    wrapper.appendChild(modal);
    return wrapper;
  }

  function renderProjects(projects) {
    listRoot.replaceChildren();
    modalRoot.replaceChildren();
    projects.forEach((project, index) => {
      const card = createProjectCard(project, index);
      listRoot.appendChild(card.item);
      modalRoot.appendChild(createProjectModal(card.project, card.modalId));
    });

    if (!projects.length) {
      const empty = document.createElement('li');
      empty.className = 'portfolio-empty';
      empty.textContent = 'Projects will appear here soon.';
      listRoot.appendChild(empty);
    }

    if (typeof window.initializePortfolioLightbox === 'function') {
      window.initializePortfolioLightbox();
    }
  }

  async function loadPublicSettings(client) {
    const { data, error } = await client
      .from('portfolio_settings')
      .select('key, value')
      .in('key', ['site_title', 'site_tagline']);
    if (error) throw error;

    const settings = Object.fromEntries((data || []).map(({ key, value }) => [key, value]));
    if (settings.site_title) {
      document.title = `${settings.site_title} | Portfolio`;
      document.querySelectorAll('[data-site-title]').forEach((element) => {
        element.textContent = settings.site_title;
      });
    }
    if (settings.site_tagline) {
      const description = document.querySelector('meta[name="description"]');
      if (description) description.content = settings.site_tagline;
      document.querySelectorAll('[data-site-tagline]').forEach((element) => {
        element.textContent = settings.site_tagline;
      });
    }
  }

  async function loadPortfolio() {
    if (!window.supabase || !config.supabaseUrl || !config.publishableKey) {
      console.error('Portfolio Supabase configuration is missing.');
      renderProjects([]);
      return;
    }

    const client = window.supabase.createClient(config.supabaseUrl, config.publishableKey);
    try {
      const [{ data, error }] = await Promise.all([
        client
          .from('portfolio_projects')
          .select('id, title, summary, category, project_url, github_url, image_url, featured, status, is_published')
          .eq('is_published', true)
          .neq('status', 'archived')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
        loadPublicSettings(client),
      ]);
      if (error) throw error;
      renderProjects(data || []);
    } catch (error) {
      console.error('Public portfolio data failed to load', error);
      renderProjects([]);
      const notice = document.createElement('p');
      notice.className = 'portfolio-empty';
      notice.textContent = 'Portfolio projects are temporarily unavailable.';
      listRoot.replaceChildren(notice);
    }
  }

  loadPortfolio();
})();
