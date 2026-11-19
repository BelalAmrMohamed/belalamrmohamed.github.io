-- =============================================================================
-- 20261119000100_portfolio_work_types_and_media.sql
--
-- Portfolio platform upgrade, phase 2 (additive schema). See
-- docs/plans/portfolio-platform-upgrade-plan.md sections 4 and 9.
--
--   * portfolio_projects: new nullable `work_type` and `slug` columns.
--     NULL work_type = "not classified yet" (owner must approve the mapping of
--     live rows; nothing is guessed or backfilled here). Existing columns,
--     constraints and policies are untouched, so the current public page and
--     admin keep working.
--   * portfolio_assets            grouped media for a work item
--   * portfolio_component_variants / portfolio_component_files
--   * youtube_channels / youtube_videos (metadata cache filled by a server job)
--
-- Every new table: RLS on, explicit GRANTs, admin writes via
-- private.is_portfolio_admin(). Child rows are only publicly readable when the
-- parent is published and not archived.
--
-- Not included on purpose (open decisions in plan section 12): the video
-- Storage bucket, backfill of work_type/slug, and any change to the
-- featured/status duplication.
--
-- Idempotent. Rollback: supabase/rollbacks/20261119000100_rollback.sql
-- =============================================================================

-- ---- 1. portfolio_projects: work_type + slug -------------------------------
alter table public.portfolio_projects add column if not exists work_type text;
alter table public.portfolio_projects add column if not exists slug text;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.portfolio_projects'::regclass
                   and conname = 'portfolio_projects_work_type_check') then
    alter table public.portfolio_projects
      add constraint portfolio_projects_work_type_check check (
        work_type is null or work_type in
          ('website', 'app_tool', 'graphic_case', 'ui_component', 'edited_video')
      );
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.portfolio_projects'::regclass
                   and conname = 'portfolio_projects_slug_format') then
    alter table public.portfolio_projects
      add constraint portfolio_projects_slug_format check (
        slug is null or (char_length(slug) between 1 and 80
                         and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
      );
  end if;
end $$;

create unique index if not exists portfolio_projects_slug_key
  on public.portfolio_projects (slug) where slug is not null;

create index if not exists portfolio_projects_work_type_order_idx
  on public.portfolio_projects (work_type, sort_order, created_at desc)
  where is_published and status <> 'archived';

-- ---- 2. portfolio_assets ----------------------------------------------------
create table if not exists public.portfolio_assets (
  id uuid primary key default gen_random_uuid(),
  portfolio_project_id uuid not null
    references public.portfolio_projects (id) on delete cascade,
  media_kind text not null default 'image' check (media_kind in ('image', 'video')),
  role text not null default 'gallery' check (role in (
    'cover', 'gallery', 'logo', 'youtube_thumbnail', 'opengraph',
    'social_banner', 'poster', 'edited_video')),
  bucket text,
  storage_path text,
  external_url text,
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  caption text not null default '' check (char_length(caption) <= 500),
  mime_type text check (mime_type is null or char_length(mime_type) <= 100),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_assets_has_source check (
    storage_path is not null or external_url is not null),
  constraint portfolio_assets_storage_path_safe check (
    storage_path is null or (char_length(storage_path) <= 500
      and storage_path !~ '(^|/)\.\.(/|$)' and storage_path !~ '^/')),
  constraint portfolio_assets_external_url_safe check (
    external_url is null or (char_length(external_url) <= 500
      and external_url ~* '^https://'))
);

create index if not exists portfolio_assets_parent_order_idx
  on public.portfolio_assets (portfolio_project_id, sort_order, created_at);

-- ---- 3. component variants and files ---------------------------------------
create table if not exists public.portfolio_component_variants (
  id uuid primary key default gen_random_uuid(),
  portfolio_project_id uuid not null
    references public.portfolio_projects (id) on delete cascade,
  format text not null check (format in ('react_ts_tailwind', 'html_css_js')),
  entry_file text,
  preview_path text check (preview_path is null or (char_length(preview_path) <= 500
    and preview_path !~ '(^|/)\.\.(/|$)' and preview_path !~ '^\s*(//|[a-z]+:)')),
  dependencies jsonb not null default '{}'::jsonb,
  build_state text not null default 'none'
    check (build_state in ('none', 'pending', 'built', 'failed')),
  build_version text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_project_id, format)
);

