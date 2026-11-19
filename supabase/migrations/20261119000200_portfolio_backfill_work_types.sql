-- =============================================================================
-- 20261119000200_portfolio_backfill_work_types.sql
-- Owner-delegated mapping of the known seed projects. Only rows whose
-- work_type is still NULL are touched, matched by exact title; any other live
-- row stays unclassified (shown only in the landing page's legacy Works
-- section) until classified in the admin. Slugs are only set when free.
--   app_tool: Number Systems App, Calculator App, Basmagi Quiz Platform
--   website : Number Systems Website, Encryption Methods
-- No publication, featured, order, link or image data is changed.
-- Rollback: supabase/rollbacks/20261119000200_rollback.sql
-- =============================================================================
with mapping(title, work_type, slug) as (values
  ('Number Systems App',        'app_tool', 'number-systems-app'),
  ('Calculator App',            'app_tool', 'calculator-app'),
  ('Basmagi Quiz Platform',     'app_tool', 'basmagi-quiz-platform'),
  ('Number Systems Website',    'website',  'number-systems-website'),
  ('Encryption Methods',        'website',  'encryption-methods')
)
update public.portfolio_projects p
set work_type = m.work_type,
    slug = coalesce(p.slug,
      case when not exists (select 1 from public.portfolio_projects o
                            where o.slug = m.slug and o.id <> p.id) then m.slug end)
from mapping m
where p.title = m.title and p.work_type is null;
