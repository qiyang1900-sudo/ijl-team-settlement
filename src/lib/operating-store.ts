import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { incentiveHash } from "./incentive-store";
import { parseMonthlyPlayerRows } from "./monthly-data";
import { loadTiktokDataset } from "./tiktok-dataset";
import { calculateOperatingTeam, operatingRuleVersion, validOperatingMonth, type OperatingContext, type OperatingReview, type OperatingSubmission } from "./operating-score";

export function operatingTeamSource(context: OperatingContext, teamId: string) {
  const team = context.teams.find((team) => team.id === teamId);
  // Salary review is independent. Only score-relevant SNS fields affect this revision.
  return {
    rule: operatingRuleVersion, month: context.month, team,
    submissions: context.submissions.filter((row) => row.team_id === teamId).map((row) => ({
      ...row, player_rows: parseMonthlyPlayerRows(row.player_rows).map((player) =>
        Object.fromEntries(Object.entries(player).filter(([key]) => !key.startsWith("salary")))),
    })),
    tt: context.tiktokRows.filter((row) => row.teamShortName.toUpperCase() === team?.short_name.toUpperCase())
      .map((row) => ({ accountName: row.accountName, link: row.link, postCount: row.postCount })),
    issues: context.tiktokIssues.filter((issue) => !issue.metric && issue.team.toUpperCase() === team?.short_name.toUpperCase()),
  };
}
export async function loadOperatingWorkspace(supabase: SupabaseClient, month: string) {
  if (!validOperatingMonth(month)) throw new Error("運営方針评分从2026年10月开始。");
  const [teams, submissions, reviews, tiktok] = await Promise.all([
    supabase.from("teams").select("id,name,short_name,is_active").order("short_name"),
    supabase.from("monthly_data_submissions").select("team_id,target_month,status,player_rows,content_entries,club_activity_link,club_activity_image_url,club_activity_image_name")
      .eq("target_month", month).order("team_id"),
    supabase.from("team_operating_reviews").select("team_id,target_month,status,inputs,source_hash,updated_at,result").eq("target_month", month).order("team_id"),
    loadTiktokDataset(supabase),
  ]);
  if (teams.error) throw new Error(`战队读取失败：${teams.error.message}`);
  if (submissions.error) throw new Error(`月数据读取失败：${submissions.error.message}`);
  if (reviews.error) throw new Error(`運営方針评分记录读取失败：${reviews.error.message}`);
  const context: OperatingContext = {
    month, teams: (teams.data ?? []).filter((team) => team.is_active || submissions.data?.some((row) => row.team_id === team.id)),
    submissions: (submissions.data ?? []) as OperatingSubmission[],
    tiktokRows: tiktok.rows.filter((row) => row.month === month),
    tiktokIssues: tiktok.snapshot?.issues.filter((issue) => issue.month === month) ?? [],
  };
  const records = (reviews.data ?? []) as OperatingReview[];
  const hashes = Object.fromEntries(context.teams.map((team) => [team.id, incentiveHash(operatingTeamSource(context, team.id))]));
  return {
    hashes, reviews: records, context,
    results: context.teams.map((team) => calculateOperatingTeam(team, context, records.find((review) => review.team_id === team.id)?.inputs)),
  };
}
