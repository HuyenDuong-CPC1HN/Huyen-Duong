# CPC1HN Supabase cutover

This is a big-bang cutover. Production remains unavailable until every step
below has passed; do not restore Firebase keys or use `VITE_FIREBASE_*` as a
workaround.

1. Create the Supabase project, then run
   `supabase/migrations/20260809_init_ops_schema.sql` in the SQL Editor.
   Confirm bucket `ops-files` is private and the policies were created.
2. In Supabase Auth, create each operator manually with a new password. For an
   internal rollout, either disable email confirmation or confirm every user.
3. In a trusted local terminal, run the fixture dry-run then the real one-time
   Firestore migration described in `scripts/README-migrate.md`. Inspect its
   counts and resolve every chunk warning before proceeding. The real script
   hard-stops before writes on a missing/orphan chunk. In SQL Editor reconcile:
   `select channel, count(*) from report_weeks group by channel;`,
   `select count(*) from sheet_reports;`, `select count(*) from tongdon_reports;`,
   `select count(*) from tmdt_reports;`, and `select carrier_key, count(*) from
   carrier_weeks group by carrier_key;` against the script summary before go-live.
4. In Vercel → Project → Settings → Environment Variables, set for Production
   (and Preview only when testing a preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   Do not set any `VITE_FIREBASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, or Firebase
   service-account value in Vercel.
5. Redeploy from the cutover branch. GitHub Pages, if still used, needs the same
   two public Supabase variables at build time.
6. QA with two browsers/machines: login, upload one Đơn C/DTP week, save a sheet
   report, save Tổng đơn and TMĐT, upload one carrier file, and verify the
   second session sees each result. Check HomeBrief reports the same saved state.
7. Disconnect the network and reload: the Vietnamese online-only blocking screen
   must appear; there must be no local editing path. Log out and verify the
   login screen returns.
8. After the production checks and a backup/export are approved, disable the old
   Firebase app credentials and keep Firestore only for the agreed retention
   period. Do not delete it before the migration count reconciliation is signed
   off.

## Rollback boundary

Before step 5, rollback is simply not deploying. After deploying Supabase,
rollback means take the app offline while the data migration is investigated;
there is intentionally no Firebase dual-write or Firebase-env fallback.
