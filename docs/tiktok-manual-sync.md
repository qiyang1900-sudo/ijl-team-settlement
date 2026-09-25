# TikTok Manual Sync

The administrator home and dashboard expose the same manual sync control. GET only
reads the last receipt; POST reads the fixed Google workbook and publishes a new
snapshot. No cron, timer or page-view import is installed.

Source: https://docs.google.com/spreadsheets/d/17TXWAXGOKqJis0WgxVh-2ayU5d2-Wi5m6TA5-pdzkjw/edit

The Google link currently permits anonymous reading (and editing). This feature
does not change sharing permissions or request Google API scopes. If link reading
is revoked, synchronization fails with an explicit permission message and keeps
the prior snapshot. The app cannot reuse the Codex Google connector's permission.

## Import Rules

- Yearless September-December tabs are 2025; January-August tabs are 2026.
  New tabs should use an explicit year, e.g. `26年9月`, `2027年1月`.
- Ignore `月份数据`: it lacks account/team detail and is not a second data source.
- Columns are matched by headers, including the September layout with player names.
- Accounts are keyed by month, team and canonical TikTok link, never row number.
  Official accounts are recognized by their known links, not position.
- Only whole, nonnegative integer metrics are imported. True zero is retained.
  Blank, dash, spreadsheet error or malformed number skips the entire account row.
- Skipped rows, absent accounts and empty months do not delete or zero previous
  values. Corrections with valid numbers replace matching records, never append.
  Deliberate removal of historical records is a separate administrative operation.
- Repeated account keys, unknown teams, incomplete team blocks and changed headers
  fail the entire import. The previous snapshot remains active.
- The UI lists source tab/row/account and reason for every skipped row. Reporting
  views show a warning for the affected months and team.

## Persistence and Access

The service-role-only server code creates a private `tiktok-sync` Storage bucket
on first sync. No public bucket or browser-role policy is created. Do not add
public or authenticated upload/download policies for this bucket.

`current.json` is the live snapshot. Before publishing it, each run archives the
previous dataset and the new receipt under `history/<run-id>[-before].json`.
Only one atomic replacement of `current.json` activates the result. All league,
team, score and league Excel consumers use this same snapshot; until first sync,
they use the existing historical seed. Read failures after sync are not silently
replaced with the seed.

`sync-lock.json` is inserted without upsert to exclude concurrent runs. It is
released in `finally`. If the hosting platform kills a process, an administrator
must first verify no sync request remains active, inspect `current.json` and the
history receipt, and then remove the stale lock through privileged Storage access.
An active lock is never automatically stolen. A lost HTTP response can be checked
by reloading the home page and reading the last successful sync time.

Only authenticated administrators may read the sync receipt or invoke POST. POST
also requires same-origin. The server accepts no arbitrary workbook URL or client
data payload. Source download is time/size bounded (45 seconds, 5 MiB).

Sync does not write monthly submissions, player rosters, approval states, review
overrides, salary records or reminders. Automatic score baselines read refreshed
TT posts alongside approved YT Shorts; saved manual overrides remain in place.

## Verification

`node --test tests/tiktok-sync.test.mjs tests/league-platform-summary.test.mjs`

Optionally set `TIKTOK_SOURCE_FILE` to a local export of the source workbook for
a read-only reconciliation. Tests never call the live source or database.
