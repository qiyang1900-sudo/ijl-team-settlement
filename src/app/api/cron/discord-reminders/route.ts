import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  formatMonthLabel,
  getMonthlyStatusLabel,
  normalizeMonthlyStatus,
} from "@/lib/monthly-data";

export const dynamic = "force-dynamic";

type TeamRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  discord_webhook_url: string | null;
  discord_mention_text: string | null;
  is_active: boolean | null;
};

type MonthlySettingRow = {
  target_month: string;
  deadline_at: string | null;
};

type MonthlySubmissionRow = {
  team_id: string | null;
  target_month: string | null;
  status: string | null;
};

type ProjectRow = {
  id: string;
  title: string | null;
  deadline_at: string | null;
  status: string | null;
};

type ProjectTeamRow = {
  project_id: string | null;
  team_id: string | null;
  status: string | null;
};

type ReminderSchedule = {
  reminderKey: string;
  label: string;
};

export async function GET(request: Request) {
  return runDiscordReminders(request);
}

export async function POST(request: Request) {
  return runDiscordReminders(request);
}

async function runDiscordReminders(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = isDryRunRequest(url);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: "Supabase 环境变量没有设置成功。" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey);
  const now = new Date();
  const todayKey = getTokyoDateKey(now);
  const [{ data: teams, error: teamError }, monthlyResult, projectResult] =
    await Promise.all([
      supabase
        .from("teams")
        .select(
          "id, name, short_name, discord_webhook_url, discord_mention_text, is_active"
        )
        .eq("is_active", true),
      supabase
        .from("monthly_data_settings")
        .select("target_month, deadline_at")
        .not("deadline_at", "is", null),
      supabase
        .from("projects")
        .select("id, title, deadline_at, status")
        .not("deadline_at", "is", null),
    ]);

  if (teamError) {
    return Response.json({ error: teamError.message }, { status: 500 });
  }

  if (monthlyResult.error) {
    return Response.json(
      {
        error: monthlyResult.error.message,
        hint: "请先执行 supabase/monthly-deadline-discord-reminders.sql。",
      },
      { status: 500 }
    );
  }

  if (projectResult.error) {
    return Response.json({ error: projectResult.error.message }, { status: 500 });
  }

  const safeTeams = ((teams || []) as TeamRow[]).filter(
    (team) => team.discord_webhook_url
  );
  const monthlySettings = (monthlyResult.data || []) as MonthlySettingRow[];
  const projects = ((projectResult.data || []) as ProjectRow[]).filter(
    (project) => project.status !== "archived"
  );
  const [monthlySubmissions, projectTeams] = await Promise.all([
    loadMonthlySubmissions(supabase, monthlySettings),
    loadProjectTeams(supabase, projects),
  ]);
  const monthlyStatus = new Map(
    monthlySubmissions.map((row) => [
      `${row.team_id}:${row.target_month}`,
      String(row.status || ""),
    ])
  );
  const projectStatus = new Map(
    projectTeams.map((row) => [
      `${row.project_id}:${row.team_id}`,
      String(row.status || ""),
    ])
  );
  const projectTeamIds = new Map<string, Set<string>>();

  for (const row of projectTeams) {
    if (!row.project_id || !row.team_id) {
      continue;
    }

    projectTeamIds.set(row.project_id, projectTeamIds.get(row.project_id) || new Set());
    projectTeamIds.get(row.project_id)?.add(row.team_id);
  }

  const results = {
    sent: 0,
    wouldSend: 0,
    skipped: 0,
    failed: 0,
    missingWebhookTeams:
      ((teams || []) as TeamRow[]).filter(
        (team) => team.is_active !== false && !team.discord_webhook_url
      ).length,
  };

  for (const setting of monthlySettings) {
    const schedule = getReminderSchedule(setting.deadline_at, now, todayKey);

    if (!schedule) {
      continue;
    }

    for (const team of safeTeams) {
      const status = monthlyStatus.get(`${team.id}:${setting.target_month}`);

      if (isMonthlySubmissionDone(status)) {
        results.skipped += 1;
        continue;
      }

      const content = buildMonthlyReminderMessage({
        team,
        setting,
        schedule,
        status,
      });
      const result = await sendReminderOnce({
        supabase,
        team,
        reminderType: "monthly_data",
        itemId: setting.target_month,
        targetMonth: setting.target_month,
        reminderKey: schedule.reminderKey,
        content,
        dryRun,
      });

      results[result] += 1;
    }
  }

  for (const project of projects) {
    const schedule = getReminderSchedule(project.deadline_at, now, todayKey);

    if (!schedule) {
      continue;
    }

    const assignedTeamIds = projectTeamIds.get(project.id);
    const reminderTeams = assignedTeamIds
      ? safeTeams.filter((team) => assignedTeamIds.has(team.id))
      : safeTeams;

    for (const team of reminderTeams) {
      const status = projectStatus.get(`${project.id}:${team.id}`);

      if (isProjectSubmissionDone(status)) {
        results.skipped += 1;
        continue;
      }

      const content = buildProjectReminderMessage({
        team,
        project,
        schedule,
        status,
      });
      const result = await sendReminderOnce({
        supabase,
        team,
        reminderType: "project_submission",
        itemId: project.id,
        targetMonth: null,
        reminderKey: schedule.reminderKey,
        content,
        dryRun,
      });

      results[result] += 1;
    }
  }

  return Response.json({ ok: true, dryRun, today: todayKey, ...results });
}

