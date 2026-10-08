insert into public.portfolio_settings (key, value)
values
  ('site_title', 'Belal Amr'),
  ('site_tagline', 'Programmer & backend developer based in Egypt')
on conflict (key) do update set value = excluded.value, updated_at = now();
