import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMonthlyStatusLabel, normalizeMonthlyStatus } from "@/lib/monthly-data";
import {
  buildSubmissionReminderMessage,
  formatReminderMonth,
  getTokyoDateKey,
  getTokyoDayDiff,
  sendDiscordReminderOnce,
} from "@/lib/discord-reminders";

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
    missingWebhook: 0,
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
        status,
      });
      const result = await sendDiscordReminderOnce({
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
        status,
      });
      const result = await sendDiscordReminderOnce({
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

function buildMonthlyReminderMessage({
  team,
  setting,
  status,
}: {
  team: TeamRow;
  setting: MonthlySettingRow;
  status?: string;
}) {
  const statusText = status ? getMonthlyStatusLabel(status) : "未提出";

  return buildSubmissionReminderMessage({
    team,
    targetLabel: `${formatReminderMonth(setting.target_month)}月データ`,
    deadlineAt: setting.deadline_at,
    statusLabel: statusText,
  });
}

function buildProjectReminderMessage({
  team,
  project,
  status,
}: {
  team: TeamRow;
  project: ProjectRow;
  status?: string;
}) {
  const statusText = formatProjectReminderStatus(status);

  return buildSubmissionReminderMessage({
    team,
    targetLabel: project.title || "提出物",
    deadlineAt: project.deadline_at,
    statusLabel: statusText,
  });
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
  return [
    "submitted",
    "reviewing",
    "approved",
    "resubmitted",
    "pending",
    "pending_review",
  ].includes(String(status || ""));
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

function formatProjectReminderStatus(status?: string) {
  const labels: Record<string, string> = {
    not_submitted: "未提出",
    draft: "未提出",
    submitted: "提出済み",
    reviewing: "審査中",
    returned: "差し戻し（再提出待ち）",
    resubmitted: "再提出済み",
    approved: "承認済み",
  };

  return labels[String(status || "")] || "未提出";
}
