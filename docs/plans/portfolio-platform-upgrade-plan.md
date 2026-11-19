# Portfolio Platform Upgrade — Technical Implementation Plan

**Status:** Planning document; no application or database changes have been made.  
**Audience:** Developer implementing the portfolio upgrade.  
**Scope:** Product structure, existing-system constraints, data model, admin workflows, public pages, YouTube synchronization, video uploads, security, rollout, and acceptance gates.

## 1. Confirmed product decisions

- Keep `/` as a landing page with featured work from across the portfolio.
- Give each work area its own public page: Websites, Apps & Tools, Graphic Designs, UI Components, and Videos.
- Group graphic assets by client or project. One group may contain a logo, Open Graph image, YouTube thumbnail, social banner, and additional images.
- The Videos page has two sections:
  1. Public videos synced from one or more personal YouTube channels.
  2. Videos Belal edited and uploads through the portfolio admin.
- The admin must allow adding, disconnecting/removing, and deleting channel records, and must allow hiding or featuring individual imported videos.
- Each UI component may have a React + TypeScript + Tailwind implementation, a plain HTML/CSS/JavaScript implementation, or both.
- Continue using the existing Supabase-backed admin for all managed content. Migrate existing project records into the new classification.
- The primary portfolio remains a lightweight static/vanilla-JavaScript site. React is a format in the component catalog; it is not a decision to rewrite the portfolio in React.

## 2. Current system inventory

### Public site and deployment

