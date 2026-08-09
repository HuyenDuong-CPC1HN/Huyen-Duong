# Supabase schema

1. Create a Supabase project.
2. In **SQL Editor**, run `migrations/20260809_init_ops_schema.sql` once. The migration is safe to re-run for its tables, indexes, trigger names, bucket, and policies.
3. Copy the project URL and anon/publishable key into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

`ops-files` is private. The SQL policies intentionally grant every authenticated
operator full read/write access to the shared CPC1HN data store; `anon` has no
table or object policy. Never place `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
for Vite, Vercel, source code, or any `VITE_*` variable. It is only for the
one-time offline migration script.
