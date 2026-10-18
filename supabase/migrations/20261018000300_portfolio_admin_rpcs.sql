-- =============================================================================
-- 20261018000300_portfolio_admin_rpcs.sql
--
-- Admin-only RPCs used by the dashboard. Every function:
--   * is SECURITY DEFINER with search_path = '' (all names schema-qualified),
--   * starts with an explicit private.is_portfolio_admin() check
--     (errcode 42501 -> HTTP 403 from PostgREST),
--   * has EXECUTE revoked from PUBLIC/anon/service_role and granted to
--     `authenticated` only (non-admins can call it, and are rejected inside).
--
--   public.portfolio_admin_status()            who am I / am I an admin
--   public.admin_list_admins()                 list admin emails
--   public.admin_add_admin(text)               add an admin email
--   public.admin_remove_admin(text)            remove (never self / last admin)
--   public.admin_reorder_projects(uuid[])      one-batch sort_order update
--   public.admin_ai_usage_stats(int)           per-day aggregates, no hashes
--   public.admin_list_activity(int,bigint,text) read-only audit log
--
-- Idempotent: safe to run more than once.
-- =============================================================================

-- ---- admin table: who/when metadata (nullable; old rows stay NULL) -----------
alter table private.portfolio_admin_emails add column if not exists created_at timestamptz;
alter table private.portfolio_admin_emails add column if not exists added_by text;
alter table private.portfolio_admin_emails alter column created_at set default now();

-- ---- updated_at: ordering-only changes are not "edits" ----------------------
-- Replaces the trigger function from the first migration (same name/signature).
-- A drag-and-drop reorder only changes sort_order, so it must not bump
-- updated_at (that would pollute "recently updated" sorting).
create or replace function public.set_portfolio_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (pg_catalog.to_jsonb(new) - 'updated_at' - 'sort_order')
     is distinct from (pg_catalog.to_jsonb(old) - 'updated_at' - 'sort_order') then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

-- ---- who am I ----------------------------------------------------------------
create or replace function public.portfolio_admin_status()
returns table (is_admin boolean, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.is_portfolio_admin()),
    nullif(pg_catalog.lower(coalesce((select auth.jwt()) ->> 'email', '')), '');
$$;

