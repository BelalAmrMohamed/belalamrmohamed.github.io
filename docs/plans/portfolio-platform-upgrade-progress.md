# Upgrade progress (tracks `portfolio-platform-upgrade-plan.md`)

## Done (plan §8 steps 2, 4-partial, 6-partial)
- `supabase/migrations/20261119000100_portfolio_work_types_and_media.sql` (+ rollback): `work_type`/`slug` on
  `portfolio_projects` (nullable = unclassified), `portfolio_assets`, `portfolio_component_variants/files`,
  `youtube_channels/videos`. RLS + explicit GRANTs; child rows public only when parent is published. Verified on PGlite
  (anon/non-admin denied, admin allowed, idempotent re-run). **Not applied to the real Supabase project.**
- Shared modules `public/js/site/{portfolio-repo,shell,category-page}.js`, `css/category-pages.css`.
- New routes `/websites`, `/apps-tools`; nav links on `/`; sitemap; service worker `v10` + precache entries.
- Browser-checked at 360px with mocked Supabase: render, empty, error states, dialog, XSS text escaping, unsafe-URL filtering.

## Done in round 2
- Mapping decided (owner delegated): apps/tools = Number Systems App, Calculator App, Basmagi Quiz Platform;
  websites = Number Systems Website, Encryption Methods. Migration `20261119000200_portfolio_backfill_work_types.sql`
  (+ rollback) sets `work_type`/slug by exact title only; other live rows stay unclassified. Tested on PGlite.
- Admin: Type + Slug fields (auto-slug from title), Type filter and tag in the list. They stay hidden/omitted until the
  `work_type` column exists, so the admin still works before the migration is applied. Duplicate gets its own slug.
- `/graphic-designs` page: cases with ordered, labeled assets; asset failures degrade to legacy cover. Service worker `v11`.
- Known inconsistency: seed row "Calculator App" has `featured=true` with `status='active'`; the admin derives `featured`
  from status, so saving it in the admin will un-feature it. Resolve with the featured/status cleanup (plan §4.1).

## Done in round 3
- Admin asset manager for graphic cases (`public/js/admin/assets-panel.js`, section `#assetsSection` in `admin.html`): multi-file
  upload to the existing images bucket under `assets/<project id>/`, role select, alt text, caption, move up/down, remove
  (row deleted first, file deleted only if nothing references it), 40-image cap, orphan cleanup if the row insert fails.
  Shown only when Type = Graphic design and the work_type column exists; asset changes save immediately (stated in the UI).
  A new graphic case reopens in the editor after its first save so images can be attached.
- Legacy `image_url` follows the cover asset, but only while it is empty or already points into that case's asset folder;
  a hand-entered cover link is never overwritten (plan 4.2).
- Shared pure module `public/js/site/asset-model.js` (roles, cover order, paths, reorder, cover-sync plan); used by the admin
  and by `/graphic-designs`. `tests/asset-model.test.mjs`, run with `npm test` (6 pass).
- Landing page: "Featured Work" section (`js/site/featured-home.js`), featured items per type with "View all" links. It stays
  hidden until classified featured items exist; the legacy Works section is unchanged. Service worker `v12`.
- Browser-checked at 360px against mocked Supabase: upload, cover/role defaults, alt save, reorder, remove + file delete,
  form not marked dirty by cover sync, home section, gallery dialog, no horizontal scroll. Not run against real Supabase.

## Done in round 4 (migrations 0100/0200 are now applied to the real project)
- YouTube sync backend: `api/youtube/sync.js` (one function; cron `GET` with `CRON_SECRET`, admin `POST` with the user's JWT
  checked through `portfolio_admin_status`) and `api/youtube/_youtube.js`. Resolves @handle / UC id / channel URL, pages
  `playlistItems` (max 10 pages per run, stops at a fully-known page), re-checks up to 150 known videos per run so privacy
  changes and removals are caught, upserts on the YouTube video id without ever writing `is_visible`/`featured`/`sort_order`,
  marks vanished videos `unavailable` (row kept), claims a per-channel lock in one atomic PATCH (10 min stale), records only
  sanitized error codes, and never logs or returns the API key. `vercel.json` has a daily cron (03:00 UTC).
  `tests/youtube-sync.test.mjs` (6 pass) uses a fake YouTube + PostgREST; **not run against the real YouTube API**.
- Admin "Videos" tab (`public/js/admin/youtube.js`): look up a channel (server-resolved preview) then Connect (auto-syncs),
  Sync now, Disconnect (soft: videos hidden, data kept), Reconnect, Delete (purge, confirmed), per-video Visible / Featured.
  Browser-checked at 360px with mocked Supabase + API.
- Public `/videos` page (YouTube section only): visible + public videos, click-to-load `youtube-nocookie` player. In nav,
  sitemap, service worker `v13`.
- New server env vars (see `.env.example`): `YOUTUBE_DATA_API_KEY`, `CRON_SECRET`, `SUPABASE_PUBLISHABLE_KEY`
  (plus the existing `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Function count is now 2 (limit 12).

## Decisions (owner, round 5)
- Edited-video max size 50 MB, MP4 only; public bucket, so a known direct link keeps working after unpublishing (delete the
  object to truly revoke). UI components: source + curated, prebuilt isolated previews only (no live compilation, no build
  step for the main site). Featured/status: apply `20261018000500` so `status` is the single source of truth.

## Done in round 5
- Migration `20261120000100_portfolio_videos_bucket.sql` (+ rollback, README order): public `portfolio-videos` bucket, 50 MB,
  `video/mp4`, admin-only read/insert/update/delete policies, no anon SELECT. `portfolio-images` is untouched.
  **Not applied yet.** Supabase's project-wide upload limit (Storage settings) must also allow 50 MB.
- Admin "Video" panel for Type = Edited video (`public/js/admin/video-panel.js`): MP4 upload with real progress, cancel, one
  automatic retry after a token refresh, in-browser playback check before publishing, replace/remove (new row saved before the
  old file is deleted; no orphan if the row insert fails), optional poster image that drives the legacy `image_url`.
  Uses XHR to the standard Storage endpoint, **not TUS** (plan 4.5 prefers resumable uploads above 6 MB; at <= 50 MB this was
  judged acceptable. Add tus-js-client later if flaky connections are a problem).
- Deleting a project now also removes its asset files (images and videos) from Storage; previously those were orphaned.
- `/videos` has the second section "Videos I edited" (`<video controls preload="metadata">`, no autoplay, poster). Each
  section degrades independently. Service worker `v14`.
- Tests: `npm test` 13 pass. Browser-checked at 360px with mocked Supabase; earlier graphics/videos/public checks re-run.

## Next
1. Apply `20261018000500` (if not yet) and `20261120000100`; confirm the project-wide Storage upload limit.
2. Set `YOUTUBE_DATA_API_KEY`, `CRON_SECRET`, `SUPABASE_PUBLISHABLE_KEY` in Vercel; deploy; connect the channel; Sync now.
3. UI components (source + curated previews): `portfolio_component_*` admin editor, `/ui-components` catalog with source
   view/copy/download, preview artifacts served in a sandboxed iframe without `allow-same-origin`.
4. Landing page "Videos" featured group; retire compatibility paths (plan 8 step 9) after production verification.

## Notes
- Public queries on `youtube_channels` must list columns explicitly (anon has column-level SELECT only).
- Until work types are backfilled, `/websites` and `/apps-tools` are empty and `/` keeps its legacy Works section.
- Open decisions in plan §12 are still open (video size/MIME limits, unpublish behavior, channel purge semantics).
