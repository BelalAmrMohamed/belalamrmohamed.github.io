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

## Next
1. Apply migrations 0100 then 0200 to the real project; audit live rows beyond the five seeds. (Needs owner access.)
2. Resolve featured/status duplication (plan 4.1; Calculator App seed row is still inconsistent).
3. UI components (preview spike), then Videos (bucket, sync API, uploader).

## Notes
- Public queries on `youtube_channels` must list columns explicitly (anon has column-level SELECT only).
- Until work types are backfilled, `/websites` and `/apps-tools` are empty and `/` keeps its legacy Works section.
- Open decisions in plan §12 are still open (video size/MIME limits, unpublish behavior, channel purge semantics).
