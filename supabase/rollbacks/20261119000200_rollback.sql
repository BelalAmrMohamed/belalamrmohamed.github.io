-- Rollback for 20261119000200: clears work_type/slug on the five seed titles only.
update public.portfolio_projects
set work_type = null, slug = null
where title in ('Number Systems App','Calculator App','Basmagi Quiz Platform',
                'Number Systems Website','Encryption Methods');
