// Pure list helpers: filtering, sorting and reordering. No DOM.

const byManual = (a, b) =>
  (a.sort_order - b.sort_order) || (new Date(b.created_at) - new Date(a.created_at));

/**
 * 'manual' is EXACTLY the public site's ordering
 * (sort_order ascending, then created_at descending — see public/js/portfolio.js).
 */
export const SORTERS = {
  manual: byManual,
  newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
  oldest: (a, b) => new Date(a.created_at) - new Date(b.created_at),
  updated: (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
};

export function sortProjects(list, mode = 'manual') {
  return [...list].sort(SORTERS[mode] || byManual);
}

export function filterProjects(list, { query = '', status = '', category = '', published = '' } = {}) {
  const q = query.trim().toLowerCase();
  return list.filter((project) => {
    if (status && project.status !== status) return false;
    if (category && project.category !== category) return false;
    if (published === 'yes' && !project.is_published) return false;
    if (published === 'no' && project.is_published) return false;
    if (q) {
      const haystack = `${project.title} ${project.summary} ${project.category}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function hasActiveFilters(filters) {
  return Boolean(filters.query?.trim() || filters.status || filters.category || filters.published);
}

export function moveInArray(array, from, to) {
  if (from === to || from < 0 || to < 0 || from >= array.length || to >= array.length) return [...array];
  const copy = [...array];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function sameOrder(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** New projects go to the top, which is where sort_order 0 put them before. */
export function topSortOrder(list) {
  if (!list.length) return 10;
  return Math.min(...list.map((project) => project.sort_order)) - 10;
}

export function stats(list) {
  return {
    total: list.length,
    published: list.filter((p) => p.is_published && p.status !== 'archived').length,
    featured: list.filter((p) => p.status === 'featured').length,
    hidden: list.filter((p) => !p.is_published || p.status === 'archived').length,
  };
}