async function loadMonthlySubmissions(
  supabase: SupabaseClient,
  settings: MonthlySettingRow[]
) {
  if (settings.length === 0) {
    return [] as MonthlySubmissionRow[];
  }

  const { data } = await supabase
    .from("monthly_data_submissions")
    .select("team_id, target_month, status")
    .in(
      "target_month",
      settings.map((setting) => setting.target_month)
    );

  return (data || []) as MonthlySubmissionRow[];
}

async function loadProjectTeams(
  supabase: SupabaseClient,
  projects: ProjectRow[]
) {
  if (projects.length === 0) {
    return [] as ProjectTeamRow[];
  }

  const { data } = await supabase
    .from("project_teams")
    .select("project_id, team_id, status")
    .in(
      "project_id",
      projects.map((project) => project.id)
    );

  return (data || []) as ProjectTeamRow[];
}

async function sendReminderOnce({
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
  team: TeamRow;
  reminderType: string;
  itemId: string;
  targetMonth: string | null;
  reminderKey: string;
  content: string;
  dryRun: boolean;
}): Promise<"sent" | "wouldSend" | "skipped" | "failed"> {
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

function buildMonthlyReminderMessage({
  team,
  setting,
  schedule,
  status,
}: {
  team: TeamRow;
  setting: MonthlySettingRow;
  schedule: ReminderSchedule;
  status?: string;
}) {
  const mention = team.discord_mention_text?.trim();
  const statusText = status ? getMonthlyStatusLabel(status) : "未提出";

  return [
    mention,
    `【月データ提出リマインド】${formatTeamName(team)} ${formatMonthLabel(
      setting.target_month
    )} の月データ提出が必要です。`,
    `提出期限：${formatDateTime(setting.deadline_at)}`,
    `現在の状態：${statusText}`,
    `対象：X、YouTube、選手給与、クラブ活動`,
    schedule.label,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildProjectReminderMessage({
  team,
  project,
  schedule,
  status,
}: {
  team: TeamRow;
  project: ProjectRow;
  schedule: ReminderSchedule;
  status?: string;
}) {
  const mention = team.discord_mention_text?.trim();
  const statusText = status ? formatProjectStatus(status) : "未提交";

  return [
    mention,
    `【提出物リマインド】${formatTeamName(team)}「${
      project.title || "提出物"
    }」の提出が必要です。`,
    `提出期限：${formatDateTime(project.deadline_at)}`,
    `現在の状態：${statusText}`,
    schedule.label,
  ]
    .filter(Boolean)
    .join("\n");
}

function getReminderSchedule(
  deadlineAt: string | null,
  now: Date,
  todayKey: string
): ReminderSchedule | null {
  if (!deadlineAt) {
    return null;
  }

  const deadline = new Date(deadlineAt);

  if (Number.isNaN(deadline.getTime())) {
    return null;
  }

  const daysUntil = getTokyoDayDiff(now, deadline);

  if (now.getTime() > deadline.getTime()) {
    return {
      reminderKey: `overdue-${todayKey}`,
      label: "提出期限を過ぎています。確認できるまで毎日リマインドします。",
    };
  }

  if (daysUntil === 0) {
    return {
      reminderKey: `due-today-${todayKey}`,
      label: "提出期限は本日です。",
    };
  }

  if (daysUntil === 7) {
    return {
      reminderKey: "before-7",
      label: "提出期限の1週間前です。",
    };
  }

  if (daysUntil >= 1 && daysUntil <= 3) {
    return {
      reminderKey: `before-${daysUntil}`,
      label: `提出期限の${daysUntil}日前です。`,
    };
  }

  return null;
}

function isMonthlySubmissionDone(status?: string) {
  const normalized = normalizeMonthlyStatus(status);

  return (
    normalized === "submitted" ||
    normalized === "reviewing" ||
    normalized === "approved"
  );
}

function isProjectSubmissionDone(status?: string) {
  return ["submitted", "reviewing", "approved"].includes(String(status || ""));
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return true;
  }

  const url = new URL(request.url);

  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    url.searchParams.get("secret") === secret
  );
}

function isDryRunRequest(url: URL) {
  const value = (url.searchParams.get("dry_run") || url.searchParams.get("dryRun") || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

function formatTeamName(team: TeamRow) {
  return team.short_name || team.name || "戦隊";
}

function formatProjectStatus(status: string) {
  const labels: Record<string, string> = {
    not_submitted: "未提交",
    draft: "草稿",
    submitted: "已提交",
    reviewing: "审核中",
    returned: "已驳回需补充",
    approved: "已通过",
  };

  return labels[status] || status || "未提交";
}

function formatDateTime(value: string | null) {
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

function getTokyoDateKey(date: Date) {
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

function getTokyoDayDiff(from: Date, to: Date) {
  return toUtcDayNumber(to) - toUtcDayNumber(from);
}

function toUtcDayNumber(date: Date) {
  const [year, month, day] = getTokyoDateKey(date).split("-").map(Number);

  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}
