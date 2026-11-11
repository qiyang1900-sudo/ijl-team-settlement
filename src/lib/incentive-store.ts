import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTiktokDataset } from "./tiktok-dataset";
import { parseMonthlyPlayerRows } from "./monthly-data";
import { legacyDesignatedForMonth, type LegacyDesignatedSource } from "./legacy-designated";
import {
  buildIncentiveMonth,
  incentiveRuleVersion,
  isIncentiveReviewStale,
  rankingFields,
  previousIncentiveMonth,
  type IncentiveContext,
  type IncentiveReview,
  type IncentiveMonthResult,
  type IncentiveSubmission,
} from "./incentive-score";

export type IncentiveSnapshot = {
  id: string;
  target_month: string;
  source_hash: string;
  result: IncentiveMonthResult;
  created_at: string;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function incentiveHash(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function incentiveRankingHash(result: IncentiveMonthResult) {
  return incentiveHash({
    ruleVersion: result.ruleVersion,
    month: result.month,
    teams: result.teams
      .map((team) => ({
        id: team.teamId,
        eligible: team.eligible,
        values: team.eligible
          ? Object.fromEntries(
              rankingFields.map((field) => [field, team.values[field]]),
            )
          : null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

function scoreSubmission(row: IncentiveSubmission) {
  return {
    team_id: row.team_id,
    target_month: row.target_month,
    status: row.status,
    player_rows: parseMonthlyPlayerRows(row.player_rows).map((player) =>
      Object.fromEntries(
        Object.entries(player).filter(([key]) => !key.startsWith("salary")),
      ),
    ),
    content_entries: row.content_entries ?? [],
    content_skipped: row.content_skipped ?? false,
    club_activity_link: row.club_activity_link ?? null,
  };
}

export function sourceForIncentiveTeam(
  context: IncentiveContext,
  teamId: string,
) {
  const team = context.teams.find((team) => team.id === teamId);
  const submissions = context.submissions
    .filter(
      (row) =>
        row.team_id === teamId ||
        row.target_month === previousIncentiveMonth(context.month),
    )
    .map(scoreSubmission)
    .sort((a, b) =>
      `${a.target_month}:${a.team_id}`.localeCompare(
        `${b.target_month}:${b.team_id}`,
      ),
    );
  const tiktok = context.tiktokRows
    .filter(
      (row) =>
        row.month !== context.month ||
        row.teamShortName.toUpperCase() === team?.short_name?.toUpperCase(),
    )
    .sort((a, b) =>
      `${a.month}:${a.teamShortName}:${a.link}`.localeCompare(
        `${b.month}:${b.teamShortName}:${b.link}`,
      ),
    );
  return {
    ruleVersion: incentiveRuleVersion,
    month: context.month,
    team,
    submissions,
    tiktok,
    issues: context.tiktokIssues,
    designatedSources: context.designatedSources?.filter(
      (source) => source.team.toUpperCase() === team?.short_name?.toUpperCase(),
    ) ?? [],
  };
}

export async function loadIncentiveWorkspace(
  supabase: SupabaseClient,
  month: string,
) {
  const [
    teamResult,
    submissionResult,
    reviewResult,
    snapshotResult,
    legacyResult,
    tiktok,
    designatedResult,
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("id,name,short_name,is_active")
      .order("short_name"),
    supabase
      .from("monthly_data_submissions")
      .select(
        "team_id,target_month,status,player_rows,content_entries,content_skipped,club_activity_link",
      )
      .eq("status", "approved")
      .in("target_month", [month, previousIncentiveMonth(month)])
      .order("team_id"),
    supabase
      .from("team_incentive_reviews")
      .select("team_id,target_month,status,inputs,source_hash,updated_at")
      .eq("target_month", month)
      .order("team_id"),
    supabase
      .from("monthly_incentive_results")
      .select("id,target_month,source_hash,result,created_at")
      .eq("target_month", month)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("team_monthly_scores")
      .select("team_id,finalized_score,finalized_grade,finalized_at")
      .eq("target_month", month)
      .eq("status", "finalized"),
    loadTiktokDataset(supabase),
    /^2026-0[789]$/.test(month)
      ? supabase.from("team_incentive_designated_sources")
          .select("team_id,target_month,sources").eq("target_month", month)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const { data: teamRows, error: teamsError } = teamResult;
  const { data: submissionRows, error: submissionsError } = submissionResult;
  const { data: reviewRows, error: reviewsError } = reviewResult;
  const { data: snapshots, error: snapshotsError } = snapshotResult;
  const { data: legacyRows, error: legacyError } = legacyResult;
  if (teamsError) throw new Error(`战队读取失败：${teamsError.message}`);
  if (submissionsError)
    throw new Error(`月数据读取失败：${submissionsError.message}`);
  if (reviewsError)
    throw new Error(`新版积分保存表读取失败：${reviewsError.message}`);
  if (snapshotsError)
    throw new Error(`月结算记录读取失败：${snapshotsError.message}`);
  if (legacyError) throw new Error(`旧制留档读取失败：${legacyError.message}`);
  if (designatedResult.error)
    throw new Error(`历史指定视频来源读取失败：${designatedResult.error.message}。未按零分继续计算。`);
  const submissions = (submissionRows || []) as IncentiveSubmission[];
  const teams = (teamRows || []).filter(
    (team) =>
      team.is_active ||
      submissions.some(
        (row) => row.team_id === team.id && row.target_month === month,
      ),
  );
  const context: IncentiveContext = {
    month,
    teams,
    submissions,
    designatedSources: legacyDesignatedForMonth(
      month,
      (designatedResult.data || []).flatMap((row) => {
        const team = teams.find((team) => team.id === row.team_id);
        if (!team || row.target_month !== month) return [];
        return (row.sources as LegacyDesignatedSource[]).filter(
          (source) => source.team === team.short_name,
        );
      }),
    ),
    tiktokRows: tiktok.rows.filter((row) =>
      [month, previousIncentiveMonth(month)].includes(row.month),
    ),
    tiktokIssues:
      tiktok.snapshot?.issues.filter((issue) =>
        [month, previousIncentiveMonth(month)].includes(issue.month),
      ) || [],
  };
  const reviews = (reviewRows || []) as IncentiveReview[];
  const hashes = Object.fromEntries(
    teams.map((team) => [
      team.id,
      incentiveHash(sourceForIncentiveTeam(context, team.id)),
    ]),
  );
  const sourceHash = incentiveHash({
    ruleVersion: incentiveRuleVersion,
    month,
    hashes,
    reviews: reviews.map(({ team_id, status, inputs, source_hash }) => ({
      team_id,
      status,
      inputs,
      source_hash,
    })),
  });
  const result = buildIncentiveMonth(context, reviews);
  return {
    context,
    reviews,
    hashes,
    sourceHash,
    result,
    rankingHash: incentiveRankingHash(result),
    snapshot: (snapshots?.[0] as IncentiveSnapshot | undefined) || null,
    legacy: legacyRows || [],
  };
}

export function assertIncentiveFinalizable(
  workspace: Awaited<ReturnType<typeof loadIncentiveWorkspace>>,
) {
  const included = workspace.result.teams.filter(
    (team) => team.hasApprovedData,
  );
  if (!included.length) throw new Error("本月没有审核通过的月数据。");
  const pending = included.filter((team) =>
    workspace.reviews.some(
      (review) =>
        review.team_id === team.teamId &&
        isIncentiveReviewStale(
          review,
          workspace.hashes[team.teamId],
          workspace.rankingHash,
        ),
    ),
  );
  if (pending.length)
    throw new Error(
      `以下战队的人工调整依据已变化，请确认并重新保存调整：${pending.map((team) => team.shortName).join("、")}`,
    );
}
