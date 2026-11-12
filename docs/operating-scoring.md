# Operating Policy Scores

Independent of content incentives (ABCD), from 2026-10 only. Never reads or writes incentive reviews, incentive settlements, salary status or monthly submission status.

- Source: submitted, reviewing or approved monthly data; drafts/returned/missing records are visible but not scored.
- Player management 15 and subjective team management 15 default full. Salary compliance includes the 40% prize-retention limit; no automatic salary approval.
- Fan events 10: at least one current-month club activity with a link or saved image; merchandise-only events must be deducted in manual review. X per-player event totals are not unique club events.
- YouTube: official regular videos >=2 (+10); member/coach regular videos >=4 including >=2 designated (+10); member/coach Shorts >=6 including >=4 designated (+10); all-account streams <20 (-10); floor 0, max30. Designated videos are subsets, never added again to monthly totals. Evidence URLs deduplicated; current-month and owner checked.
- TikTok: account setup defaults 5; TT-only monthly posts >=5 (+10). YT Shorts excluded. Errors/missing data remain warnings, not stored zeros; valid known counts can establish the minimum.
- X: base5 + official posts>=15 (+10); noncompliant profiles (-5) and required reposts (-10) are manual. Floor0, max15. No 170-post or 4-million-impression rule.
- Quality, game relevance, duration, tags and retained live archives default compliant, with one manual review dialog.
- Grade: S>=90, A>=85, B>=75, C>=65, otherwise D.

Apply `supabase/operating-scores.sql` before deployment. Both tables are private (RLS, service-role only). Each draft/review save atomically appends a revision via a trigger; there is no service-role UPDATE/DELETE grant on history. Latest record includes the computed score/grade and source revision. Writes validate source hash and use compare-and-swap on updated_at. A changed source is visibly flagged for review; old saved results remain available and are not silently relabeled reviewed.

Manual values must be integer scores within each item's limits. A note is mandatory for corrections. The unified dialog preserves inputs on API/network failure and prevents accidental dismissal of dirty changes. Score confirmation does not approve or reject the team's monthly or salary submission.
