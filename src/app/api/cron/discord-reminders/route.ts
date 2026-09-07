import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  buildMonthlyReminderSettings,
  isMonthlyReminderEligibleMonth,
} from "@/lib/monthly-data";
import { getSubmissionReminderStatusLabel } from "@/lib/submission-reminder-policy";
import {
  buildSubmissionReminderMessage,
  formatReminderMonth,
  getTokyoDateKey,
  getTokyoDayDiff,
  isTokyoWeekend,
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
  salary_screenshot_deadline_at?: string | null;
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
  return handleDiscordReminders(request);
}

export async function POST(request: Request) {
  return handleDiscordReminders(request);
}

async function handleDiscordReminders(request: Request) {
  try {
    return await runDiscordReminders(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discord 提醒读取失败";
    console.error("Discord reminder batch stopped", { error: message });
    return Response.json({ error: message }, { status: 500 });
  }
}

async function runDiscordReminders(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = isDryRunRequest(url);
  const source = url.searchParams.get("source") === "admin_reviews" ? "admin_page_auto" : "scheduled";
  const now = new Date();
  const todayKey = getTokyoDateKey(now);

  // Apply the rest-day rule only to automatic reminders, including admin-page nudges.
  if (isTokyoWeekend(now)) {
    return Response.json({
      ok: true,
      dryRun,
      today: todayKey,
      skipReason: "weekend",
      sent: 0,
      wouldSend: 0,
      skipped: 0,
      failed: 0,
      missingWebhook: 0,
      missingWebhookTeams: 0,
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: "Supabase 环境变量没有设置成功。" },
      { status: 500 }
    );
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey, serviceRoleKey);
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
        .select("*"),
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
  const monthlySettings = buildMonthlyReminderSettings(
    (monthlyResult.data || []) as MonthlySettingRow[],
    now
  ).filter((setting) => isMonthlyReminderEligibleMonth(setting.target_month));
  const projects = ((projectResult.data || []) as ProjectRow[]).filter(
    (project) => project.status !== "archived"
  );
  const projectTeams = await loadProjectTeams(supabase, projects);
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
      const content = (status: string) => buildMonthlyReminderMessage({
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
        source,
      });

      results[result] += 1;
    }
  }

  for (const setting of monthlySettings) {
    const schedule = getReminderSchedule(
      setting.salary_screenshot_deadline_at || null,
      now,
      todayKey
    );

    if (!schedule) {
      continue;
    }

    for (const team of safeTeams) {
      const content = (status: string) => buildSalaryScreenshotReminderMessage({
        team,
        setting,
        status,
      });
      const result = await sendDiscordReminderOnce({
        supabase,
        team,
        reminderType: "monthly_salary_screenshot",
        itemId: setting.target_month,
        targetMonth: setting.target_month,
        reminderKey: schedule.reminderKey,
        content,
        dryRun,
        source,
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
      : [];

    for (const team of reminderTeams) {
      const content = (status: string) => buildProjectReminderMessage({
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
        source,
      });

      results[result] += 1;
    }
  }

  return Response.json({ ok: true, dryRun, today: todayKey, ...results });
}

async function loadProjectTeams(
  supabase: SupabaseClient,
  projects: ProjectRow[]
) {
  if (projects.length === 0) {
    return [] as ProjectTeamRow[];
  }

  const { data, error } = await supabase
    .from("project_teams")
    .select("project_id, team_id, status")
    .in(
      "project_id",
      projects.map((project) => project.id)
    );

  if (error) throw new Error(`项目提交状态读取失败：${error.message}`);
  return (data || []) as ProjectTeamRow[];
}

function buildMonthlyReminderMessage({
  team,
  setting,
  status,
}: {
  team: TeamRow;
  setting: MonthlySettingRow;
  status: string;
}) {
  const statusText = getSubmissionReminderStatusLabel(status);

  return buildSubmissionReminderMessage({
    team,
    targetLabel: `${formatReminderMonth(setting.target_month)}月データ`,
    deadlineAt: setting.deadline_at,
    statusLabel: statusText,
  });
}

function buildSalaryScreenshotReminderMessage({
  team,
  setting,
  status,
}: {
  team: TeamRow;
  setting: MonthlySettingRow;
  status: string;
}) {
  const statusText = getSubmissionReminderStatusLabel(status);

  return buildSubmissionReminderMessage({
    team,
    targetLabel: `${formatReminderMonth(setting.target_month)}月給与スクリーンショット`,
    deadlineAt: setting.salary_screenshot_deadline_at || null,
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
  status: string;
}) {
  const statusText = getSubmissionReminderStatusLabel(status);

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

  if (daysUntil === 3 || daysUntil === 1) {
    return {
      reminderKey: `before-${daysUntil}`,
      label: `提出期限の${daysUntil}日前です。`,
    };
  }

  return null;
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
