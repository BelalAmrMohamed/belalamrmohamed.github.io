create extension if not exists pgcrypto;

create table if not exists public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  category text not null default 'Web Development',
  project_url text,
  github_url text,
  image_url text,
  featured boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portfolio_projects enable row level security;
alter table public.portfolio_settings enable row level security;

create policy "Authenticated users can read portfolio projects"
  on public.portfolio_projects
  for select
  using (auth.uid() is not null);

create policy "Authenticated users can modify portfolio projects"
  on public.portfolio_projects
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "Authenticated users can read portfolio settings"
  on public.portfolio_settings
  for select
  using (auth.uid() is not null);

create policy "Authenticated users can modify portfolio settings"
  on public.portfolio_settings
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_before_project_update
before update on public.portfolio_projects
for each row
execute function public.handle_updated_at();

create trigger set_updated_at_before_setting_update
before update on public.portfolio_settings
for each row
execute function public.handle_updated_at();
