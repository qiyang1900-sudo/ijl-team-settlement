import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildSubmissionReminderMessage,
  formatReminderMonth,
  sendDiscordReminderOnce,
  type DiscordReminderResult,
  type DiscordReminderTeam,
} from "@/lib/discord-reminders";
import { getMonthlyStatusLabel, normalizeMonthlyStatus } from "@/lib/monthly-data";

export const dynamic = "force-dynamic";

type ReminderScope =
  | "project_all"
  | "project_single"
  | "monthly_all"
  | "monthly_single";

type ProjectReminderRow = {
  id: string;
  status: string | null;
  submitted_at: string | null;
  projects: {
    id: string;
    title: string | null;
    deadline_at: string | null;
    status: string | null;
  } | null;
  teams: (DiscordReminderTeam & { is_active: boolean | null }) | null;
};

type MonthlyReminderRow = {
  id: string;
  team_id: string | null;
  target_month: string | null;
  status: string | null;
  teams: (DiscordReminderTeam & { is_active: boolean | null }) | null;
};

type MonthlySettingRow = {
  target_month: string;
  deadline_at: string | null;
};

type ReminderStats = Record<DiscordReminderResult | "ineligible" | "total", number>;

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json(
        { error: "Supabase 环境变量没有设置成功。" },
        { status: 500 }
      );
    }

    const payload = (await request.json().catch(() => ({}))) as {
      scope?: ReminderScope;
      projectTeamId?: string;
      monthlySubmissionId?: string;
      targetMonth?: string;
      dryRun?: boolean;
    };
    const scope = payload.scope || "project_all";
    const supabase = createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey);

    if (!isReminderScope(scope)) {
      return Response.json({ error: "不支持的提醒类型。" }, { status: 400 });
    }

    if (scope === "project_single" && !payload.projectTeamId) {
      return Response.json({ error: "缺少项目提交记录 ID。" }, { status: 400 });
    }

    if (scope === "monthly_single" && !payload.monthlySubmissionId) {
      return Response.json({ error: "缺少月数据记录 ID。" }, { status: 400 });
    }

    if (scope === "project_all" || scope === "project_single") {
      const result = await sendProjectSubmissionReminders({
        supabase,
        projectTeamId: payload.projectTeamId,
        dryRun: Boolean(payload.dryRun),
      });

      return Response.json({ ok: true, scope, ...result });
    }

    const result = await sendMonthlyDataReminders({
      supabase,
      monthlySubmissionId: payload.monthlySubmissionId,
      targetMonth: payload.targetMonth,
      dryRun: Boolean(payload.dryRun),
    });

    return Response.json({ ok: true, scope, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "提醒发送失败。" },
      { status: 500 }
    );
  }
}

async function sendProjectSubmissionReminders({
  supabase,
  projectTeamId,
  dryRun,
}: {
  supabase: SupabaseClient;
  projectTeamId?: string;
  dryRun: boolean;
}) {
  let query = supabase.from("project_teams").select(`
    id,
    status,
    submitted_at,
    projects (
      id,
      title,
      deadline_at,
      status
    ),
    teams (
      id,
      name,
      short_name,
      discord_webhook_url,
      discord_mention_text,
      is_active
    )
  `);

  if (projectTeamId) {
    query = query.eq("id", projectTeamId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data || []) as unknown as ProjectReminderRow[]).filter((row) => {
    if (row.projects?.status === "archived" || row.teams?.is_active === false) {
      return false;
    }

    if (projectTeamId) {
      return true;
    }

    return isProjectReminderTarget(row);
  });

  return sendRows(supabase, rows, dryRun, async (row) => {
    if (!isProjectReminderTarget(row)) {
      return { type: "ineligible" as const };
    }

    if (!row.teams || !row.projects) {
      return { type: "ineligible" as const };
    }

    const content = buildSubmissionReminderMessage({
      team: row.teams,
      targetLabel: row.projects.title || "提出物",
      deadlineAt: row.projects.deadline_at,
      statusLabel: formatProjectReminderStatus(row.status),
    });

    return {
      type: "send" as const,
      team: row.teams,
      reminderType: "project_submission" as const,
      itemId: row.projects.id,
      targetMonth: null,
      reminderKey: `manual-${Date.now()}-${row.id}`,
      content,
    };
  });
}

