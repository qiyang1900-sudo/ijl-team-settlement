import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  buildSubmissionReminderMessage,
  type DiscordReminderKind,
  formatReminderMonth,
  sendDiscordReminderOnce,
  type DiscordReminderResult,
  type DiscordReminderTeam,
} from "@/lib/discord-reminders";
import {
  buildMonthlyReminderSettings,
  getMonthlyStatusLabel,
  getSalaryScreenshotSummary,
  isMonthlyDataReminderWindowOpen,
  isMonthlyReminderEligibleMonth,
  isSalaryScreenshotReminderWindowOpen,
  normalizeMonthlyStatus,
  parseMonthlyPlayerRows,
  splitMonthlyRows,
} from "@/lib/monthly-data";

export const dynamic = "force-dynamic";

type ReminderScope =
  | "project_all"
  | "project_single"
  | "monthly_all"
  | "monthly_single"
  | "monthly_salary_all"
  | "monthly_salary_single";

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
  salary_status?: string | null;
  player_rows?: unknown;
  teams: (DiscordReminderTeam & { is_active: boolean | null }) | null;
  setting?: MonthlySettingRow | null;
  synthetic?: boolean;
};

type MonthlySettingRow = {
  target_month: string;
  deadline_at: string | null;
  salary_screenshot_deadline_at?: string | null;
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
      teamId?: string;
      targetMonth?: string;
      dryRun?: boolean;
    };
    const scope = payload.scope || "project_all";
    const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey, serviceRoleKey);

    if (!isReminderScope(scope)) {
      return Response.json({ error: "不支持的提醒类型。" }, { status: 400 });
    }

    if (scope === "project_single" && !payload.projectTeamId) {
      return Response.json({ error: "缺少项目提交记录 ID。" }, { status: 400 });
    }

    if (
      (scope === "monthly_single" || scope === "monthly_salary_single") &&
      !payload.monthlySubmissionId &&
      (!payload.targetMonth || !payload.teamId)
    ) {
      return Response.json(
        { error: "缺少月数据记录 ID 或战队月份。" },
        { status: 400 }
      );
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
      teamId: payload.teamId,
      targetMonth: payload.targetMonth,
      reminderKind:
        scope === "monthly_salary_all" || scope === "monthly_salary_single"
          ? "monthly_salary_screenshot"
          : "monthly_data",
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
  teamId,
  targetMonth,
  reminderKind,
  dryRun,
}: {
  supabase: SupabaseClient;
  monthlySubmissionId?: string;
  teamId?: string;
  targetMonth?: string;
  reminderKind: Extract<
    DiscordReminderKind,
    "monthly_data" | "monthly_salary_screenshot"
  >;
  dryRun: boolean;
}) {
  const rows = await loadMonthlyReminderRows({
    supabase,
    monthlySubmissionId,
    teamId,
    targetMonth,
  });
  const targetRows = rows.filter((row) => {
    if (!isMonthlyReminderEligibleMonth(row.target_month)) {
      return false;
    }

    if (row.teams?.is_active === false) {
      return false;
    }

    if (
      reminderKind === "monthly_salary_screenshot"
        ? !isSalaryScreenshotReminderWindowOpen(row.setting)
        : !isMonthlyDataReminderWindowOpen(row.setting)
    ) {
      return false;
    }

    if (monthlySubmissionId || (teamId && targetMonth)) {
      return true;
    }

    return reminderKind === "monthly_salary_screenshot"
      ? isSalaryScreenshotReminderTarget(row)
      : isMonthlyReminderTarget(row.status);
  });

  return sendRows(supabase, targetRows, dryRun, async (row) => {
    const isTarget =
      reminderKind === "monthly_salary_screenshot"
        ? isSalaryScreenshotReminderTarget(row)
        : isMonthlyReminderTarget(row.status);

    if (!isTarget || !row.teams || !row.target_month) {
      return { type: "ineligible" as const };
    }

    const setting = row.setting;
    const targetLabel =
      reminderKind === "monthly_salary_screenshot"
        ? `${formatReminderMonth(row.target_month)}月給与スクリーンショット`
        : `${formatReminderMonth(row.target_month)}月データ`;
    const deadlineAt =
      reminderKind === "monthly_salary_screenshot"
        ? setting?.salary_screenshot_deadline_at || null
        : setting?.deadline_at || null;
    const statusLabel =
      reminderKind === "monthly_salary_screenshot"
        ? getSalaryScreenshotReminderStatus(row)
        : getMonthlyStatusLabel(row.status || "not_submitted");

    const content = buildSubmissionReminderMessage({
      team: row.teams,
      targetLabel,
      deadlineAt,
      statusLabel,
    });

    return {
      type: "send" as const,
      team: row.teams,
      reminderType: reminderKind,
      itemId: row.target_month,
      targetMonth: row.target_month,
      reminderKey: `manual-${Date.now()}-${row.id || row.team_id}`,
      content,
    };
  });
}

