drop policy if exists "Portfolio admins can read portfolio images"   on storage.objects;
drop policy if exists "Portfolio admins can upload portfolio images" on storage.objects;
drop policy if exists "Portfolio admins can update portfolio images" on storage.objects;
drop policy if exists "Portfolio admins can delete portfolio images" on storage.objects;
-- Empty the bucket first (dashboard or Storage API); Supabase blocks deleting a non-empty bucket.
-- Projects whose image_url points into this bucket will show broken images afterwards.
delete from storage.buckets where id = 'portfolio-images';
