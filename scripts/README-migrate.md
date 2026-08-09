# One-time Firestore to Supabase migration

Run only from a local, trusted terminal after applying the SQL migration. The
script is not imported by Vite and is the only code path allowed to use the
Supabase service-role key.

```powershell
$env:SUPABASE_URL='https://YOUR_PROJECT.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='service-role-secret'
$env:FIREBASE_SERVICE_ACCOUNT_JSON=(Get-Content -Raw .\firebase-service-account.json)
npm install --save-dev firebase-admin
node .\scripts\migrate-firestore-to-supabase.mjs --dry-run
node .\scripts\migrate-firestore-to-supabase.mjs
```

For a credential-free shape check, use the included fixture:

```powershell
$env:SUPABASE_URL='https://example.supabase.co'
node .\scripts\migrate-firestore-to-supabase.mjs --dry-run --fixture=scripts/fixtures/sample-kvstore.json
```

The JSON summary reports input key count, per-table rows, and orphan/missing
chunks. Investigate every warning before the production run. Do not put either
secret in `.env.local`, a `VITE_*` variable, Vercel, git, or a support ticket.
