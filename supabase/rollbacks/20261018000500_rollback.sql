drop trigger if exists portfolio_projects_sync_featured on public.portfolio_projects;
drop function if exists private.sync_portfolio_featured();
-- The backfill is not reversed. Original flags: Number Systems App true, Calculator App true,
-- Number Systems Website true, Encryption Methods true, Basmagi Quiz Platform false.
