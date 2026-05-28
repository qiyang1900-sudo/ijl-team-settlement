import type { SupabaseClient } from "@supabase/supabase-js";

export const REMINDER_SUBMISSION_URL =
  "https://team-settlement-system.vercel.app/team/login";

export type DiscordReminderTeam = {
  id: string;
  name: string | null;
  short_name: string | null;
  discord_webhook_url: string | null;
  discord_mention_text: string | null;
};

export type DiscordReminderKind = "monthly_data" | "project_submission";

export type DiscordReminderResult =
  | "sent"
  | "wouldSend"
  | "skipped"
  | "failed"
  | "missingWebhook";

export function buildSubmissionReminderMessage({
  team,
  targetLabel,
  deadlineAt,
  statusLabel,
  now = new Date(),
}: {
  team: DiscordReminderTeam;
  targetLabel: string;
  deadlineAt: string | null;
  statusLabel?: string;
  now?: Date;
}) {
  const mention = formatDiscordMention(team.discord_mention_text);
  const deadline = deadlineAt ? new Date(deadlineAt) : null;
  const hasValidDeadline = deadline && !Number.isNaN(deadline.getTime());
  const isOverdue = hasValidDeadline ? now.getTime() > deadline.getTime() : false;
  const daysUntil = hasValidDeadline ? Math.max(0, getTokyoDayDiff(now, deadline)) : null;
  const targetText = isOverdue ? `**${targetLabel}**` : targetLabel;
  const baseLines = [
    ...(mention ? [mention] : []),
    "お疲れ様です。",
    "提出リマインドBotです。資料提出についてのお知らせです。",
    "",
    `${formatTeamName(team)} の ${targetText} につきまして、`,
    "まだご提出が確認できておりません。",
    "",
    `提出期限：${hasValidDeadline ? formatReminderDateTime(deadlineAt) : "未設定"}`,
    `現在の状態：${statusLabel || "未提出"}`,
    "",
  ];

  if (isOverdue) {
    return [
      ...baseLines,
      "提出期限を過ぎております。",
      "お手数ですが、至急以下の管理ページよりご提出をお願いいたします。",
      REMINDER_SUBMISSION_URL,
    ].join("\n");
  }

  return [
    ...baseLines,
    "お手数ですが、以下の管理ページよりご提出をお願いいたします。",
    REMINDER_SUBMISSION_URL,
    ...(daysUntil === null
      ? []
      : ["", `提出期限まであと ${daysUntil}日 です。`]),
  ].join("\n");
}

export async function sendDiscordReminderOnce({
  supabase,
  team,
  reminderType,
  itemId,
  targetMonth,
  reminderKey,
  content,
  dryRun,
}: {
  supabase: SupabaseClient;
  team: DiscordReminderTeam;
  reminderType: DiscordReminderKind;
  itemId: string;
  targetMonth: string | null;
  reminderKey: string;
  content: string;
  dryRun: boolean;
}): Promise<DiscordReminderResult> {
  if (!team.discord_webhook_url) {
    return "missingWebhook";
  }

  const { data: existing, error: existingError } = await supabase
    .from("discord_reminder_logs")
    .select("id")
    .eq("team_id", team.id)
    .eq("reminder_type", reminderType)
    .eq("item_id", itemId)
    .eq("reminder_key", reminderKey)
    .maybeSingle();

  if (existingError) {
    return "failed";
  }

  if (existing) {
    return "skipped";
  }

  if (dryRun) {
    return "wouldSend";
  }

  let ok = false;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(String(team.discord_webhook_url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    ok = response.ok;
    errorMessage = ok ? null : await response.text();
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Discord webhook request failed.";
  }

  const { error: logError } = await supabase.from("discord_reminder_logs").insert({
    team_id: team.id,
    reminder_type: reminderType,
    item_id: itemId,
    target_month: targetMonth,
    reminder_key: reminderKey,
    message: content,
    delivery_status: ok ? "sent" : "failed",
    error_message: errorMessage,
    sent_at: new Date().toISOString(),
  });

  if (logError) {
    return "failed";
  }

  return ok ? "sent" : "failed";
}

export function formatDiscordMention(value: string | null | undefined) {
  const mention = String(value || "").trim();

  if (!mention) {
    return null;
  }

  if (/^\d{5,}$/.test(mention)) {
    return `<@${mention}>`;
  }

  return mention;
}

export function formatTeamName(team: Pick<DiscordReminderTeam, "short_name" | "name">) {
  return team.short_name || team.name || "戦隊";
}

export function formatReminderDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatReminderMonth(value: string | null) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);

  if (!match) {
    return value || "対象月";
  }

  return `${match[1]}年${match[2]}`;
}

export function getTokyoDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";

  return `${year}-${month}-${day}`;
}

export function getTokyoDayDiff(from: Date, to: Date) {
  return toUtcDayNumber(to) - toUtcDayNumber(from);
}

function toUtcDayNumber(date: Date) {
  const [year, month, day] = getTokyoDateKey(date).split("-").map(Number);

  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}