create table if not exists public.portfolio_component_files (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null
    references public.portfolio_component_variants (id) on delete cascade,
  path text not null check (char_length(path) between 1 and 200
    and path !~ '(^|/)\.\.(/|$)' and path !~ '^/'),
  source text not null default '' check (char_length(source) <= 200000),
  is_entry boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, path)
);

create index if not exists portfolio_component_variants_parent_idx
  on public.portfolio_component_variants (portfolio_project_id, sort_order);
create index if not exists portfolio_component_files_variant_idx
  on public.portfolio_component_files (variant_id, sort_order);

-- ---- 4. YouTube channels and videos ----------------------------------------
create table if not exists public.youtube_channels (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null unique check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  handle text check (handle is null or char_length(handle) <= 100),
  submitted_input text check (submitted_input is null or char_length(submitted_input) <= 300),
  display_name text not null default '' check (char_length(display_name) <= 200),
  uploads_playlist_id text check (uploads_playlist_id is null or char_length(uploads_playlist_id) <= 100),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  sync_started_at timestamptz,
  sync_finished_at timestamptz,
  last_success_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.youtube_videos (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text not null unique check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_ref uuid not null references public.youtube_channels (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 300),
  description text not null default '' check (char_length(description) <= 6000),
  published_at timestamptz,
  thumbnail_url text check (thumbnail_url is null or (char_length(thumbnail_url) <= 500
    and thumbnail_url ~* '^https://')),
  privacy_status text not null default 'public'
    check (privacy_status in ('public', 'unlisted', 'private', 'unavailable')),
  last_synced_at timestamptz,
  -- Admin-owned: the sync job must never overwrite these three.
  is_visible boolean not null default true,
  featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youtube_videos_channel_idx
  on public.youtube_videos (channel_ref, published_at desc);
create index if not exists youtube_videos_public_idx
  on public.youtube_videos (sort_order, published_at desc)
  where is_visible and privacy_status = 'public';

-- ---- 5. updated_at triggers -------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['portfolio_assets', 'portfolio_component_variants',
                           'portfolio_component_files', 'youtube_channels', 'youtube_videos']
  loop
    if not exists (select 1 from pg_trigger
                   where tgname = 'set_' || t || '_updated_at'
                     and tgrelid = ('public.' || t)::regclass) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_portfolio_updated_at()',
        'set_' || t || '_updated_at', t);
    end if;
  end loop;
end $$;

-- ---- 6. Grants + RLS --------------------------------------------------------
alter table public.portfolio_assets enable row level security;
alter table public.portfolio_component_variants enable row level security;
alter table public.portfolio_component_files enable row level security;
alter table public.youtube_channels enable row level security;
alter table public.youtube_videos enable row level security;

revoke all on public.portfolio_assets, public.portfolio_component_variants,
  public.portfolio_component_files, public.youtube_channels, public.youtube_videos
  from public, anon, authenticated;

grant select on public.portfolio_assets, public.portfolio_component_variants,
  public.portfolio_component_files to anon, authenticated;
grant insert, update, delete on public.portfolio_assets, public.portfolio_component_variants,
  public.portfolio_component_files to authenticated;

-- Channels: visitors only get the display columns, never sync/error internals.
grant select (id, channel_id, handle, display_name, is_active, sort_order)
  on public.youtube_channels to anon;
grant select, insert, update, delete on public.youtube_channels to authenticated;
grant select on public.youtube_videos to anon;
grant select, insert, update, delete on public.youtube_videos to authenticated;

-- The sync job (server-side, secret key) reads channels and upserts videos. It
-- never writes the admin-owned columns, enforced in application code.
grant select, update on public.youtube_channels to service_role;
grant select, insert, update on public.youtube_videos to service_role;

-- Drop-then-create keeps the migration re-runnable.
drop policy if exists "Public reads assets of published work" on public.portfolio_assets;
create policy "Public reads assets of published work" on public.portfolio_assets
  for select to anon, authenticated
  using (exists (select 1 from public.portfolio_projects p
                 where p.id = portfolio_project_id
                   and p.is_published and p.status <> 'archived'));
drop policy if exists "Admins read all assets" on public.portfolio_assets;
create policy "Admins read all assets" on public.portfolio_assets
  for select to authenticated using ((select private.is_portfolio_admin()));
drop policy if exists "Admins write assets" on public.portfolio_assets;
create policy "Admins write assets" on public.portfolio_assets
  for all to authenticated
  using ((select private.is_portfolio_admin()))
  with check ((select private.is_portfolio_admin()));

drop policy if exists "Public reads variants of published work" on public.portfolio_component_variants;
create policy "Public reads variants of published work" on public.portfolio_component_variants
  for select to anon, authenticated
  using (exists (select 1 from public.portfolio_projects p
                 where p.id = portfolio_project_id
                   and p.is_published and p.status <> 'archived'));
drop policy if exists "Admins read all variants" on public.portfolio_component_variants;
create policy "Admins read all variants" on public.portfolio_component_variants
  for select to authenticated using ((select private.is_portfolio_admin()));
drop policy if exists "Admins write variants" on public.portfolio_component_variants;
create policy "Admins write variants" on public.portfolio_component_variants
  for all to authenticated
  using ((select private.is_portfolio_admin()))
  with check ((select private.is_portfolio_admin()));

drop policy if exists "Public reads files of published work" on public.portfolio_component_files;
create policy "Public reads files of published work" on public.portfolio_component_files
  for select to anon, authenticated
  using (exists (select 1
                 from public.portfolio_component_variants v
                 join public.portfolio_projects p on p.id = v.portfolio_project_id
                 where v.id = variant_id
                   and p.is_published and p.status <> 'archived'));
drop policy if exists "Admins read all component files" on public.portfolio_component_files;
create policy "Admins read all component files" on public.portfolio_component_files
  for select to authenticated using ((select private.is_portfolio_admin()));
drop policy if exists "Admins write component files" on public.portfolio_component_files;
create policy "Admins write component files" on public.portfolio_component_files
  for all to authenticated
  using ((select private.is_portfolio_admin()))
  with check ((select private.is_portfolio_admin()));

drop policy if exists "Public reads active channels" on public.youtube_channels;
create policy "Public reads active channels" on public.youtube_channels
  for select to anon, authenticated using (is_active);
drop policy if exists "Admins read all channels" on public.youtube_channels;
create policy "Admins read all channels" on public.youtube_channels
  for select to authenticated using ((select private.is_portfolio_admin()));
drop policy if exists "Admins write channels" on public.youtube_channels;
create policy "Admins write channels" on public.youtube_channels
  for all to authenticated
  using ((select private.is_portfolio_admin()))
  with check ((select private.is_portfolio_admin()));

-- Both the admin-visible flag AND YouTube's public privacy status are required,
-- and the channel must still be connected.
drop policy if exists "Public reads visible public videos" on public.youtube_videos;
create policy "Public reads visible public videos" on public.youtube_videos
  for select to anon, authenticated
  using (is_visible and privacy_status = 'public'
         and exists (select 1 from public.youtube_channels c
                     where c.id = channel_ref and c.is_active));
drop policy if exists "Admins read all videos" on public.youtube_videos;
create policy "Admins read all videos" on public.youtube_videos
  for select to authenticated using ((select private.is_portfolio_admin()));
drop policy if exists "Admins write videos" on public.youtube_videos;
create policy "Admins write videos" on public.youtube_videos
  for all to authenticated
  using ((select private.is_portfolio_admin()))
  with check ((select private.is_portfolio_admin()));
