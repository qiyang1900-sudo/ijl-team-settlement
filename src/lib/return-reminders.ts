import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildReturnReminderMessage,
  formatReminderMonth,
  sendDiscordReminderOnce,
  type DiscordReminderKind,
  type DiscordReminderResult,
  type DiscordReminderTeam,
} from "@/lib/discord-reminders";

type MonthlyReturnReminderRow = {
  id: string;
  target_month: string | null;
  teams: DiscordReminderTeam | DiscordReminderTeam[] | null;
};

type ProjectReturnReminderRow = {
  id: string;
  projects:
    | {
        id: string | null;
        title: string | null;
      }
    | Array<{
        id: string | null;
        title: string | null;
      }>
    | null;
  teams: DiscordReminderTeam | DiscordReminderTeam[] | null;
};

export async function sendMonthlyReturnReminder({
  supabase,
  submissionId,
  reviewKind,
  returnReason,
}: {
  supabase: SupabaseClient;
  submissionId: string;
  reviewKind: "monthly" | "salary";
  returnReason?: string | null;
}): Promise<DiscordReminderResult | "notFound"> {
  try {
    const { data, error } = await supabase
      .from("monthly_data_submissions")
      .select(
        `
        id,
        target_month,
        teams (
          id,
          name,
          short_name,
          discord_webhook_url,
          discord_mention_text
        )
      `
      )
      .eq("id", submissionId)
      .maybeSingle();

    if (error || !data) {
      return error ? "failed" : "notFound";
    }

    const row = data as MonthlyReturnReminderRow;
    const team = pickRelation(row.teams);

    if (!team) {
      return "notFound";
    }

    const targetLabel =
      reviewKind === "salary"
        ? formatMonthlyTargetLabel(row.target_month, "給与スクリーンショット")
        : formatMonthlyTargetLabel(row.target_month, "月データ");

    return sendReturnReminder({
      supabase,
      team,
      reminderType:
        reviewKind === "salary"
          ? "monthly_salary_screenshot_returned"
          : "monthly_data_returned",
      itemId: row.target_month || row.id,
      targetMonth: row.target_month,
      targetLabel,
      returnReason,
    });
  } catch {
    return "failed";
  }
}

export async function sendProjectReturnReminder({
  supabase,
  projectTeamId,
  returnReason,
}: {
  supabase: SupabaseClient;
  projectTeamId: string;
  returnReason?: string | null;
}): Promise<DiscordReminderResult | "notFound"> {
  try {
    const { data, error } = await supabase
      .from("project_teams")
      .select(
        `
        id,
        projects (
          id,
          title
        ),
        teams (
          id,
          name,
          short_name,
          discord_webhook_url,
          discord_mention_text
        )
      `
      )
      .eq("id", projectTeamId)
      .maybeSingle();

    if (error || !data) {
      return error ? "failed" : "notFound";
    }

    const row = data as ProjectReturnReminderRow;
    const team = pickRelation(row.teams);
    const project = pickRelation(row.projects);

    if (!team) {
      return "notFound";
    }

    return sendReturnReminder({
      supabase,
      team,
      reminderType: "project_submission_returned",
      itemId: project?.id || row.id,
      targetMonth: null,
      targetLabel: project?.title || "提出物",
      returnReason,
    });
  } catch {
    return "failed";
  }
}

async function sendReturnReminder({
  supabase,
  team,
  reminderType,
  itemId,
  targetMonth,
  targetLabel,
  returnReason,
}: {
  supabase: SupabaseClient;
  team: DiscordReminderTeam;
  reminderType: DiscordReminderKind;
  itemId: string;
  targetMonth: string | null;
  targetLabel: string;
  returnReason?: string | null;
}) {
  return sendDiscordReminderOnce({
    supabase,
    team,
    reminderType,
    itemId,
    targetMonth,
    reminderKey: `returned-${Date.now()}`,
    content: buildReturnReminderMessage({
      team,
      targetLabel,
      returnReason,
    }),
    dryRun: false,
    skipSameDaySentCheck: true,
  });
}

function formatMonthlyTargetLabel(targetMonth: string | null, suffix: string) {
  if (!targetMonth) {
    return suffix;
  }

  return `${formatReminderMonth(targetMonth)}月${suffix}`;
}

function pickRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}
