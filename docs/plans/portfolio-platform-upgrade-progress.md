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

## Done in round 6 (header redesign)
- Header reduced from 9 links (wrapping to 2 rows) to one row: Belal. | Work v | About | Say Hello | ... Admin (muted, right).
  "Work" opens an Apple-style full-width panel (Websites, Apps & Tools, Graphic Designs, Videos, each with a one-line
  description). Desktop: hover or click; keyboard: Enter/Space, Esc closes and refocuses the trigger, focus leaving closes it.
  Mobile (<= 800px): the existing slide-down menu with "Work" as an accordion. `aria-expanded`/`aria-controls` set; reduced
  motion respected. Active page highlights both the panel link and "Work".
- New `public/js/site/nav.js` (event delegation, loaded on all 5 public pages); markup single-sourced in `shell.js`
  (`WORK_LINKS`/`NAV_LINKS`), mirrored statically in `index.html`. CSS in `styles.css` ("header dropdown"). Service worker `v15`.
- Fixed existing bug: on the category pages the mobile menu button did nothing (main.js bound it before `shell.js` rendered
  the header). `nav.js` now owns the toggle on shell pages (`body[data-shell-nav]`); index.html still uses main.js.
- Fixed `main.js` scroll-spy crash for sections with no nav link (Intro/Works links were removed from the header).
  Consequence: the header no longer links to Intro/Works on `/`; the legacy Works section is reached by scrolling.
- Browser-checked at 1280/820/360px (single row, no horizontal scroll, dropdown open/close, Esc, mobile accordion).
  Not checked: real-device touch, screen reader. The sandbox blocked the CDN scripts, so the home intro animation was not seen.
- Not done this round: UI components (Next 3) and Next 1/2/4 (they need your actions/decisions).

## Decisions (owner, round 7)
- Home header: no Intro/Works links is fine. Admin link stays in the header. Owner applied migrations/env vars/limits (round 6 Next 1-2).

## Done in round 7
- YouTube errors: 400/401/403/429 are now classified from Google's error reason into fixed codes (`youtube_quota_exceeded`,
  `youtube_api_not_enabled`, `youtube_key_restricted`, `youtube_key_invalid`; unknown stays `youtube_quota_or_forbidden`) with
  actionable admin messages. Only the code is kept; the body is never stored. Reported 502 was Google answering 403 to the
  server-side call; cause is almost always the key (API not enabled, or an HTTP-referrer restriction, which can never work for a
  server). After this patch the admin shows which one. Test added (19 pass).
- UI components: `/ui-components` page (`ui-components.html`, `js/site/components-page.js`): search, format filter, detail dialog
  with format tabs, sandboxed preview iframe (`sandbox="allow-scripts"`, no allow-same-origin), source viewer (textContent only),
  Copy, Download file. Pure helpers in `js/site/component-model.js` (preview path must be `/previews/**.html`, safe file paths,
  dependency allowlist react/react-dom/tailwindcss/typescript with exact versions, draft validation). Test file added.
- Admin: "Component formats" section for Type = UI component (`js/admin/component-panel.js`): per format preview path,
  dependencies, multiple source files with an entry file, immediate per-format save (removals last), remove format.
- Previews are prebuilt static pages committed under `public/previews/<name>/index.html`; `vercel.json` serves `/previews/*` with a
  CSP `sandbox allow-scripts` header and no network. `public/previews/sample-button/` is a sample to delete once real ones exist.
  No live compilation (owner decision). No new migration; uses the round-1 tables.
- Header: 5th "UI Components" item in the Work panel; sitemap; service worker `v16`.
- Browser-checked with mocked Supabase at 1280/360: catalog, search, format tabs, preview frame runs sandboxed, source with
  `<script>` shown as text (no execution), no horizontal scroll. Admin component panel was NOT browser-checked. Not run against real Supabase.

## Decisions (owner, round 8)
- Convert the two items in `Animated UI Components/`. YouTube videos verified working. Home Works section = featured items of
  every type (status `featured` is the single source of truth); the "View all" featured block is removed.

## Done in round 8
- Home: the legacy Works section (`js/portfolio.js`) now loads published, non-archived items with `status='featured'` of any type,
  ordered by sort_order. The separate "Featured Work" block and `featured-home.js` are gone. Cards still open the details popup.
  Not covered yet: featured YouTube videos (`youtube_videos.featured`) are not shown on the home page.
