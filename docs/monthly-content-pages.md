# Monthly submission pages

The monthly form now has two mounted pages: SNS/activity data and designated/popular work claims. Both pages share one draft, submission status and next-month-10th deadline. Salary remains a separate form and review workflow.

## Rollout

Apply `supabase/monthly-content-entries.sql` before deploying. This additive migration adds JSON work claims and an explicit empty-page confirmation flag; it does not change existing records, RLS or grants. No new scoring or historical score recalculation is enabled by this change.

## Submission behavior

- Empty second page: monthly submission requires a dialog confirmation. Return opens page two without submitting; skip submits with `content_skipped=true`.
- Draft and salary actions never show that dialog. Partial work rows can be saved as drafts, but must be completed or removed before review submission.
- One work can claim multiple categories. Canonical YouTube/X duplicates are rejected; TikTok redirect aliases still require human review.
- Both pages stay mounted while switching. Native form resets are prevented, including on failed actions. File inputs are cleared only after their own form successfully saves; saved image metadata is returned by the server.
- Unsent text is cached per team/month in the browser. Unsaved image files cannot survive a browser reload and must be selected again; saved images are retained on the server.
- Monthly saves preserve salary fields. Salary saves preserve monthly SNS, activity and content fields. Stale concurrent writes are rejected with an inline error.
- Work claims and opted-in popular activities are visible in the administrator review details with a human-review notice; existing scores and reminder rules are unchanged.

## Verification

Run `node --test tests/*.test.mjs`, TypeScript and targeted ESLint checks. Browser checks use a temporary local-only form fixture without any production writes or notifications.

## Draft Persistence

Monthly and salary forms carry independent content revisions. An old tab cannot
overwrite newer server data; the existing write-time `updated_at` guard also
protects against changes during image uploads. No database migration is needed.

Browser drafts without matching revisions (including pre-update drafts) are
never restored automatically. The page displays server data and asks the team
to choose whether to use it or explicitly restore local inputs. Do not clear
browser storage to troubleshoot unsent work. Files not uploaded yet still need
to be selected again after a reload; already saved club images are retained by
activity ID until replaced, or until the activity is explicitly removed.

A successful save uses the database's returned snapshot and updates local
storage immediately, before refreshing. Failed saves keep the form and selected
files. Draft saves preserve the administrator's return reason. Monthly and
salary saves continue to preserve each other's data and approval states.
