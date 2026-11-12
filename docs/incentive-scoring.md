# Monthly incentive scoring

The administrator's `/admin/team-scores` page computes incentives from July
2026 onward. The existing engine and `team_monthly_scores` records remain
unchanged. A + B + C, D and placement prizes start in July 2026 in this
calculator. New work claims collected on the
website start with October data. Older claims may be entered by an administrator
from the original records without resubmitting monthly data.

## Rules

- A: YouTube 30, Shorts + TikTok 15, official X 15. YouTube deducts 10 for
  each failed group (official videos 2, designated long videos 4 including 2
  game-event videos, designated Shorts 8 including 4 game-event Shorts, streams
  20), capped at 30. The official videos may overlap designated videos.
  Shorts + TT total below 5 deducts 10. Official X posts below 15 deducts 10;
  the default tag portion retains 5. Streams are assumed archived.
  Known YT posts plus valid TT account posts can prove the five-post minimum
  even when the complete TT total is unavailable. Flagged accounts' preserved
  rows remain excluded, and the partial count is not used for B rankings.
  Explicit YouTube `/shorts/` URLs are classified as Shorts when reading claims;
  ambiguous watch/youtu.be links retain their selected format. Reading does not
  rewrite submissions or backfill missing historical designated works.
- A >= 45 is required for B, C and final ranking, not D. Only approved monthly
  submissions participate. Current retirement status never filters their rows;
  coaches participate and explicit manager rows do not.
- B: X 2 for one top-five criterion or 5 for both; YouTube 5 each for three
  criteria; Shorts + TT 3 for each criterion or 10 for all three. Excess
  designated long/short videos earn 5/3 respectively, jointly capped at 20.
  Total B maximum is 50. Short views/likes use member accounts; reposts include
  official accounts. YouTube likes refer only to Shorts.
- Ranking uses competition ties (1, 1, 3) among eligible teams only. Ties at
  fifth receive the same criterion points. Zero never ranks. Missing values and
  source errors are unknown, never implicit zero.
- C: per-account growth is compared to the previous month with strict greater-
  than thresholds (member 600; official X/TT 300 and YT 200); X/TT earn 2,
  YT earns 3 per account. Popular Shorts (>2,000 likes) and original X posts
  (>3,000 likes) earn 2 per account, capped at 10 per category. Official popular
  videos (>40,000 views) earn 2 per unique work, capped at 10. Online >3,000
  earns 2/event; offline >100 earns 5/event; qualified tournaments earn
  floor(concurrent viewers / 1,000) * 5 per event. Growth and events are uncapped.
- D: all teams with approved monthly submissions participate, independently
  of A scores, ABC totals or placement. Individual ordinary YT views and posts
  each have a 50,000 JPY pool;
  coaches qualify and the same person can win both. Qualifying clubs with a
  single member/coach Short >1M or ordinary YT video >200K split 240,000 JPY
  equally. Official accounts never qualify for D, including this bonus. The
  separate C official-video award remains unchanged.
- Placement pools: 600,000 / 400,000 / 300,000 / 200,000 / 160,000 JPY.
  Ties share the occupied places' pools, limited to the first five places.
  Missing places/awards are unpaid. Each share is floored to whole yen; no
  remainder is arbitrarily reassigned. Total monthly maximum is 2,000,000 JPY.

## Review and persistence

Apply `supabase/incentive-scoring-v2.sql` before deployment. The tables have RLS,
no anon/authenticated privileges, and server-only access. The review table permits
insert/update; the monthly result table is append-only for the service role.
Old finalized scores remain read-only archives and are not migrated or overwritten.

Team drafts contain optional component-score overrides, legacy count overrides,
D-only personal corrections and a single review note. All adjustments live in
one optional review window; the A/B/C/D details are read-only. Overrides require
provenance in the note. Component caps are enforced, and changing A eligibility
recalculates every eligible team's B ranks. Blank override inputs restore
automatic values; explicit 0 is retained. Monthly approval already covers work
claims: scoring does not require another per-team subjective review.

Missing combined ranking counts remain unknown and are excluded from that
criterion, without prorating the remaining criteria. Growth counts every account
with a valid baseline independently; missing accounts do not erase known growth.
Previously preserved TT rows flagged by import issues remain excluded.

Missing inputs never block other scores, rankings, prizes or settlement. A
condition with insufficient evidence is not counted as achieved and uses the
ordinary deduction (with each section floor and default X tag points retained).
B/C/D missing inputs earn no award for that input. Raw nulls are never rewritten
as zero. Details distinguish unclaimed optional works/events, incomplete claims
or metrics, historical uncollected fields, and complete below-threshold data.
Only missing fields are marked pending, never the team's calculated total.

A+B+C calculation does not depend on D evidence. D's views, posts and popular
awards are independent: a member missing posts can still win by known views.
Each team's review stores a fingerprint of the relevant source data and uses an
optimistic update version. Salary-only edits are excluded from the fingerprint.
Changed sources require existing manual corrections to be reconfirmed and saved,
without erasing them. Automatic results need no per-team confirmation. Browser
errors preserve unsaved input; leaving with unsaved edits raises a browser warning.
Manual B ranking-score corrections additionally track the league-wide eligibility
and ranking inputs, so changes in another team's data cannot silently leave an
obsolete ranking correction finalized. The server captures the post-adjustment
ranking fingerprint, including any simultaneous A eligibility change.

Monthly finalization re-reads the server data, checks that any manual corrections
use fresh source data, and requires explicit confirmation of the participation
scope and omitted items, then stores
the full result and review inputs. Repeating the same finalization is idempotent;
changed data creates a new snapshot. This calculates awards only: it does not
send Discord notifications, approve submissions or initiate payments.

## Verification

Run `node --test tests/*.test.mjs`, TypeScript checking, ESLint, and the Next
production build. The incentive tests cover source parsing, eligibility, caps,
ties, zero/missing data, date boundaries, independent D calculations, coach and
historical membership, stale reviews, API authorization and append-only results.
Use fixtures for interactive writes; production verification is read-only.
