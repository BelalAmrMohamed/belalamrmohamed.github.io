drop policy if exists "Portfolio admins can read portfolio videos"   on storage.objects;
drop policy if exists "Portfolio admins can upload portfolio videos" on storage.objects;
drop policy if exists "Portfolio admins can update portfolio videos" on storage.objects;
drop policy if exists "Portfolio admins can delete portfolio videos" on storage.objects;
-- Empty the bucket first (dashboard or Storage API); Supabase blocks deleting a non-empty bucket.
-- Edited-video assets (portfolio_assets rows with bucket = 'portfolio-videos') will point at missing files.
delete from storage.buckets where id = 'portfolio-videos';
