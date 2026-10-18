-- =============================================================================
-- 20261018000400_portfolio_images_bucket.sql
--
-- Supabase Storage bucket for project images.
--   * public bucket  -> files are served from /storage/v1/object/public/...
--                       without any RLS check (this is what the public site uses)
--   * writes         -> admin-only, enforced by RLS policies on storage.objects
--   * limits         -> 5 MB per file, raster image MIME types only (no SVG:
--                       an uploaded SVG served from the project domain can carry
--                       script)
--
-- No anon SELECT policy is created on purpose: it would let anyone LIST every
-- file in the bucket through the API. Public URLs work without it.
--
-- Idempotent: safe to run more than once.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio-images', 'portfolio-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Portfolio admins can read portfolio images"   on storage.objects;
drop policy if exists "Portfolio admins can upload portfolio images" on storage.objects;
drop policy if exists "Portfolio admins can update portfolio images" on storage.objects;
drop policy if exists "Portfolio admins can delete portfolio images" on storage.objects;

create policy "Portfolio admins can read portfolio images"
  on storage.objects for select to authenticated
  using (bucket_id = 'portfolio-images' and (select private.is_portfolio_admin()));

create policy "Portfolio admins can upload portfolio images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'portfolio-images' and (select private.is_portfolio_admin()));

create policy "Portfolio admins can update portfolio images"
  on storage.objects for update to authenticated
  using      (bucket_id = 'portfolio-images' and (select private.is_portfolio_admin()))
  with check (bucket_id = 'portfolio-images' and (select private.is_portfolio_admin()));

create policy "Portfolio admins can delete portfolio images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio-images' and (select private.is_portfolio_admin()));

-- -----------------------------------------------------------------------------
-- ROLLBACK (see supabase/rollbacks/20261018000400_rollback.sql)
--   drop policy if exists "Portfolio admins can read portfolio images"   on storage.objects;
--   drop policy if exists "Portfolio admins can upload portfolio images" on storage.objects;
--   drop policy if exists "Portfolio admins can update portfolio images" on storage.objects;
--   drop policy if exists "Portfolio admins can delete portfolio images" on storage.objects;
--   -- Supabase refuses to delete a non-empty bucket via SQL; empty it first
--   -- from the dashboard or with the Storage API, then:
--   delete from storage.buckets where id = 'portfolio-images';
--   -- Projects whose image_url points into this bucket will show broken images.
-- -----------------------------------------------------------------------------
