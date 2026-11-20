-- Rollback for 20261120000200: clears work_type on the six ids, and the slug only
-- when it is one of the slugs that migration proposed. Pre-existing slugs are kept.
update public.portfolio_projects
set slug = null
where id in ('b21a746a-19ea-484c-b5c4-ddf16c50ac00','5dba656d-ae9a-4287-9839-4d0a26d8f2a1',
             '3e11f993-7887-42f9-a89f-f5abf40be821','ebfde342-5236-4aed-a4fd-cc39044c5d8e',
             '1d784f34-c8c1-41d6-9703-d86d2c96363b','c941406c-5afb-4bee-bfdb-8718ce724c9a')
  and slug in ('mr-amr-mohamed','os-projects-maui-winforms','rihlat-fi-al-sira',
               'ala-rufuf-al-masajid','basmagi-exams-platform','clipbook');
update public.portfolio_projects
set work_type = null
where id in ('b21a746a-19ea-484c-b5c4-ddf16c50ac00','5dba656d-ae9a-4287-9839-4d0a26d8f2a1',
             '3e11f993-7887-42f9-a89f-f5abf40be821','ebfde342-5236-4aed-a4fd-cc39044c5d8e',
             '1d784f34-c8c1-41d6-9703-d86d2c96363b','c941406c-5afb-4bee-bfdb-8718ce724c9a');
