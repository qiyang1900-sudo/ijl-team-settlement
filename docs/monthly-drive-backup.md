# Monthly data backups

## Scope

The administrator-only `/admin/backups` page creates versioned `.json.gz`
snapshots of all months, including drafts and submitted/approved records:

- teams (only the non-secret identity fields selected in SQL), league players,
  monthly assignments and deadline settings;
- monthly data, salary fields, activity/content entries and attachment URLs;
- monthly scores, incentive reviews/results, designated-video sources,
  operating reviews and their audit history;
- monthly-related submission change history;
- the currently synchronized TikTok dataset and its source metadata.

These are application data snapshots, not full PostgreSQL disaster-recovery
backups. Original image/file bytes, project invoices, database schema, passwords,
OAuth credentials and Discord webhook secrets are not included. Attachment URLs
alone cannot restore deleted storage objects.

## Installation and authorization

1. For a new installation, run `supabase/monthly-drive-backup.sql`. For an
   existing installation, run `supabase/monthly-drive-backup-v2.sql`. The upgrade
   replaces only the snapshot function; it does not update business records.
2. Configure the existing Google client/picker settings and
   `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_BACKUP_TOKEN_KEY` (32 random bytes,
   base64-encoded), and `CRON_SECRET` in the Production environment. Never commit
   these values. Keep the encryption key stable; replacing it requires a new
   Google backup authorization.
3. Add the exact Google OAuth redirect URI:
   `https://team-settlement-system.vercel.app/api/admin/backups/oauth`.
4. Deploy after saving environment variables. Sign in as administrator, connect
   Google and grant offline `drive.file` access. Check the OAuth application's
   publishing status: a testing-mode refresh token may expire and is unsuitable
   for unattended monthly backups.
5. Select the fixed administrator-only backup folder in Google Picker and enable
   the schedule. The server rejects shared, deleted or unwritable destinations.
6. Run one immediate backup and verify a successful record and Drive file before
   treating the chain as operational.

## Schedule and failure behavior

Vercel calls the backup endpoint daily at 18:00 UTC (03:00 Japan time). The
first invocation of each Japan-calendar month creates that month's snapshot.
Later invocations skip an already completed month, or retry a missing/failed
one. Enabling the schedule mid-month allows the next invocation to catch up.
Successful historical backups are never overwritten. Manual backups create
separate versions and can run while the automatic schedule is paused.

Each claimed run retains a frozen database snapshot and a fixed Drive file ID.
After upload, the server verifies the parent folder, run key and MD5 checksum
before marking the run complete. A missing required table fails the operation
instead of presenting an incomplete archive as successful. The archive contains
a manifest with table and TikTok row counts.

Setting `CRON_SECRET` protects the scheduled endpoints. The existing admin-page
Discord nudge authenticates with the administrator session plus a same-origin
POST, without exposing the cron secret to the browser. An external scheduler,
if separately configured, must supply the same bearer secret.

## Local download and recovery

The administrator can download a fresh current snapshot without Google
configuration. The response is authenticated and marked `private, no-store`.
Downloading or backing up never changes submission, salary or review states.

Recovery is deliberately not a one-click overwrite. First decompress and check
the manifest, identify the affected team/month/fields, compare against current
records and obtain approval for the exact changes. Preserve a new snapshot
before any restoration, retain unaffected data and keep an audit of the source
backup and restored fields.

References: [Google refresh-token expiration](https://developers.google.com/identity/protocols/oauth2/#expiration)
and [Vercel cron authorization](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
