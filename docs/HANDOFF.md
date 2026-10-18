# Handoff prompt (paste into the next chat)

You are continuing work on my portfolio admin dashboard (static `public/` + Vercel `api/` + Supabase project `nynmgudfpgyrjcolnewg`; vanilla ES modules, no build step, no new serverless functions: Vercel Hobby 12-function limit). Read this repo first. Hard rules: explicit GRANTs on every new object, RLS on, admin writes only via `private.is_portfolio_admin()`, no secrets in client code, never edit old migrations, keep the existing look and dark theme, accessible, works at 360px, don't break `public/js/portfolio.js` or `api/ai-agent/chat.js`.

## Already done
- Migrations `supabase/migrations/20261018000100..500_*.sql`: grants + constraints, audit log, admin RPCs (status, list/add/remove admins, reorder, AI stats, activity), images bucket + storage policies, optional featured-sync (0500). Rollbacks in `supabase/rollbacks/`. Tested on an in-process Postgres (PGlite): 80 checks passed (RLS, non-admin denied, reorder, audit, last-admin/self-removal, storage policies, idempotent re-run). NOT yet applied to the real Supabase project.
- Pure modules unit-tested (15 tests): `public/js/admin/validators.js`, `model.js`, `settings-schema.js`.
- UI written but NEVER RUN in a browser (syntax-checked only): `public/admin.html`, `public/js/admin-app.js`, `public/js/admin/*.js`, `public/css/admin-dashboard.css`.
- `api/ai-agent/chat.js`: reads private `ai_extra_instructions`, adds a `created_at` ordering tiebreaker, stale header comment fixed.
- `public/js/portfolio.js` + `public/index.html`: `data-setting*` hooks, a settings failure no longer blanks the projects, broken `t.me/` links fixed.

## Left to do (in order)
1. Run the dashboard in headless Chromium (Playwright; chromium is in /opt/pw-browsers) against a mocked Supabase (intercept `https://nynmgudfpgyrjcolnewg.supabase.co/**`, serve supabase-js 2.117.2 UMD locally, preload `sb-nynmgudfpgyrjcolnewg-auth-token` in localStorage). Fix whatever breaks. Check: admin gate, list/filter/sort, reorder by buttons, mouse drag and touch drag, Save/Undo bar, editor validation/counters/preview, image upload, bulk publish/archive/delete, duplicate, export/import, settings save (is_public flags), AI tab (stats, test box), Admins, Activity, session-expiry dialog, unsaved-changes prompts, no horizontal scroll at 360px on every tab, dark mode.
2. Check `portfolio.js` on the public page with mocked REST: order matches admin, hooks apply, a settings failure still renders projects.
3. Review and apply the migrations to Supabase (0500 is optional), then run a manual checklist with a real non-admin account.
4. Write `docs/admin-dashboard.md`: GRANTs/RLS table for every new object, manual test checklist, rollback notes, "not done" list.
5. Known gaps/decisions: no SRI on the supabase-js CDN script; no client-side image resizing; import is append-only; audit log has no retention; keep Supabase Auth "Confirm email" ON (admin = JWT email claim); `adminAuth.js` and `Animated UI Components/` are unused legacy; `public/images/` was missing from my zip, so seeded image paths are unverified.