async function loadMonthlyReminderRows({
  supabase,
  monthlySubmissionId,
  teamId,
  targetMonth,
}: {
  supabase: SupabaseClient;
  monthlySubmissionId?: string;
  teamId?: string;
  targetMonth?: string;
}) {
  const { data: settings, error: settingsError } = await supabase
    .from("monthly_data_settings")
    .select("*");

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const allSettings = buildMonthlyReminderSettings(
    (settings || []) as MonthlySettingRow[]
  ).filter((setting) =>
    (targetMonth ? setting.target_month === targetMonth : true) &&
    isMonthlyReminderEligibleMonth(setting.target_month)
  );
  const settingByMonth = new Map(
    allSettings.map((setting) => [setting.target_month, setting])
  );

  if (monthlySubmissionId) {
    const { data, error } = await supabase
      .from("monthly_data_submissions")
      .select(
        `
        id,
        team_id,
        target_month,
        status,
        salary_status,
        player_rows,
        teams (
          id,
          name,
          short_name,
          discord_webhook_url,
          discord_mention_text,
          is_active
        )
      `
      )
      .eq("id", monthlySubmissionId);

    if (error) {
      throw new Error(error.message);
    }

    return ((data || []) as unknown as MonthlyReminderRow[]).map((row) => ({
      ...row,
      setting: row.target_month ? settingByMonth.get(row.target_month) || null : null,
    }));
  }

  const [{ data: teams, error: teamError }, { data: submissions, error }] =
    await Promise.all([
      supabase
        .from("teams")
        .select(
          "id, name, short_name, discord_webhook_url, discord_mention_text, is_active"
        )
        .eq("is_active", true),
      buildMonthlySubmissionQuery(supabase, targetMonth, allSettings),
    ]);

  if (teamError) {
    throw new Error(teamError.message);
  }

  if (error) {
    throw new Error(error.message);
  }

  const safeTeams = ((teams || []) as Array<
    DiscordReminderTeam & { is_active: boolean | null }
  >).filter((team) => (teamId ? team.id === teamId : true));
  const submissionByTeamMonth = new Map(
    ((submissions || []) as MonthlyReminderRow[]).map((row) => [
      `${row.team_id}:${row.target_month}`,
      row,
    ])
  );
  const targetSettings = targetMonth
    ? allSettings
    : allSettings.filter(
        (setting) => setting.deadline_at || setting.salary_screenshot_deadline_at
      );

  return targetSettings.flatMap((setting) =>
    safeTeams.map((team) => {
      const existing = submissionByTeamMonth.get(`${team.id}:${setting.target_month}`);

      if (existing) {
        return {
          ...existing,
          teams: team,
          setting,
        };
      }

      return {
        id: `missing-${setting.target_month}-${team.id}`,
        team_id: team.id,
        target_month: setting.target_month,
        status: "not_submitted",
        salary_status: "not_submitted",
        player_rows: [],
        teams: team,
        setting,
        synthetic: true,
      } satisfies MonthlyReminderRow;
    })
  );
}

function buildMonthlySubmissionQuery(
  supabase: SupabaseClient,
  targetMonth: string | undefined,
  settings: MonthlySettingRow[]
) {
  const query = supabase
    .from("monthly_data_submissions")
    .select("id, team_id, target_month, status, salary_status, player_rows");

  if (targetMonth) {
    return query.eq("target_month", targetMonth);
  }

  const targetMonths = settings.map((setting) => setting.target_month);

  if (targetMonths.length === 0) {
    return query.eq("target_month", "__none__");
  }

  return query.in("target_month", targetMonths);
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
        reminderType: DiscordReminderKind;
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

function isSalaryScreenshotReminderTarget(row: MonthlyReminderRow) {
  const status = normalizeMonthlyStatus(row.salary_status);

  return (
    status === "not_submitted" ||
    status === "draft" ||
    status === "returned" ||
    !getSalaryScreenshotSummaryForRow(row).isComplete
  );
}

function getSalaryScreenshotReminderStatus(row: MonthlyReminderRow) {
  const status = normalizeMonthlyStatus(row.salary_status);

  if (status === "returned") {
    return "差し戻し（再提出待ち）";
  }

  if (status === "draft") {
    return "下書き保存";
  }

  if (status === "submitted" || status === "reviewing" || status === "approved") {
    return getMonthlyStatusLabel(status);
  }

  return getSalaryScreenshotSummaryForRow(row).label;
}

function getSalaryScreenshotSummaryForRow(row: MonthlyReminderRow) {
  const { playerRows } = splitMonthlyRows(parseMonthlyPlayerRows(row.player_rows));

  return getSalaryScreenshotSummary(playerRows);
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
    value === "monthly_single" ||
    value === "monthly_salary_all" ||
    value === "monthly_salary_single"
  );
}
