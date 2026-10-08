create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table private.portfolio_admin_emails (
  email text primary key check (email = lower(btrim(email)))
);

alter table private.portfolio_admin_emails enable row level security;
revoke all on private.portfolio_admin_emails from public, anon, authenticated;

insert into private.portfolio_admin_emails (email)
values ('belalamrofficial@gmail.com')
on conflict (email) do nothing;

create or replace function private.is_portfolio_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.portfolio_admin_emails
      where email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    );
$$;

revoke all on function private.is_portfolio_admin() from public, anon, authenticated;
grant execute on function private.is_portfolio_admin() to authenticated;

create table public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  summary text not null default '',
  category text not null default 'Web Development',
  project_url text,
  github_url text,
  image_url text,
  featured boolean not null default false,
  status text not null default 'active' check (status in ('featured', 'active', 'archived')),
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index portfolio_projects_public_order_idx
  on public.portfolio_projects (sort_order, created_at desc)
  where is_published and status <> 'archived';

alter table public.portfolio_projects enable row level security;
grant select on public.portfolio_projects to anon, authenticated;
grant insert, update, delete on public.portfolio_projects to authenticated;

create policy "Anyone can read published projects"
  on public.portfolio_projects
  for select
  to anon
  using (is_published and status <> 'archived');

create policy "Authenticated visitors and admins can read projects"
  on public.portfolio_projects
  for select
  to authenticated
  using (
    (is_published and status <> 'archived')
    or (select private.is_portfolio_admin())
  );

create policy "Portfolio admins can insert projects"
  on public.portfolio_projects
  for insert
  to authenticated
  with check ((select private.is_portfolio_admin()));

create policy "Portfolio admins can update projects"
  on public.portfolio_projects
  for update
  to authenticated
  using ((select private.is_portfolio_admin()))
  with check ((select private.is_portfolio_admin()));

create policy "Portfolio admins can delete projects"
  on public.portfolio_projects
  for delete
  to authenticated
  using ((select private.is_portfolio_admin()));

create table public.portfolio_settings (
  key text primary key check (length(btrim(key)) > 0),
  value text not null default '',
  is_public boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.portfolio_settings enable row level security;
grant select on public.portfolio_settings to anon, authenticated;
grant insert, update, delete on public.portfolio_settings to authenticated;

create policy "Anyone can read public portfolio settings"
  on public.portfolio_settings
  for select
  to anon
  using (is_public);

create policy "Authenticated visitors and admins can read portfolio settings"
  on public.portfolio_settings
  for select
  to authenticated
  using (is_public or (select private.is_portfolio_admin()));

create policy "Portfolio admins can insert settings"
  on public.portfolio_settings
  for insert
  to authenticated
  with check ((select private.is_portfolio_admin()));

create policy "Portfolio admins can update settings"
  on public.portfolio_settings
  for update
  to authenticated
  using ((select private.is_portfolio_admin()))
  with check ((select private.is_portfolio_admin()));

create policy "Portfolio admins can delete settings"
  on public.portfolio_settings
  for delete
  to authenticated
  using ((select private.is_portfolio_admin()));

create or replace function public.set_portfolio_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_portfolio_updated_at() from public, anon, authenticated;

create trigger set_portfolio_projects_updated_at
  before update on public.portfolio_projects
  for each row execute function public.set_portfolio_updated_at();

create trigger set_portfolio_settings_updated_at
  before update on public.portfolio_settings
  for each row execute function public.set_portfolio_updated_at();

insert into public.portfolio_projects
  (title, summary, category, project_url, github_url, image_url, featured, status, sort_order)
values
  ('Number Systems App',
   'A learning-focused app for binary, decimal, octal, and hexadecimal conversion.',
   'First app',
   'https://github.com/BelalAmrMohamed/NumberSystemsApp',
   'https://github.com/BelalAmrMohamed/NumberSystemsApp',
   'images/portfolio/gellary/g-numbersystems.jpg',
   true, 'featured', 10),
  ('Calculator App',
   'A calculator app built as a hands-on project to learn application development.',
   'Calculator',
   'https://github.com/BelalAmrMohamed/Calculator-app',
   'https://github.com/BelalAmrMohamed/Calculator-app',
   'images/portfolio/gellary/g-calculator.jpg',
   true, 'active', 20),
  ('Number Systems Website',
   'A converter and calculator for binary, decimal, octal, and hexadecimal number systems.',
   'Number systems',
   'https://belalamrmohamed.github.io/NumberSystems/',
   'https://github.com/BelalAmrMohamed/NumberSystems',
   'images/portfolio/gellary/g-numbersystems - web.jpg',
   true, 'active', 30),
  ('Encryption Methods',
   'An educational platform explaining classical ciphers with visualizers and working examples.',
   'Educational',
   'https://belalamrmohamed.github.io/Encryption-Methods/',
   'https://github.com/BelalAmrMohamed/Encryption-Methods',
   'images/portfolio/gellary/g-encyption.jpg',
   true, 'featured', 40),
  ('Basmagi Quiz Platform',
   'An interactive learning hub covering logic, programming, and university courses.',
   'Educational quizzes',
   'https://basmagi-quiz.vercel.app/',
   null,
   'images/portfolio/gellary/g-quiz.jpg',
   false, 'active', 50);

insert into public.portfolio_settings (key, value, is_public)
values
  ('site_title', 'Belal Amr', true),
  ('site_tagline', 'Programmer & backend developer based in Egypt', true)
on conflict (key) do nothing;