- Admin sign-in flash: an inline head script marks `html.auth-pending` when a Supabase session key exists in localStorage; the
  login card is hidden behind a small "Opening dashboard..." splash until the session check resolves (`setView` clears it; an
  8 s fallback reveals the login if the script fails). Without a stored session the login shows immediately.
- Admin redesign (first pass): sidebar regrouped as Work (Websites, Apps & Tools, Graphic Designs, UI Components, Edited Videos,
  and "Needs a type" with a count when old rows lack a type) / Channels (YouTube) / Site (Settings, AI, Admins, Activity), with SVG
  icons instead of glyphs; the old "Projects" tab is gone (`#projects` links open Websites). Each Work section is the existing
  list/editor scoped to one type: "New website/app or tool/..." pre-selects the type, stats/search/reorder apply to that type
  (reordering keeps the other types' slots in the full order). Topbar buttons have icons. Favicon + apple-touch icon added.
  NOT redone: the inner layout of the editor form and the Settings/AI/Admins/Activity panels (still the old look).
- Components: `public/previews/sign-in-page/` (from `sign-in-page-template.md`, MIT attribution kept in its header) and
  `supabase/seed-ui-components.sql` which creates it as an unpublished component with its source. Run it once, then publish it
  in Admin > UI Components. The AI-agent template is a multi-file app tied to Supabase/API routes; not converted (open decision).
- Service worker `v17`. Browser-checked with mocked Supabase at 1280/390: no login flash with a stored session, type sections,
  scoped lists, preset type on new items. Home page not browser-checked with mocked data.

## Decisions (owner, round 9)
- AI-agent template: skip for now. Priority: the owner must be able to add UI components from the admin alone.
- Admin tabs wanted: Websites, Apps & Tools, Graphic Designs, UI Components (the round 8 sidebar already provides these).
- Featured YouTube videos appear in the home Works section.

## Done in round 9
- UI components are fully addable from the admin, no deploy: each format has source files plus a **preview page** stored with the
  component as a reserved file row (`.preview/index.html`, hidden from the source viewer). The public page and the admin's
  "Show preview" button render it only in `<iframe sandbox="allow-scripts" srcdoc>` (opaque origin, no allow-same-origin) with an
  injected CSP (no network except Tailwind/jsDelivr/unpkg scripts and Google Fonts). HTML/CSS/JS formats need no separate preview:
  the page is built from the entry HTML with its own CSS/JS files inlined. React/TSX formats need a pasted self-contained preview
  page (no compilation, as decided). Legacy `preview_path` and `/previews/` files still work. No migration.
- Per-type editor fields: websites/apps/graphic/UI/video show only the link fields that fit (hidden values are kept).
- Home Works section now also shows featured, visible, public YouTube videos (card opens the details popup with a YouTube link).
- Tests: 21 pass. Browser-checked (mocked Supabase): preview built from html+css+js ran inside the sandboxed frame. The new admin
  preview textarea/button was not browser-checked.
- Service worker `v18`.

## Next (for the next conversation)
1. Admin visual redesign, part 2 (owner wants a totally new layout): restyle the project editor form (sticky save bar, cleaner
   sections, per-type layouts), and the Settings, AI assistant, Admins and Activity panels. The sidebar/tabs and per-type
   sections already exist (round 8). Tab ids: `w-website`, `w-app_tool`, `w-graphic_case`, `w-ui_component`, `w-edited_video`,
   `w-none` (old items without a type), `videos` (YouTube), settings, ai, admins, activity.
2. Browser-check on the real project: admin component panel (formats, source files, preview textarea, "Show preview"), the home
   Works section with featured projects + featured YouTube videos, `/ui-components`.
3. Run `supabase/seed-ui-components.sql` once (if not done) and publish the "Sign-in page" component from the admin.
   The AI-agent template in `Animated UI Components/` is intentionally skipped for now (owner decision, round 9).
4. Optional: delete `public/previews/sample-button/` (sample only). Legacy `preview_path` previews under `/previews/` still work.
5. Retire compatibility paths (plan section 8 step 9) after production verification.
6. Decide plan section 12 items still open (video size/MIME limits, unpublish behavior, channel purge semantics) and whether
   React component previews need a build step (currently: paste a self-contained preview page).

## Notes
- Public queries on `youtube_channels` must list columns explicitly (anon has column-level SELECT only).
- Until work types are backfilled, `/websites` and `/apps-tools` are empty and `/` keeps its legacy Works section.
- Open decisions in plan §12 are still open (video size/MIME limits, unpublish behavior, channel purge semantics).
