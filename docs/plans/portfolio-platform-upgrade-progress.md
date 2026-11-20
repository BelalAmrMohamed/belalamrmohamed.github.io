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

## Done in round 10 (review of the uploaded snapshot, docs only, no code change)
- Checked the snapshot against this log: `node --test tests/*.test.mjs` passes 21 of 21, and `CACHE_VERSION` is `v18`, as logged in round 9.
- `public/previews/` now holds only `sign-in-page/`. The sample preview was removed, but no round recorded it.
- Migrations `20261018000500` (featured/status) and `20261120000100` (videos bucket) are in the snapshot. This log does not record whether they are applied to the live project (open decision C).
- Plan §12 reconciled: items already answered in rounds 2-9 are marked Decided with their round; the rest are Open.

## Decisions (owner, round 11)
- A. Admin: keep the dark theme and restructure the layout.
- B. Admin redesign scope: project editor plus Settings, AI assistant, Admins, and Activity.
- C. All migrations are applied to the live Supabase project. The Storage upload limit is set to 50 MB.
- D. Video storage and egress budget: best practice, delegated to the assistant. Recorded in plan §12 as alerts at 70% and 90% of quota, monthly review, small video count, long-form on YouTube.
- E. Work detail pages: each work item has its own page.
- F. Compatibility: retire all of it. No backward compatibility.
- G. React component previews: keep pasting self-contained preview pages.

## Done in round 11 (docs only, no code change)
- Plan §12 rewritten with the round 11 answers. Plan §3 records separate item pages. Plan §8 step 9 expanded into an ordered retirement list (a–h), based on a code search of the snapshot.
- Code search, for reference: covers still live in `image_url` for every type. `public/js/site/portfolio-repo.js` still filters on `featured`. `preview_path` and `public/previews/` are still used. `public/js/admin-app.js` still has the `#projects` alias and the legacy verdict.

## Decisions (owner, round 12)
- H. Item pages: adopt the recommendation. A build step writes one static page per published item, with a client-rendered fallback and a deploy hook after admin saves (plan §12).
- I. Unclassified rows: the owner listed the six rows (`work_type IS NULL`) but has not yet assigned a type to each. Nothing has been applied.

## Proposed classification for I (not applied; owner to confirm)
| Title | Status | Proposed `work_type` | Basis |
| --- | --- | --- | --- |
| منصة امتحانات بصمجي | active | `app_tool` | Arabic name of the "Basamgy Exams Platform" in the AI template, which is the same product as "Basmagi Quiz Platform" (already `app_tool`). Likely. |
| OS Projects (MAUI + WinForms) | active | `app_tool` | Software projects, which plan §1 places under Apps & Tools. Likely, not verified. |
| Clipbook | active | `app_tool` | Name suggests a tool. Not verified. |
| Mr. Amr Mohamed | featured | unknown | Name only. Could be a profile or case study. Owner to decide. |
| رحلة في السيرة | featured | unknown | No repo evidence. Owner to decide. |
| على رفوف المساجد | featured | unknown | No repo evidence. Owner to decide. |

Only three of the six have evidence. The owner should confirm the three proposals and say which type each of the other three is (website, app/tool, graphic design, UI component, or edited video), or that it should be deleted. Featured rows must be classified or deleted, because the home Works section will show them only after they have a type.

## Decisions (owner, round 13)
- I. Six unclassified rows: website = منصة امتحانات بصمجي, Mr. Amr Mohamed, رحلة في السيرة, على رفوف المساجد; app/tool = OS Projects (MAUI + WinForms), Clipbook.

## Done in round 13 (code, not yet applied to the live project)
- `supabase/migrations/20261120000200_portfolio_classify_unclassified.sql` (+ rollback, README order). Sets `work_type` by row id, only where it is still NULL, and proposes ASCII slugs when free. No publication, featured, order, link or image data changes.
- Step 9g is complete once this migration is applied. Owner: run it on the live project, then check that the six rows show in the right admin tabs.
- Open question from the owner's answer: "رحلة في السيرة" is both a Website and an Android App. The schema has one `work_type` per item, so it is stored as a Website. The Android app link has no field yet. Decide where it goes (a link field, a second item, or a note in the description).
- Slugs are proposals. The Arabic titles were transliterated (for example `basmagi-exams-platform`, `rihlat-fi-al-sira`). Change them in the admin if you prefer other slugs.

## Next (for the next conversation)
1. Owner: run `20261120000200_portfolio_classify_unclassified.sql` on the live project, and answer the Android-app question above.
2. Admin redesign, part 2 (A, B): restructure the layout on the dark theme. Cover the project editor (sticky save bar, per-type sections) and Settings, AI, Admins and Activity. Browser-check at 360px and 1280px on mocked Supabase. Not blocked.
3. Work detail pages (H, E): one static page per published work item for all five types, plus the client fallback. Not blocked.
4. Compatibility retirement (F): plan §8 step 9, in order a–h. Steps a–g are unblocked once item 1 is applied; step h must wait for item 2 and item 3 (pages must no longer depend on `image_url`).
5. Owner actions, not doable from here: browser-checks on the live project; run `supabase/seed-ui-components.sql` if it has not been run, then publish "Sign-in page".

## Notes
- Public queries on `youtube_channels` must list columns explicitly (anon has column-level SELECT only).
- Backfill `20261119000200` was applied in round 4, so `/websites` and `/apps-tools` show the classified rows. The home page Works section shows featured items (round 8).
- `docs/HANDOFF.md` predates round 4. This log supersedes it, and its "Left to do" list is no longer current.
- The uploaded zip has no git history, so this log is the only record of changes between rounds.
