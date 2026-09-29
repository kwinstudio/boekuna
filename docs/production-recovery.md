# BOEKUNA Production Recovery Runbook

Last verified: 2026-09-29

## Goal

Recover BOEKUNA without guessing after a bad deploy, database incident, or deleted Storage object.

The database and Supabase Storage are separate recovery surfaces. A database backup contains Storage metadata, but it does **not** restore deleted Storage object bytes.

## Current recovery anchors

### Render web app — `boekuna-boekhouding`

- Auto-deploy: OFF.
- Current verified production deploy at the time this runbook was created: commit `4b4ef816c9caed92233a5ad1a2d102b36484cea9`.
- Render keeps recent successful build artifacts. Use **Deploys → Rollback** to return to the last known-good deploy.
- If the UI rollback artifact is no longer retained, use **Manual Deploy → Deploy a specific commit** with the last known-good commit.

### Render document processor — `kwinest-docprocessor`

- Auto-deploy: OFF.
- Current verified production processor anchor: commit `9d15119b505cd1bce9b11bcba3239eefbf038b4f`.
- External AI is disabled by default at this anchor.
- Do not intentionally roll the processor back to a revision older than this anchor without re-verifying the external-AI guard.

## Pre-release backup

Run this before any production release that changes schema, financial data handling, auth, Storage, or destructive account/document behavior.

Requirements on the Windows machine:

- Docker Desktop
- Supabase CLI
- PostgreSQL client tools containing `pg_dump`
- A database Session Pooler URL from Supabase Dashboard → Connect
- The production Supabase URL
- The production service-role key

Set secrets only in the current terminal/session. Never commit them.

```powershell
$env:SUPABASE_DB_URL = "postgresql://..."
$env:SUPABASE_URL = "https://vuwfyhtejsxhdfyvkkeq.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<secret>"

pwsh -File .\scripts\backup-production.ps1 -OutputRoot "D:\BoekunaBackups"
```

The script creates:

- `roles.sql`
- `schema.sql`
- `data.sql`
- `history_schema.sql`
- `history_data.sql`
- `auth-data.sql` for emergency preservation of Auth rows
- every object from `kwinest-documents`
- every object from `kwinest-site`
- `manifest.json` with SHA-256 checksums

Store at least one copy on a different device/provider and encrypt it at rest. Never put these backups in this public Git repository.

## Database recovery

### Preferred paid-plan route

If daily backups or PITR are enabled, use Supabase Dashboard → Database → Backups. Choose the newest safe recovery point before the incident. Expect downtime during an in-place restore.

PITR must have been enabled **before** the incident to restore to an arbitrary point in time.

### Manual logical recovery route

For a new recovery project:

1. Create a fresh Supabase project in the same region.
2. Re-enable non-default extensions and required platform settings.
3. Restore `roles.sql`, `schema.sql`, and `data.sql` using the current Supabase backup/restore guidance.
4. Restore migration history from `history_schema.sql` + `history_data.sql`.
5. Use `auth-data.sql` only as the emergency Auth preservation source; validate the current Supabase Auth migration procedure before importing managed Auth rows.
6. Deploy all Edge Functions from GitHub.
7. Re-enter secrets and provider configuration; secrets are not recovered from Git.
8. Reapply/verify Auth settings, redirect URLs, SMTP/OAuth providers and rate limits.
9. Restore Storage objects separately.
10. Run tenant-isolation, auth, financial, invoice PDF, scanner and billing smoke tests before switching traffic.

Do not restore directly over production as the first drill. Prove the procedure against an isolated recovery project first.

## Storage recovery

Database recovery alone is not enough.

Restore each object from the backup's `storage/<bucket>/<path>` to the same bucket/path and preserve the MIME type from `manifest.json`. Then verify:

- object count matches the manifest;
- byte size matches;
- SHA-256 matches the manifest;
- `kwinest-documents` remains private;
- an Account A session cannot read an Account B object;
- application document references point to existing objects.

## Migration incident policy

BOEKUNA migrations are forward-only by default.

For a bad migration:

1. Stop further release/deploy activity.
2. Assess whether data was mutated or only schema/code changed.
3. Prefer a new corrective migration when data is intact.
4. Use database restore only when a forward fix cannot safely recover the data.
5. Never manually delete/rename rows in `supabase_migrations.schema_migrations` as an incident shortcut.
6. After recovery, confirm GitHub migration history still exactly matches production.

## Edge Function recovery

Edge Function source lives in Git. If a deployment is bad:

1. Identify the last known-good Git commit/function source.
2. Redeploy that exact function source as a new function version.
3. Do not change secrets during code rollback unless the secret itself caused the incident.
4. Verify auth enforcement and tenant scoping after redeploy.

## Release recovery gate

Before calling a release production-ready:

- [ ] a fresh backup exists;
- [ ] backup manifest/checksums pass;
- [ ] the backup is copied to encrypted off-site storage;
- [ ] last-known-good Render web and processor deploys are identifiable;
- [ ] Supabase migration history equals GitHub;
- [ ] Storage recovery is covered separately from database recovery;
- [ ] a restore drill has succeeded on an isolated recovery environment;
- [ ] post-restore tenant/auth/financial smoke tests pass.

## Known limitation

Supabase scheduled daily backups are guaranteed for Pro, Team and Enterprise plans. Free-tier projects should maintain their own regular off-site exports. Supabase database backups do not contain Storage object bytes.
