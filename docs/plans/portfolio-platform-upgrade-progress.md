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

## Next
1. Apply both migrations (0100 then 0200); audit any live rows beyond the five seeds.
2. Admin asset manager for graphic cases (upload + roles); landing page featured-by-type.
3. UI components (preview spike), then Videos (bucket, sync API, uploader).

## Notes
- Public queries on `youtube_channels` must list columns explicitly (anon has column-level SELECT only).
- Until work types are backfilled, `/websites` and `/apps-tools` are empty and `/` keeps its legacy Works section.
- Open decisions in plan §12 are still open (video size/MIME limits, unpublish behavior, channel purge semantics).
