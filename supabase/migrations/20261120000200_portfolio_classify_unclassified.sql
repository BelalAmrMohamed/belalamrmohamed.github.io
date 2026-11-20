-- =============================================================================
-- 20261120000200_portfolio_classify_unclassified.sql
-- Owner-decided types for the six rows that had work_type NULL (plan §8 step 9g).
-- Matched by id, so only these rows change. Only rows still NULL are touched.
--   website : منصة امتحانات بصمجي, Mr. Amr Mohamed, رحلة في السيرة (also has an
--             Android app; the Android link is not stored here), على رفوف المساجد
--   app_tool: OS Projects (MAUI + WinForms), Clipbook
-- Slugs are proposals (transliterated, ASCII) and are set only when free; change
-- them in the admin if preferred. No publication, featured, order, link or image
-- data is changed.
-- Rollback: supabase/rollbacks/20261120000200_rollback.sql
-- =============================================================================
with mapping(id, work_type, slug) as (values
  ('b21a746a-19ea-484c-b5c4-ddf16c50ac00'::uuid, 'website',  'mr-amr-mohamed'),
  ('5dba656d-ae9a-4287-9839-4d0a26d8f2a1'::uuid, 'app_tool', 'os-projects-maui-winforms'),
  ('3e11f993-7887-42f9-a89f-f5abf40be821'::uuid, 'website',  'rihlat-fi-al-sira'),
  ('ebfde342-5236-4aed-a4fd-cc39044c5d8e'::uuid, 'website',  'ala-rufuf-al-masajid'),
  ('1d784f34-c8c1-41d6-9703-d86d2c96363b'::uuid, 'website',  'basmagi-exams-platform'),
  ('c941406c-5afb-4bee-bfdb-8718ce724c9a'::uuid, 'app_tool', 'clipbook')
)
update public.portfolio_projects p
set work_type = m.work_type,
    slug = coalesce(p.slug,
      case when not exists (select 1 from public.portfolio_projects o
                            where o.slug = m.slug and o.id <> p.id) then m.slug end)
from mapping m
where p.id = m.id and p.work_type is null;
