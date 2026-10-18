-- =============================================================================
-- 20261018000200_portfolio_audit_log.sql
--
-- Activity log: who changed what, and when, for projects, settings and admins.
--
--   private.portfolio_audit_log      append-only table (no client privileges)
--   private.audit_trim(jsonb)        shortens very long strings stored in the log
--   private.audit_write(...)         writes one row (used by triggers and RPCs)
--   private.log_portfolio_change()   row trigger for projects + settings
--
-- The table lives in the `private` schema, which PostgREST does not expose, and
-- nobody (anon, authenticated, service_role) gets table privileges. It is read
-- only through public.admin_list_activity() (next migration), which checks
-- private.is_portfolio_admin().
--
-- Idempotent: safe to run more than once.
-- =============================================================================

create table if not exists private.portfolio_audit_log (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  actor_id      uuid,
  actor_email   text,
  action        text not null check (action in
                  ('insert', 'update', 'delete', 'reorder', 'add_admin', 'remove_admin')),
  entity        text not null check (entity in ('project', 'setting', 'admin')),
  entity_id     text,
  entity_label  text,
  changes       jsonb
);

create index if not exists portfolio_audit_log_entity_idx
  on private.portfolio_audit_log (entity, id desc);

alter table private.portfolio_audit_log enable row level security;  -- no policies: deny by default
revoke all on private.portfolio_audit_log from public, anon, authenticated, service_role;

-- ---- helpers ----------------------------------------------------------------
create or replace function private.audit_trim(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    when pg_catalog.jsonb_typeof(p_value) = 'string'
         and pg_catalog.char_length(p_value #>> '{}') > 300
      then pg_catalog.to_jsonb(pg_catalog.left(p_value #>> '{}', 300) || '…')
    else p_value
  end;
$$;

create or replace function private.audit_write(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_entity_label text,
  p_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.portfolio_audit_log
    (actor_id, actor_email, action, entity, entity_id, entity_label, changes)
  values (
    (select auth.uid()),
    nullif(pg_catalog.lower(coalesce((select auth.jwt()) ->> 'email', '')), ''),
    p_action, p_entity, p_entity_id, p_entity_label, p_changes
  );
end;
$$;

-- ---- row trigger ------------------------------------------------------------
create or replace function private.log_portfolio_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity  text := case tg_table_name when 'portfolio_projects' then 'project' else 'setting' end;
  v_old     jsonb;
  v_new     jsonb;
  v_changes jsonb;
  v_id      text;
  v_label   text;
begin
  -- admin_reorder_projects() sets this for the duration of its own transaction
  -- and writes a single summary row instead of one row per moved project.
  if coalesce(pg_catalog.current_setting('portfolio.audit_skip', true), '') = '1' then
    return null;
  end if;

  if tg_op <> 'INSERT' then v_old := pg_catalog.to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := pg_catalog.to_jsonb(new); end if;

  if v_entity = 'project' then
    v_id    := coalesce(v_new ->> 'id', v_old ->> 'id');
    v_label := coalesce(v_new ->> 'title', v_old ->> 'title');
  else
    v_id    := coalesce(v_new ->> 'key', v_old ->> 'key');
    v_label := v_id;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(pg_catalog.jsonb_object_agg(
             n.key,
             pg_catalog.jsonb_build_object('from', private.audit_trim(o.value),
                                           'to',   private.audit_trim(n.value))), '{}'::jsonb)
      into v_changes
      from pg_catalog.jsonb_each(v_new) n
      left join pg_catalog.jsonb_each(v_old) o on o.key = n.key
     where n.key <> 'updated_at'
       and n.value is distinct from o.value;

    if v_changes = '{}'::jsonb then return null; end if;   -- no-op update
  else
    select coalesce(pg_catalog.jsonb_object_agg(e.key, private.audit_trim(e.value)), '{}'::jsonb)
      into v_changes
      from pg_catalog.jsonb_each(coalesce(v_new, v_old)) e
     where e.key not in ('id', 'created_at', 'updated_at');
  end if;

  perform private.audit_write(pg_catalog.lower(tg_op), v_entity, v_id, v_label, v_changes);
  return null;
end;
$$;

revoke all on function private.audit_trim(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.audit_write(text, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.log_portfolio_change() from public, anon, authenticated, service_role;

drop trigger if exists portfolio_projects_audit on public.portfolio_projects;
create trigger portfolio_projects_audit
  after insert or update or delete on public.portfolio_projects
  for each row execute function private.log_portfolio_change();

drop trigger if exists portfolio_settings_audit on public.portfolio_settings;
create trigger portfolio_settings_audit
  after insert or update or delete on public.portfolio_settings
  for each row execute function private.log_portfolio_change();

-- -----------------------------------------------------------------------------
-- ROLLBACK (see supabase/rollbacks/20261018000200_rollback.sql)
--   drop trigger if exists portfolio_projects_audit on public.portfolio_projects;
--   drop trigger if exists portfolio_settings_audit on public.portfolio_settings;
--   drop function if exists private.log_portfolio_change();
--   drop function if exists private.audit_write(text, text, text, text, jsonb);
--   drop function if exists private.audit_trim(jsonb);
--   drop table if exists private.portfolio_audit_log;      -- destroys the history
--   (Run the 0300 rollback first: admin_list_activity() and the admin RPCs call audit_write.)
-- -----------------------------------------------------------------------------