-- ---- list admins -------------------------------------------------------------
create or replace function public.admin_list_admins()
returns table (email text, added_at timestamptz, added_by text, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me text := pg_catalog.lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if not (select private.is_portfolio_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
    select a.email, a.created_at, a.added_by, a.email = v_me
    from private.portfolio_admin_emails a
    order by a.created_at nulls first, a.email;
end;
$$;

-- ---- add admin ---------------------------------------------------------------
create or replace function public.admin_add_admin(p_email text)
returns table (email text, already_admin boolean, has_account boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email   text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_me      text := nullif(pg_catalog.lower(coalesce((select auth.jwt()) ->> 'email', '')), '');
  v_inserted integer;
begin
  if not (select private.is_portfolio_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_email) > 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  insert into private.portfolio_admin_emails as t (email, added_by)
  values (v_email, v_me)
  on conflict on constraint portfolio_admin_emails_pkey do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    perform private.audit_write('add_admin', 'admin', v_email, v_email, null);
  end if;

  return query
    select v_email,
           v_inserted = 0,
           exists (select 1 from auth.users u
                   where pg_catalog.lower(u.email) = v_email
                     and u.email_confirmed_at is not null);
end;
$$;

-- ---- remove admin ------------------------------------------------------------
create or replace function public.admin_remove_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_me    text := pg_catalog.lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_total integer;
begin
  if not (select private.is_portfolio_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Serialise concurrent removals so two admins cannot remove each other
  -- (or the last two admins) at the same moment.
  perform 1 from private.portfolio_admin_emails for update;

  if v_email = v_me then
    raise exception 'You cannot remove your own admin access.';
  end if;

  select pg_catalog.count(*) into v_total from private.portfolio_admin_emails;
  if v_total <= 1 then
    raise exception 'You cannot remove the last admin.';
  end if;

  delete from private.portfolio_admin_emails where email = v_email;
  if not found then
    raise exception 'That email is not an admin.';
  end if;

  perform private.audit_write('remove_admin', 'admin', v_email, v_email, null);
end;
$$;

-- ---- reorder projects (one batch) ---------------------------------------------
-- p_ids is the FULL desired order. sort_order becomes 10, 20, 30, ... in that
-- order (same spacing as the seed data); the public site orders by
-- (sort_order asc, created_at desc), so the result matches it exactly.
create or replace function public.admin_reorder_projects(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moved integer;
begin
  if not (select private.is_portfolio_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_ids is null or pg_catalog.cardinality(p_ids) not between 1 and 500 then
    raise exception 'Provide between 1 and 500 project ids.';
  end if;
  if (select pg_catalog.count(distinct x) from pg_catalog.unnest(p_ids) as x)
       <> pg_catalog.cardinality(p_ids) then
    raise exception 'Duplicate project ids.';
  end if;
  if (select pg_catalog.count(*) from public.portfolio_projects where id = any (p_ids))
       <> pg_catalog.cardinality(p_ids) then
    raise exception 'Some projects no longer exist. Refresh the list and try again.';
  end if;

  -- Suppress the per-row audit trigger; one summary row is written below.
  perform pg_catalog.set_config('portfolio.audit_skip', '1', true);

  update public.portfolio_projects p
     set sort_order = o.new_order
    from (select t.id, (t.ord * 10)::integer as new_order
            from pg_catalog.unnest(p_ids) with ordinality as t(id, ord)) o
   where p.id = o.id
     and p.sort_order is distinct from o.new_order;
  get diagnostics v_moved = row_count;

  perform pg_catalog.set_config('portfolio.audit_skip', '', true);

  if v_moved > 0 then
    perform private.audit_write('reorder', 'project', null, 'Project order',
      pg_catalog.jsonb_build_object('projects', pg_catalog.cardinality(p_ids), 'moved', v_moved));
  end if;
  return v_moved;
end;
$$;

-- ---- AI usage stats (aggregates only) ------------------------------------------
-- consume_ai_agent_daily_quota() increments one 'device' row and one 'ip' row per
-- allowed request, so requests/day = sum over the device rows. Only counts are
-- returned: never subject_hash values.
create or replace function public.admin_ai_usage_stats(p_days integer default 30)
returns table (
  usage_date          date,
  requests            bigint,
  unique_devices      bigint,
  unique_ips          bigint,
  max_device_requests integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days  integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_today date := (now() at time zone 'utc')::date;
begin
  if not (select private.is_portfolio_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
    select d.day::date,
           coalesce(sum(u.request_count) filter (where u.subject_type = 'device'), 0)::bigint,
           (count(u.subject_hash) filter (where u.subject_type = 'device'))::bigint,
           (count(u.subject_hash) filter (where u.subject_type = 'ip'))::bigint,
           coalesce(max(u.request_count) filter (where u.subject_type = 'device'), 0)::integer
    from pg_catalog.generate_series(v_today::timestamp - ((v_days - 1) * interval '1 day'), v_today::timestamp, interval '1 day') as d(day)
    left join public.ai_agent_daily_usage u on u.usage_date = d.day::date
    group by d.day
    order by d.day;
end;
$$;

-- ---- activity log (read-only, keyset pagination) ---------------------------------
create or replace function public.admin_list_activity(
  p_limit  integer default 50,
  p_before bigint  default null,
  p_entity text    default null
)
returns table (
  id           bigint,
  created_at   timestamptz,
  actor_email  text,
  action       text,
  entity       text,
  entity_id    text,
  entity_label text,
  changes      jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_portfolio_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
    select l.id, l.created_at, coalesce(l.actor_email, 'system'), l.action,
           l.entity, l.entity_id, l.entity_label, l.changes
    from private.portfolio_audit_log l
    where (p_before is null or l.id < p_before)
      and (p_entity is null or l.entity = p_entity)
    order by l.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

-- ---- privileges: authenticated only, everything else revoked --------------------
revoke all on function public.portfolio_admin_status()                       from public, anon, authenticated, service_role;
revoke all on function public.admin_list_admins()                            from public, anon, authenticated, service_role;
revoke all on function public.admin_add_admin(text)                          from public, anon, authenticated, service_role;
revoke all on function public.admin_remove_admin(text)                       from public, anon, authenticated, service_role;
revoke all on function public.admin_reorder_projects(uuid[])                 from public, anon, authenticated, service_role;
revoke all on function public.admin_ai_usage_stats(integer)                  from public, anon, authenticated, service_role;
revoke all on function public.admin_list_activity(integer, bigint, text)     from public, anon, authenticated, service_role;

grant execute on function public.portfolio_admin_status()                    to authenticated;
grant execute on function public.admin_list_admins()                         to authenticated;
grant execute on function public.admin_add_admin(text)                       to authenticated;
grant execute on function public.admin_remove_admin(text)                    to authenticated;
grant execute on function public.admin_reorder_projects(uuid[])              to authenticated;
grant execute on function public.admin_ai_usage_stats(integer)               to authenticated;
grant execute on function public.admin_list_activity(integer, bigint, text)  to authenticated;

-- -----------------------------------------------------------------------------
-- ROLLBACK (see supabase/rollbacks/20261018000300_rollback.sql)
--   drop function if exists public.admin_list_activity(integer, bigint, text);
--   drop function if exists public.admin_ai_usage_stats(integer);
--   drop function if exists public.admin_reorder_projects(uuid[]);
--   drop function if exists public.admin_remove_admin(text);
--   drop function if exists public.admin_add_admin(text);
--   drop function if exists public.admin_list_admins();
--   drop function if exists public.portfolio_admin_status();
--   -- restore the original trigger function body (always bumps updated_at):
--   create or replace function public.set_portfolio_updated_at() returns trigger
--     language plpgsql set search_path = '' as $f$ begin new.updated_at = now(); return new; end; $f$;
--   alter table private.portfolio_admin_emails drop column if exists created_at, drop column if exists added_by;
-- -----------------------------------------------------------------------------