- [`public/index.html`](../../public/index.html) is a single-page portfolio with Intro, About, Works, and Contact sections. Navigation currently uses same-page anchors.
- [`public/js/portfolio.js`](../../public/js/portfolio.js) loads published rows from `public.portfolio_projects` in the browser, renders a card and modal per row, and reads public profile settings from `portfolio_settings`.
- [`public/js/site-config.js`](../../public/js/site-config.js) supplies the public Supabase URL and publishable key. These are client-side values; the service-role key must never be added here.
- [`vercel.json`](../../vercel.json) uses `outputDirectory: "public"`, `cleanUrls: true`, and `trailingSlash: false`.
- [`package.json`](../../package.json) currently has no-op `build` script. Vercel serves the static `public/` tree and the `api/` serverless functions; there is no front-end bundler/router at present.
- [`public/service-worker.js`](../../public/service-worker.js) uses cache version `v9`, precaches an explicit asset list, and falls back to cached assets/offline page when network fetches fail. New pages and shared assets need cache-list review and a cache-version bump when their contents change.
- The deployed API tree currently has the AI assistant endpoint under `api/ai-agent/chat.js`. Check the current Vercel plan and function accounting before deciding how many additional function entry points to add. A repository handoff note mentions a 12-function Hobby limit; treat that number as a verification item because Vercel limits can change and may depend on framework/deployment shape. See [current Vercel limits](https://vercel.com/docs/limits).

### Supabase data and admin

- The existing `public.portfolio_projects` table has `id`, `title`, `summary`, free-form `category`, `project_url`, `github_url`, one `image_url`, `featured`, `status`, `is_published`, `sort_order`, and timestamps. See [`20261008145231_create_portfolio_admin_schema.sql`](../../supabase/migrations/20261008145231_create_portfolio_admin_schema.sql).
- The existing status constraint allows `featured`, `active`, and `archived`. The admin validator derives the boolean `featured` from the status value, while the table stores both a `featured` boolean and `status`. The implementation must resolve this duplication without losing current featured state.
- [`public/js/admin/`](../../public/js/admin/) contains the current CRUD dashboard modules: project lists/editing, settings, image uploads, ordering, activity, admins, and AI usage.
- The admin uploads images to the public `portfolio-images` bucket. Its current policy permits admin-only writes, allows public URLs to serve objects, disallows anonymous listing, caps objects at 5 MB, and accepts JPEG, PNG, WebP, GIF, and AVIF. SVG is deliberately excluded. See [`20261018000400_portfolio_images_bucket.sql`](../../supabase/migrations/20261018000400_portfolio_images_bucket.sql) and [`public/js/admin/validators.js`](../../public/js/admin/validators.js).
- Admin authorization is based on the existing `private.is_portfolio_admin()` helper and authenticated-user RLS policies. Reuse that identity model for all new database and Storage writes.
- Existing seed examples include Number Systems App, Calculator App, Number Systems Website, Encryption Methods, and Basmagi Quiz Platform. Treat these as examples only; inspect the live table and have the owner approve ambiguous Website vs. Apps & Tools mappings before updating production records.

## 3. Target information architecture and URLs

Recommended extensionless URLs, compatible with the current clean-URL configuration:

- `/` — landing page: selected featured items across all types, short profile/about content, and clear links to category pages.
- `/websites` — websites and traditional site builds.
- `/apps-tools` — web apps, software projects, utilities, and interactive tools.
- `/graphic-designs` — grouped project/client cases with labeled media galleries.
- `/ui-components` — searchable/filterable component catalog, format selector, preview, and source view.
- `/videos` — separate YouTube channel and edited-video sections.
- `/admin` — existing admin entry point, extended with type-specific workflows.

Use shared header/footer/navigation markup or a small shared renderer so page navigation and active states do not drift. Keep each route as a static HTML entry point unless the component-preview spike proves a small build step is required. A component detail may initially open in an accessible dialog on the catalog page; separate item URLs are a later SEO decision, since per-item static pages would require generated pages or a new routing/build layer.

For every public route, provide a page title, description, canonical URL, social-sharing metadata, responsive layout, keyboard navigation, visible focus, and a sitemap entry. Update the service-worker asset list/cache version along with any new page shell and shared scripts/styles.

## 4. Proposed content architecture

The following is a target model, not final SQL. Keep the change additive and use new migrations; do not rewrite previously applied migrations.

### 4.1 `portfolio_projects` as the transitional shared work-item table

Continue using the existing table during migration to reduce breakage. Add a stable `work_type` column with a constrained set of values:

- `website`
- `app_tool`
- `graphic_case`
- `ui_component`
- `edited_video`

Recommended additional fields:

- `slug` (unique, normalized, used for stable item links/dialog IDs and future detail routes).
- Existing `category` retained as a display/tag field, not as the page-routing discriminator.
- Existing `image_url` retained as a compatibility cover field while the asset relation is introduced.

**Publication/featured cleanup:** document a single meaning for each field before changing the admin. Prefer `is_published` for visitor visibility, `featured` for homepage/page promotion, and `status` for editorial lifecycle (e.g. active/archived). First map current `status='featured'` to `featured=true` and `status='active'`; preserve `is_published` and archived rows. Deploy code that can read the old values before tightening/removing the old constraint in a later migration. If compatibility requires keeping the status values longer, make one field authoritative and treat the other as a derived legacy value until removal.

### 4.2 `portfolio_assets` for grouped graphics and media

One work item may own many media rows. Suggested fields:

- `id`, `portfolio_project_id` (FK with cascade on parent deletion), `media_kind` (`image` or `video`), `role`, `storage_path`, optional external URL, `alt_text`, caption, MIME type, byte size, width/height or duration where relevant, and `sort_order`.
- Roles should cover `cover`, `gallery`, `logo`, `youtube_thumbnail`, `opengraph`, `social_banner`, `poster`, and `edited_video`. Use constrained role values or a controlled role registry; do not overload the free-form project category.
- Store bucket/path as the canonical reference for managed uploads. Generate public URLs from the configured Supabase project rather than treating a URL string as the only asset identity.
- Keep `image_url` populated from the designated cover asset during transition, then remove it only after every reader/writer has moved.

### 4.3 `portfolio_component_variants` and source files

Create one variant row per implementation of a component, keyed by parent component and format:

- Format values: `react_ts_tailwind` and `html_css_js`.
- Variant metadata: entry file, preview artifact/path, dependency allowlist/version set, display order, and build state/version.
- Store source files as child rows (e.g. `portfolio_component_files`) with relative path, source text, entry-point flag, and order. This handles multi-file examples without embedding an opaque ZIP in a public row.
- Treat component source as public only when its parent item is published. The same component may have one variant or both.

**Preview isolation is a required design gate.** The current site has no compiler, and TSX/Tailwind are not directly runnable in the browser. Do not evaluate database-provided component code in the portfolio page’s origin. Prototype a publish/build workflow that produces a static preview bundle and serves it in a sandboxed iframe without `allow-same-origin`. Limit imported dependencies to an explicit allowlist. The ordinary portfolio bundle must not become a general-purpose code execution environment. If safe, admin-driven preview builds are too costly for the initial release, ship source display/copy/download plus curated preview artifacts first and defer arbitrary live compilation.

### 4.4 YouTube channels and imported video metadata

Use separate tables so external source metadata is distinct from manually authored portfolio items:

- `youtube_channels`: internal ID, unique YouTube channel ID, submitted handle/URL, display name, uploads playlist ID, active/disconnected state, last sync start/end, last success, sanitized error code, and timestamps.
- `youtube_videos`: unique YouTube video ID, channel FK, title, description, published date, thumbnail metadata/URL, privacy status, last synced time, `is_visible`/manual hidden flag, `featured`, `sort_order`, and timestamps.
- Keep manual visibility separate from YouTube privacy status. Public rendering must require both `privacy_status='public'` and an admin-visible state. Unlisted/private/removed/unavailable items must not be rendered.
- Disconnecting/removing a channel should stop sync and hide its videos while retaining metadata by default. Make permanent purge an explicit admin action with a confirmation and cleanup path.

The YouTube Data API can look up a public channel by handle or ID; `channels.list` with `contentDetails` provides its uploads playlist. `playlistItems.list` returns upload items in pages of up to 50 and supplies a next-page token. Use `videos.list` in batches to refresh `status.privacyStatus` and metadata before public display. API keys can be used for requests that only retrieve public data; OAuth is needed for private user data. Keep the key server-side. [YouTube authorization](https://developers.google.com/youtube/data/guides/authentication), [channels.list](https://developers.google.com/youtube/data/reference/rest/v3/channels/list), [playlistItems.list](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list), [videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list).

### 4.5 Edited video uploads

- Create a dedicated `portfolio-videos` Storage bucket. Do not loosen the existing 5 MB raster-only image bucket.
- Recommended initial format: MP4 (H.264 video/AAC audio), with file-size limits chosen after reviewing likely source files and project storage/egress budget. Do not imply that Supabase will transcode or compress uploads; the initial flow should require export-ready video files.
- Add a browser uploader in the admin with type/size validation, progress, cancellation/retry, and cleanup of orphaned uploads when a project save is abandoned.
- Supabase recommends resumable/TUS uploads above 6 MB; use them for normal video-sized files. [Supabase upload guidance](https://supabase.com/docs/guides/storage/uploads/standard-uploads).
- Published video objects are intended to be public. A public bucket allows direct URL reads regardless of table publication state, so if unpublishing must revoke direct access, choose a private bucket with signed URLs or delete/replace the object. Make that product/security behavior explicit before release.
- Use admin-only Storage object policies for upload/update/delete and avoid an anonymous `SELECT` listing policy. Keep file size/MIME restrictions configured on the bucket as well as checked in the UI. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## 5. Public data access and rendering

- Add a shared browser-side portfolio repository module rather than copy/pasting Supabase queries into each page.
- Public selects should request only fields needed for each page and filter by `is_published`, non-archived state, and `work_type`; order by manual `sort_order`, then a stable date/title fallback.
- For graphics, fetch parent case rows and ordered asset children. For components, fetch only published variants/files needed for the visible component. Avoid loading every source file for every component on initial page load; load selected source/preview on demand.
- For the Videos page, query cached YouTube metadata plus edited-video work items. Do not call YouTube from a visitor’s page view.
- Lazy-load gallery images and video posters; use `preload="metadata"`, controls, and no autoplay for uploaded video. Keep YouTube embeds click-to-load or otherwise defer heavy third-party frames until needed.
- Preserve the existing safe DOM construction pattern (`textContent` for titles/descriptions); do not render user-managed titles/captions with unsanitized `innerHTML`.

## 6. Admin implementation

### Work list

- Add a work-type filter and type-aware labels/forms while retaining search, publication status, archive, ordering, and feature controls.
- Migrate the current Projects panel to a broader Work panel only after the database change is deployed. Keep a compatibility view or dual-read period so the existing public root page does not go blank mid-rollout.
- Provide a clear type-specific editor: website links/stack; app/tool links/stack; graphic case client/project and ordered asset roles; component variants/files/preview; edited video metadata and media upload.

### Channel manager

- Add channel by handle, URL, or channel ID; resolve it on the server and show the resolved channel before saving to prevent accidental wrong-channel imports.
- List connected channels with active state and last successful sync/error summary; support sync-now, disconnect, and delete/purge as distinct operations.
- Add per-video visible/hidden, featured, and order controls. Imported title/description may be refreshed from YouTube, but admin visibility/feature/order values must be preserved on sync.

### Upload management

- Upload into a deterministic per-project/per-asset path; generate unique names and avoid replacing unrelated media.
- Track upload object and database row lifecycle. On delete/replacement, remove objects only after confirming they are no longer referenced by any asset row.
- Show a public preview and validate playback before publish.

## 7. YouTube sync service

Implement a server-side sync worker, preferably one Vercel API entry point that can handle scheduled and admin-triggered sync paths if current deployment function limits favor consolidation.

Suggested flow:

1. Verify cron authorization for scheduled calls, or authenticated admin authorization for manual calls. Do not expose a public unauthenticated sync route.
2. Load active channel records and prevent overlapping sync for the same channel (lock/status field or idempotent upsert strategy).
3. Resolve the channel’s uploads playlist if missing, then page through recent/initial playlist items. Use the YouTube `nextPageToken` for backfill and stop incremental scans when known recent IDs are reached; allow a bounded full reconciliation to detect changed/deleted videos.
4. Batch video IDs into `videos.list` calls to refresh public metadata/privacy. Only records with public privacy status are eligible for display.
5. Upsert metadata on stable YouTube video ID. Preserve admin-owned flags (`is_visible`, `featured`, `sort_order`) across metadata refreshes.
6. Mark newly imported public videos visible by default, with immediate admin hide control. If a video becomes private or unavailable, make it non-renderable without deleting its admin history.
7. Record last sync timestamps and sanitized error codes. Never log API key, full request URL containing the key, or full user-facing content.

Use a daily scheduled sync as the initial default plus an admin “Sync now” control. A daily cadence is enough for a portfolio and keeps quota usage predictable. Vercel Cron invokes a production route; verify current plan scheduling limits and runtime constraints before deployment. Vercel’s current guide documents the cron configuration and invocation model: [Cron Jobs](https://vercel.com/docs/schedules/cron-jobs). Store `YOUTUBE_DATA_API_KEY` and `CRON_SECRET` as server-only deployment variables. Restrict the Google key to YouTube Data API v3; do not place it in `public/` or `NEXT_PUBLIC_*` settings.

## 8. Migration and deployment sequence

This repo uses timestamped imperative migrations. Create new forward migrations; do not edit old migration files. The Supabase guide recommends keeping hosted schema changes in versioned migration files. CLI v3 changed hosted/local defaults, so explicitly confirm CLI version and use explicit target flags when the implementation runs. [Migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Supabase CLI v3 change](https://supabase.com/changelog/supabase-cli-v3).

1. **Content audit:** export/read all live `portfolio_projects` rows; classify them with owner review. Record legacy IDs, old category, target `work_type`, current cover, publication state, featured state, links, and ordering.
2. **Additive schema migration:** add `work_type` and `slug`; create asset, component variant/file, YouTube channel, and YouTube video structures as needed. Add explicit grants, RLS, and indexes in the same migration set. Keep existing columns/queries usable.
3. **Storage migration:** add the separate video bucket and admin-only write policies. Do not modify the image bucket’s existing MIME/size policy.
4. **Deploy admin compatibility:** update validators, list/edit forms, and upload modules to understand the new fields while still reading legacy records.
5. **Backfill:** set work types and slugs for approved existing rows; move current images into asset metadata by reference (no binary copy required unless changing storage); preserve publication, link, order, and feature state. Do not guess ambiguous categories or delete rows/media.
6. **Deploy page shell and Websites/Apps pages:** update shared navigation and home featured list. Add the new static page entry points; keep the old Works section or route available during the transition.
7. **Deploy graphics/components:** ship graphic gallery and the component preview spike/build workflow after their content/asset queries are stable.
8. **Deploy Videos:** add channel management, import/backfill, scheduled sync, edited-video upload, and playback page. Start with one channel and a small number of uploaded videos, then add the rest.
9. **Retire compatibility:** after production verification, remove legacy query paths/fields only in a separate migration and release. Keep a documented rollback path for the last schema and frontend changes.

## 9. Access control, performance, and operational safeguards

- Enable RLS on every new table in an exposed schema. Grant only the operations needed by `anon`/`authenticated`; policies do not replace grants. Public roles get read access to published rows only. Admin writes use the existing `private.is_portfolio_admin()` model. Keep service-role credentials server-side only. [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
- For child rows (assets, component variants/files), public policies must verify that the parent is published and not archived; do not rely solely on front-end filtering.
- Add indexes for common public queries: `(work_type, sort_order, created_at)` with a partial condition for published/non-archived records; unique slug; unique YouTube video ID; YouTube channel FK/order; and asset/variant parent plus order. Confirm index predicates against actual query filters.
- Avoid N+1 public reads. Use bounded page queries and fetch variant code only on demand. Cache generated preview artifacts and video thumbnails where practical.
- Avoid synchronizing every channel on every visitor request. Scheduled/manual backend sync writes metadata once; public pages read local cached metadata.
- Track Supabase Storage size/egress and YouTube API quota. Set maximum uploaded video bytes, allowed MIME types, and retention policy before broad uploads. If video delivery becomes expensive, reassess hosting before increasing upload limits.
- Make channel sync idempotent and bounded. A failed sync must not erase existing records; partial failure should record channel-level status and retry later.
- For public bucket media, publication flags hide media from normal site queries but do not revoke a known public object URL. If immediate revocation is required, use private objects/signed delivery or remove the object.
- Bump the service-worker cache version and include new route/static files in the precache list, or explicitly keep dynamic routes network-only with the existing offline fallback.
- Keep environment variables server-only: `YOUTUBE_DATA_API_KEY`, `CRON_SECRET`, and any server-side Supabase service credential. The browser continues to use the existing publishable key.

## 10. UI component preview proof-of-concept

Before committing to a production editor for arbitrary component source, build one representative component in each variant and answer:

- Can the React + TypeScript + Tailwind example be built without converting the main portfolio to React?
- Can the HTML/CSS/JS example use the same catalog UX and isolated preview boundary?
- How are dependencies declared and pinned? Initially allow only React, React DOM, Tailwind utilities, and a small approved set; do not allow arbitrary package installation from an admin form.
- Can an admin save source, preview the built artifact, and publish it without executing the source in the admin or public page origin?
- Is a static preview artifact acceptable, or is immediate runtime compilation a hard requirement?

Recommended initial behavior: source files are visible/copyable/downloadable for published items; a preview is a prebuilt isolated artifact, not code evaluated directly from Supabase data. If a safe maintainable build step cannot be delivered in the first release, launch source + curated preview artifacts and defer live compilation rather than weakening isolation.

## 11. Acceptance gates

The implementation is ready for launch when:

- The root landing page remains intact and links to the five category pages.
- Every live legacy project has an owner-reviewed target type; no record loses title, summary, link, cover, publication state, feature state, or ordering.
- Websites and Apps & Tools display only their corresponding work types; graphics show grouped ordered assets; UI Components show the available variant(s); Videos has the two requested sections.
- Channel sync handles multiple channels, pagination, retries, duplicates, changed privacy, and manual hide/feature state without resetting admin choices.
- Non-public or unavailable YouTube videos are never shown. Removing a channel follows the documented soft-disconnect/purge behavior.
- Edited-video uploads validate file size/type, show progress, and play in supported browsers; image bucket restrictions remain unchanged.
- Public visitors can read only published work/media metadata and cannot write to database or storage. Admin upload/delete uses the existing admin identity check.
- Component preview execution is isolated from the main site origin and has a controlled dependency/build path.
- Page metadata, sitemap, service-worker cache behavior, offline fallback, keyboard interaction, and responsive layouts are reviewed on the final routes.
- Database and frontend rollout can be reversed without deleting existing portfolio media or losing the pre-migration rows.

## 12. Decisions intentionally left for implementation kickoff

These do not block the architecture, but should be resolved before the related phase:

- Final route names/capitalization and whether graphic case dialogs need indexable per-case URLs.
- Owner-approved mapping of existing live projects into Websites vs. Apps & Tools.
- Maximum edited-video file size, allowed exact MIME set, and storage/egress budget.
- Whether public uploaded videos remain directly accessible after an item is unpublished, or whether signed URLs/object deletion are required.
- Whether YouTube channel deletion means soft disconnect only or explicit purge of imported records.
- Initial YouTube sync cadence based on current Vercel plan and desired freshness; ship a manual sync regardless.
- Component preview artifact build path and whether a source-only launch is acceptable if admin-triggered compilation is not safe/simple.
- Whether work detail pages are needed at launch or an accessible gallery/dialog per category is sufficient.

## References

- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [YouTube Data API authorization](https://developers.google.com/youtube/data/guides/authentication)
- [YouTube channels.list](https://developers.google.com/youtube/data/reference/rest/v3/channels/list)
- [YouTube playlistItems.list](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list)
- [YouTube videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list)
- [Vercel Cron Jobs](https://vercel.com/docs/schedules/cron-jobs)
- [Vercel limits](https://vercel.com/docs/limits)

## UI Components

Many usable UI Components were copied from 21st.dev into `docs\components\`, but they are using a framework, so that needs a decision, whether migrating to that framework is a good decision now or not.