async function sendMonthlyDataReminders({
  supabase,
  monthlySubmissionId,
  targetMonth,
  dryRun,
}: {
  supabase: SupabaseClient;
  monthlySubmissionId?: string;
  targetMonth?: string;
  dryRun: boolean;
}) {
  let query = supabase.from("monthly_data_submissions").select(`
    id,
    team_id,
    target_month,
    status,
    teams (
      id,
      name,
      short_name,
      discord_webhook_url,
      discord_mention_text,
      is_active
    )
  `);

  if (monthlySubmissionId) {
    query = query.eq("id", monthlySubmissionId);
  } else if (targetMonth) {
    query = query.eq("target_month", targetMonth);
  }

  const [{ data, error }, { data: settings, error: settingsError }] =
    await Promise.all([
      query,
      supabase.from("monthly_data_settings").select("target_month, deadline_at"),
    ]);

  if (error) {
    throw new Error(error.message);
  }

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const settingByMonth = new Map(
    ((settings || []) as MonthlySettingRow[]).map((setting) => [
      setting.target_month,
      setting,
    ])
  );
  const rows = ((data || []) as unknown as MonthlyReminderRow[]).filter((row) => {
    if (row.teams?.is_active === false) {
      return false;
    }

    if (monthlySubmissionId) {
      return true;
    }

    return isMonthlyReminderTarget(row.status);
  });

  return sendRows(supabase, rows, dryRun, async (row) => {
    if (!isMonthlyReminderTarget(row.status) || !row.teams || !row.target_month) {
      return { type: "ineligible" as const };
    }

    const setting = settingByMonth.get(row.target_month);
    const content = buildSubmissionReminderMessage({
      team: row.teams,
      targetLabel: `${formatReminderMonth(row.target_month)}月データ`,
      deadlineAt: setting?.deadline_at || null,
      statusLabel: getMonthlyStatusLabel(row.status || "not_submitted"),
    });

    return {
      type: "send" as const,
      team: row.teams,
      reminderType: "monthly_data" as const,
      itemId: row.target_month,
      targetMonth: row.target_month,
      reminderKey: `manual-${Date.now()}-${row.id}`,
      content,
    };
  });
}

async function sendRows<T>(
  supabase: SupabaseClient,
  rows: T[],
  dryRun: boolean,
  buildSendInput: (row: T) => Promise<
    | { type: "ineligible" }
    | {
        type: "send";
        team: DiscordReminderTeam;
        reminderType: "monthly_data" | "project_submission";
        itemId: string;
        targetMonth: string | null;
        reminderKey: string;
        content: string;
      }
  >
) {
  const stats: ReminderStats = {
    total: rows.length,
    sent: 0,
    wouldSend: 0,
    skipped: 0,
    failed: 0,
    missingWebhook: 0,
    ineligible: 0,
  };

  for (const row of rows) {
    const input = await buildSendInput(row);

    if (input.type === "ineligible") {
      stats.ineligible += 1;
      continue;
    }

    const result = await sendDiscordReminderOnce({
      ...input,
      supabase,
      dryRun,
    });

    stats[result] += 1;
  }

  return stats;
}

function isProjectReminderTarget(row: ProjectReminderRow) {
  const status = String(row.status || "");

  return (status === "not_submitted" || status === "draft" || status === "returned") && !isSubmittedLike(row);
}

function isSubmittedLike(row: ProjectReminderRow) {
  return Boolean(row.submitted_at && String(row.status || "") !== "returned");
}

function isMonthlyReminderTarget(status: string | null | undefined) {
  const normalized = normalizeMonthlyStatus(status);

  return (
    normalized === "not_submitted" ||
    normalized === "draft" ||
    normalized === "returned"
  );
}

function formatProjectReminderStatus(status?: string | null) {
  if (status === "returned") {
    return "差し戻し（再提出待ち）";
  }

  return "未提出";
}

function isReminderScope(value: string): value is ReminderScope {
  return (
    value === "project_all" ||
    value === "project_single" ||
    value === "monthly_all" ||
    value === "monthly_single"
  );
}
