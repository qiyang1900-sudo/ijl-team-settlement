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
