-- WARNING: revoking SELECT from service_role breaks /api/ai-agent/chat (403) again.
revoke select on public.portfolio_projects from service_role;
revoke select on public.portfolio_settings from service_role;

alter table public.portfolio_projects
  drop constraint if exists portfolio_projects_text_limits,
  drop constraint if exists portfolio_projects_link_format,
  drop constraint if exists portfolio_projects_image_format;
alter table public.portfolio_settings
  drop constraint if exists portfolio_settings_limits,
  drop constraint if exists portfolio_settings_private_keys;
