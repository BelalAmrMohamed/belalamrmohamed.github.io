(function () {
  const demoProjects = [
    {
      id: 'demo-1',
      title: 'Number Systems App',
      summary: 'A learning-focused app for binary, decimal, octal, and hexadecimal conversion.',
      category: 'First app',
      project_url: 'https://github.com/BelalAmrMohamed/NumberSystemsApp',
      github_url: 'https://github.com/BelalAmrMohamed/NumberSystemsApp',
      image_url: 'images/portfolio/gellary/g-numbersystems.jpg',
      featured: true,
      status: 'featured',
    },
    {
      id: 'demo-2',
      title: 'Calculator App',
      summary: 'A polished calculator project that helped me learn core UI and logic patterns in .NET MAUI.',
      category: 'Calculator',
      project_url: 'https://github.com/BelalAmrMohamed/Calculator-app',
      github_url: 'https://github.com/BelalAmrMohamed/Calculator-app',
      image_url: 'images/portfolio/gellary/g-calculator.jpg',
      featured: true,
      status: 'active',
    },
    {
      id: 'demo-3',
      title: 'Number Systems Website',
      summary: 'A complete converter and calculator for binary, decimal, octal, and hexadecimal values.',
      category: 'Number systems',
      project_url: 'https://belalamrmohamed.github.io/NumberSystems/',
      github_url: 'https://github.com/BelalAmrMohamed/NumberSystems',
      image_url: 'images/portfolio/gellary/g-numbersystems - web.jpg',
      featured: true,
      status: 'active',
    },
    {
      id: 'demo-4',
      title: 'Encryption Methods',
      summary: 'An educational platform for teaching classical ciphering methods with examples and visualizers.',
      category: 'Educatoinal',
      project_url: 'https://belalamrmohamed.github.io/Encryption-Methods/',
      github_url: 'https://github.com/BelalAmrMohamed/Encryption-Methods',
      image_url: 'images/portfolio/gellary/g-encyption.jpg',
      featured: true,
      status: 'featured',
    },
    {
      id: 'demo-5',
      title: 'Quiz Master',
      summary: 'An interactive learning platform for logic, programming, and AI study quizzes.',
      category: 'Educational quizzes platform',
      project_url: 'https://basmagi-quiz.vercel.app/',
      github_url: 'https://github.com/BelalAmrMohamed',
      image_url: 'images/portfolio/gellary/g-quiz.jpg',
      featured: false,
      status: 'active',
    },
  ];

  const config = window.BELAL_PORTFOLIO_CONFIG || {};
  const listRoot = document.getElementById('portfolioList');
  const modalRoot = document.getElementById('portfolioModals');

  if (!listRoot || !modalRoot) {
    return;
  }

  function createProjectCards(projects) {
    return projects.map((project, index) => {
      const sourceUrl = project.project_url || project.github_url || '#';
      const titleWords = project.title.split(' ') || ['Project'];
      const shortTitle = titleWords.slice(0, 2).join(' ');

      return `
        <li class="folio-list__item column" data-animate-el>
          <a class="folio-list__item-link" href="#modal-${project.id || index + 1}">
            <div class="folio-list__item-pic">
              <img src="${project.image_url || 'images/portfolio/gellary/g-numbersystems.jpg'}" alt="${project.title}">
            </div>

            <div class="folio-list__item-text">
              <div class="folio-list__item-cat">${project.category || 'Project'}</div>
              <div class="folio-list__item-title">${shortTitle}</div>
            </div>
          </a>
          <a class="folio-list__proj-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer" title="${project.title}">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8.14645 3.14645C8.34171 2.95118 8.65829 2.95118 8.85355 3.14645L12.8536 7.14645C13.0488 7.34171 13.0488 7.65829 12.8536 7.85355L8.85355 11.8536C8.65829 12.0488 8.34171 12.0488 8.14645 11.8536C7.95118 11.6583 7.95118 11.3417 8.14645 11.1464L11.2929 8H2.5C2.22386 8 2 7.77614 2 7.5C2 7.22386 2.22386 7 2.5 7H11.2929L8.14645 3.85355C7.95118 3.65829 7.95118 3.34171 8.14645 3.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path>
            </svg>
          </a>
        </li>
      `;
    }).join('');
  }

  function createProjectModals(projects) {
    return projects.map((project, index) => `
      <div id="modal-${project.id || index + 1}" hidden>
        <div class="modal-popup">
          <img src="${project.image_url || 'images/portfolio/gellary/g-numbersystems.jpg'}" alt="${project.title}">

          <div class="modal-popup__desc">
            <h5>${project.title}</h5>
            <p>${project.summary || 'A project built to explore and solve a real problem.'}</p>
            <ul class="modal-popup__cat">
              <li>${project.category || 'Project'}</li>
            </ul>
          </div>

          <a href="${project.project_url || project.github_url || '#'}" class="modal-popup__details" target="_blank" rel="noopener noreferrer">Project link</a>
        </div>
      </div>
    `).join('');
  }

  function renderPortfolio(projects) {
    const portfolioItems = projects.filter((project) => project.status !== 'archived');
    listRoot.innerHTML = createProjectCards(portfolioItems);
    modalRoot.innerHTML = createProjectModals(portfolioItems);

    if (typeof window.initializePortfolioLightbox === 'function') {
      window.initializePortfolioLightbox();
    }
  }

  async function loadPortfolio() {
    const projects = config.demoMode === true ? demoProjects : demoProjects;
    renderPortfolio(projects);

    if (typeof window.supabase !== 'undefined' && config.supabaseUrl && config.anonKey && config.demoMode !== true) {
      try {
        const supabase = window.supabase.createClient(config.supabaseUrl, config.anonKey);
        const { data, error } = await supabase.from('portfolio_projects').select('*').order('created_at', { ascending: false });
        if (!error && Array.isArray(data) && data.length) {
          renderPortfolio(data);
        }
      } catch (error) {
        console.warn('Portfolio data load failed, using demo projects.', error);
      }
    }
  }

  loadPortfolio();
})();
