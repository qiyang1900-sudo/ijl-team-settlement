import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscordReminderKind } from "./discord-reminders";
import { normalizeProjectSubmissionStatus } from "./status-labels";

type ReminderDecision = {
  outcome: "send" | "skip" | "error";
  status: string | null;
  reason: string;
  error?: string;
};

export function getSubmissionReminderDecision(
  rawStatus: string | null | undefined,
  options: { submittedAt?: string | null; returnedOnly?: boolean } = {}
): ReminderDecision {
  const status = normalizeProjectSubmissionStatus(rawStatus);
  if (["submitted", "resubmitted", "pending", "pending_review", "reviewing", "approved"].includes(status)) {
    return { outcome: "skip", status, reason: "already_submitted" };
  }
  if (!["not_submitted", "draft", "returned"].includes(status)) {
    return { outcome: "error", status: status || null, reason: "unknown_status" };
  }
  if (options.returnedOnly && status !== "returned") {
    return { outcome: "skip", status, reason: "no_longer_returned" };
  }
  if (options.submittedAt && status !== "returned") {
    return { outcome: "skip", status, reason: "submission_timestamp_present" };
  }
  return { outcome: "send", status, reason: "submission_required" };
}

export function isSubmissionReminderTarget(status: string | null | undefined) {
  return getSubmissionReminderDecision(status).outcome === "send";
}

export function isProjectReminderTarget(row: { status: string | null; submitted_at?: string | null }) {
  return getSubmissionReminderDecision(row.status, { submittedAt: row.submitted_at }).outcome === "send";
}

export function getSubmissionReminderStatusLabel(status: string) {
  return status === "returned" ? "差し戻し（再提出待ち）" : "未提出";
}

export async function readReminderSubmissionState({
  supabase, teamId, reminderType, itemId, targetMonth,
}: {
  supabase: SupabaseClient;
  teamId: string;
  reminderType: DiscordReminderKind;
  itemId: string;
  targetMonth: string | null;
}): Promise<ReminderDecision> {
  try {
    const returnedOnly = reminderType.endsWith("_returned");
    if (reminderType.startsWith("project_submission")) {
      const { data, error } = await supabase.from("project_teams")
        .select("status, submitted_at, projects(status)")
        .eq("project_id", itemId).eq("team_id", teamId).maybeSingle();
      if (error) throw error;
      if (!data) return { outcome: "skip", status: null, reason: "project_not_assigned" };
      const project = Array.isArray(data.projects) ? data.projects[0] : data.projects;
      if (!project) return { outcome: "error", status: data.status, reason: "project_missing" };
      if (project.status === "archived") return { outcome: "skip", status: data.status, reason: "project_archived" };
      return getSubmissionReminderDecision(data.status, { submittedAt: data.submitted_at, returnedOnly });
    }

    if (!targetMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth) || targetMonth < "2026-06") {
      return { outcome: "skip", status: null, reason: "ineligible_month" };
    }
    const { data, error } = await supabase.from("monthly_data_submissions")
      .select("status, salary_status")
      .eq("team_id", teamId).eq("target_month", targetMonth).maybeSingle();
    if (error) throw error;
    // A successful empty lookup is an unsubmitted month; a failed lookup never is.
    const status = !data ? "not_submitted"
      : reminderType.startsWith("monthly_salary_screenshot") ? data.salary_status : data.status;
    return getSubmissionReminderDecision(status, { returnedOnly });
  } catch (error) {
    return {
      outcome: "error", status: null, reason: "status_read_failed",
      error: error instanceof Error ? error.message : String((error as { message?: string })?.message || error),
    };
  }
}
