drop function if exists public.admin_list_activity(integer, bigint, text);
drop function if exists public.admin_ai_usage_stats(integer);
drop function if exists public.admin_reorder_projects(uuid[]);
drop function if exists public.admin_remove_admin(text);
drop function if exists public.admin_add_admin(text);
drop function if exists public.admin_list_admins();
drop function if exists public.portfolio_admin_status();

-- Restore the original trigger function from the first migration.
create or replace function public.set_portfolio_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

alter table private.portfolio_admin_emails drop column if exists created_at, drop column if exists added_by;
