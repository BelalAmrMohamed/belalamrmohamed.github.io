-- Rollback for 20261119000100_portfolio_work_types_and_media.sql
-- DESTROYS: all rows in portfolio_assets, portfolio_component_variants,
-- portfolio_component_files, youtube_channels, youtube_videos, and the
-- work_type / slug values on portfolio_projects. Storage objects are NOT touched.
drop table if exists public.portfolio_component_files;
drop table if exists public.portfolio_component_variants;
drop table if exists public.portfolio_assets;
drop table if exists public.youtube_videos;
drop table if exists public.youtube_channels;
drop index if exists public.portfolio_projects_work_type_order_idx;
drop index if exists public.portfolio_projects_slug_key;
alter table public.portfolio_projects drop constraint if exists portfolio_projects_work_type_check;
alter table public.portfolio_projects drop constraint if exists portfolio_projects_slug_format;
alter table public.portfolio_projects drop column if exists work_type;
alter table public.portfolio_projects drop column if exists slug;
