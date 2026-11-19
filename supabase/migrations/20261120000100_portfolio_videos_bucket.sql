-- =============================================================================
-- 20261120000100_portfolio_videos_bucket.sql
--
-- Storage bucket for edited-video uploads (plan sections 4.5 and 9). Separate
-- from portfolio-images, whose 5 MB raster-only policy is NOT touched.
--   * public bucket -> played straight from /storage/v1/object/public/...
--                      Owner decision: a known direct link keeps working after an
--                      item is unpublished (publication only hides it from the site).
--                      Delete the object to truly revoke it.
--   * writes        -> admin-only (private.is_portfolio_admin())
--   * limits        -> 50 MB per file, MP4 only (H.264/AAC export; no transcoding)
--
-- No anon SELECT policy on purpose (it would allow listing the bucket).
-- NOTE: Supabase also has a project-wide upload limit (Storage settings); the
-- free plan caps it at 50 MB, which matches this bucket's limit.
-- Idempotent. Rollback: supabase/rollbacks/20261120000100_rollback.sql
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-videos', 'portfolio-videos', true, 52428800, array['video/mp4'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Portfolio admins can read portfolio videos"   on storage.objects;
drop policy if exists "Portfolio admins can upload portfolio videos" on storage.objects;
drop policy if exists "Portfolio admins can update portfolio videos" on storage.objects;
drop policy if exists "Portfolio admins can delete portfolio videos" on storage.objects;

create policy "Portfolio admins can read portfolio videos"
  on storage.objects for select to authenticated
  using (bucket_id = 'portfolio-videos' and (select private.is_portfolio_admin()));

create policy "Portfolio admins can upload portfolio videos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'portfolio-videos' and (select private.is_portfolio_admin()));

create policy "Portfolio admins can update portfolio videos"
  on storage.objects for update to authenticated
  using      (bucket_id = 'portfolio-videos' and (select private.is_portfolio_admin()))
  with check (bucket_id = 'portfolio-videos' and (select private.is_portfolio_admin()));

create policy "Portfolio admins can delete portfolio videos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio-videos' and (select private.is_portfolio_admin()));
