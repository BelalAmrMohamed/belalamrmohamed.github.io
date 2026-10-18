-- =============================================================================
-- 20261018000500_portfolio_sync_featured_flag.sql   (RECOMMENDED, OPTIONAL)
--
-- `featured` and `status = 'featured'` express the same thing, and the admin
-- form has always written featured = (status = 'featured'). The seed data does
-- not follow that rule (three rows are featured = true with status 'active'),
-- so saving one of them in the dashboard silently flipped its flag.
--
-- This makes status the single source of truth: a BEFORE trigger forces
-- featured = (status = 'featured'), and a one-time backfill fixes existing rows
-- (that backfill WILL show up in the activity log as "system" updates, and
-- changes what the AI assistant sees for those rows).
--
-- SKIP this file if you want to keep the current flags exactly as they are.
-- The dashboard works either way.
--
-- Idempotent: safe to run more than once.
-- =============================================================================

create or replace function private.sync_portfolio_featured()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.featured := (new.status = 'featured');
  return new;
end;
$$;

revoke all on function private.sync_portfolio_featured() from public, anon, authenticated, service_role;

drop trigger if exists portfolio_projects_sync_featured on public.portfolio_projects;
create trigger portfolio_projects_sync_featured
  before insert or update of status, featured on public.portfolio_projects
  for each row execute function private.sync_portfolio_featured();

update public.portfolio_projects
   set featured = (status = 'featured')
 where featured is distinct from (status = 'featured');

-- -----------------------------------------------------------------------------
-- ROLLBACK (see supabase/rollbacks/20261018000500_rollback.sql)
--   drop trigger if exists portfolio_projects_sync_featured on public.portfolio_projects;
--   drop function if exists private.sync_portfolio_featured();
--   -- The backfill is not reversed automatically. The original flags were:
--   --   Number Systems App: true | Calculator App: true | Number Systems Website: true
--   --   Encryption Methods: true | Basmagi Quiz Platform: false
-- -----------------------------------------------------------------------------
