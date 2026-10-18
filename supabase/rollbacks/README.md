# Rollback scripts

These are **not** migrations (they live outside `supabase/migrations/` so they never run
automatically). Run them by hand, newest first, only if you need to undo an upgrade:

1. `20261018000500_rollback.sql`
2. `20261018000400_rollback.sql`
3. `20261018000300_rollback.sql`
4. `20261018000200_rollback.sql`
5. `20261018000100_rollback.sql`

Each file's header says what data it destroys. Rolling back 0300 or earlier while the new
admin UI is deployed will make the matching tabs show "database upgrade required".
