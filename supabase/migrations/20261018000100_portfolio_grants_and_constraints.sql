-- =============================================================================
-- 20261018000100_portfolio_grants_and_constraints.sql
--
-- 1. Explicit privileges for service_role on the portfolio tables.
--    (The first migration never granted them, which is why api/ai-agent/chat.js
--    got a 403 "permission denied for table" when it loaded the portfolio
--    context with the secret key. service_role bypasses RLS but NOT table
--    privileges.)  chat.js only reads, so SELECT is all it gets.
--
-- 2. Server-side data-integrity constraints that mirror the admin form limits,
--    so a buggy or hand-written client cannot store oversized or unsafe values.
--    All are added NOT VALID: they are enforced for every new/updated row but
--    existing rows are not re-checked, so this migration cannot fail on old
--    data. (Run `alter table ... validate constraint ...` later if you want.)
--
-- Idempotent: safe to run more than once.
-- =============================================================================

-- ---- 1. Privileges ----------------------------------------------------------
grant select on public.portfolio_projects to service_role;
grant select on public.portfolio_settings to service_role;

-- ---- 2. Constraints ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.portfolio_projects'::regclass
                   and conname = 'portfolio_projects_text_limits') then
    alter table public.portfolio_projects
      add constraint portfolio_projects_text_limits check (
        char_length(title) <= 120
        and char_length(btrim(category)) between 1 and 80
        and char_length(summary) <= 1200
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.portfolio_projects'::regclass
                   and conname = 'portfolio_projects_link_format') then
    alter table public.portfolio_projects
      add constraint portfolio_projects_link_format check (
        (project_url is null or (char_length(project_url) <= 500 and project_url ~* '^https?://'))
        and (github_url is null or (char_length(github_url) <= 500 and github_url ~* '^https?://'))
      ) not valid;
  end if;

  -- image_url may be an absolute http(s) URL or a site-relative path
  -- (portfolio.js resolves both). Block script-ish schemes, protocol-relative
  -- URLs and path traversal.
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.portfolio_projects'::regclass
                   and conname = 'portfolio_projects_image_format') then
    alter table public.portfolio_projects
      add constraint portfolio_projects_image_format check (
        image_url is null or (
          char_length(image_url) <= 500
          and image_url !~* '^\s*(javascript|data|vbscript|file|blob):'
          and image_url !~ '^\s*//'
          and image_url !~ '(^|/)\.\.(/|$)'
        )
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.portfolio_settings'::regclass
                   and conname = 'portfolio_settings_limits') then
    alter table public.portfolio_settings
      add constraint portfolio_settings_limits check (
        char_length(key) <= 64
        and key ~ '^[a-z0-9_]+$'
        and char_length(value) <= 5000
      ) not valid;
  end if;

  -- The extra AI instruction is private by design: a mistake in any client
  -- (or a manual SQL edit) must not be able to publish it, because every
  -- is_public setting is readable by anon and is fed to the assistant.
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.portfolio_settings'::regclass
                   and conname = 'portfolio_settings_private_keys') then
    alter table public.portfolio_settings
      add constraint portfolio_settings_private_keys check (
        key <> 'ai_extra_instructions' or is_public = false
      );
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- ROLLBACK (see supabase/rollbacks/20261018000100_rollback.sql)
--   revoke select on public.portfolio_projects, public.portfolio_settings from service_role;
--   alter table public.portfolio_projects drop constraint if exists portfolio_projects_text_limits,
--     drop constraint if exists portfolio_projects_link_format, drop constraint if exists portfolio_projects_image_format;
--   alter table public.portfolio_settings drop constraint if exists portfolio_settings_limits,
--     drop constraint if exists portfolio_settings_private_keys;
--   NOTE: revoking SELECT from service_role will break /api/ai-agent/chat again.
-- -----------------------------------------------------------------------------
