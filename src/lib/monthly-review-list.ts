import {
  buildMonthlyReminderSettings,
  buildDefaultMonthlyDeadlineAt,
  buildDefaultSalaryScreenshotDeadlineAt,
  isMonthlyReminderEligibleMonth,
  normalizeMonthlyStatus,
  type MonthlyReminderSetting,
} from "./monthly-data";

export function normalizeReviewMonth(value: unknown) {
  const month = String(Array.isArray(value) ? value[0] || "" : value || "").trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : "";
}

export function buildMonthlyReviewSettings({
  settings,
  selectedMonth = "",
  extraMonths = [],
  now = new Date(),
}: {
  settings: MonthlyReminderSetting[];
  selectedMonth?: string;
  extraMonths?: string[];
  now?: Date;
}) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const currentMonth = `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
  const rows = buildMonthlyReminderSettings(settings.filter((row) => normalizeReviewMonth(row.target_month)), now);
  // Visibility is independent of reminder timing, including a completely empty current month.
  for (const month of [currentMonth, selectedMonth, ...extraMonths]) {
    if (normalizeReviewMonth(month) && isMonthlyReminderEligibleMonth(month) && !rows.some((row) => row.target_month === month)) {
      rows.push({
        target_month: month,
        deadline_at: buildDefaultMonthlyDeadlineAt(month),
        salary_screenshot_deadline_at: buildDefaultSalaryScreenshotDeadlineAt(month),
      });
    }
  }
  return rows.sort((a, b) => a.target_month.localeCompare(b.target_month));
}

type ReviewTeam = {
  id: string;
  name: string | null;
  short_name: string | null;
  is_active: boolean | null;
};
type ReviewRecord = {
  id: string;
  team_id: string;
  target_month: string;
  status: string;
  salary_status?: string | null;
  teams: { name: string | null; short_name: string | null } | null;
};

export function buildCompleteMonthlyReviewRows<T extends ReviewRecord>({
  submissions, settings, teams,
}: {
  submissions: T[];
  settings: MonthlyReminderSetting[];
  teams: ReviewTeam[];
}) {
  const settingByMonth = new Map(settings.map((setting) => [setting.target_month, setting]));
  const existing = new Set(submissions.map((row) => `${row.team_id}:${row.target_month}`));
  const activeTeams = Array.from(new Map(teams.filter((team) => team.is_active !== false).map((team) => [team.id, team])).values());
  const missing = Array.from(settingByMonth.values())
    .filter((setting) => normalizeReviewMonth(setting.target_month) && isMonthlyReminderEligibleMonth(setting.target_month))
    .flatMap((setting) => activeTeams
      .filter((team) => !existing.has(`${team.id}:${setting.target_month}`))
      .map((team) => ({
        id: `monthly-missing-${setting.target_month}-${team.id}`,
        team_id: team.id,
        target_month: setting.target_month,
        status: "not_submitted",
        salary_status: "not_submitted",
        player_rows: [],
        club_activity_link: null,
        club_activity_image_url: null,
        club_activity_image_name: null,
        club_activity_image_mime_type: null,
        club_activity_image_storage_path: null,
        return_reason: null,
        salary_return_reason: null,
        submitted_at: null,
        reviewing_at: null,
        returned_at: null,
        approved_at: null,
        salary_submitted_at: null,
        salary_reviewing_at: null,
        salary_returned_at: null,
        salary_approved_at: null,
        updated_at: null,
        teams: team,
        deadline_at: setting.deadline_at || buildDefaultMonthlyDeadlineAt(setting.target_month),
        salary_screenshot_deadline_at: setting.salary_screenshot_deadline_at || buildDefaultSalaryScreenshotDeadlineAt(setting.target_month),
        isSynthetic: true,
      })));
  const saved = submissions.map((row) => {
    const setting = settingByMonth.get(row.target_month);
    return {
      ...row,
      deadline_at: setting?.deadline_at || buildDefaultMonthlyDeadlineAt(row.target_month),
      salary_screenshot_deadline_at: setting?.salary_screenshot_deadline_at || buildDefaultSalaryScreenshotDeadlineAt(row.target_month),
    };
  });
  return [...saved, ...missing].sort((a, b) => b.target_month.localeCompare(a.target_month) ||
    String(a.teams?.short_name || a.teams?.name || "").localeCompare(String(b.teams?.short_name || b.teams?.name || "")));
}

export function groupMonthlyReviewRecords<T extends { target_month: string; status: string; salary_status?: string | null }>(rows: T[], kind: "monthly" | "salary") {
  const groups = { notSubmitted: [] as T[], draft: [] as T[], submitted: [] as T[], reviewing: [] as T[], returned: [] as T[], approved: [] as T[] };
  for (const row of rows) {
    if (!isMonthlyReminderEligibleMonth(row.target_month)) continue;
    const status = normalizeMonthlyStatus(kind === "salary" ? row.salary_status : row.status);
    if (status === "not_submitted" || status === "draft") groups.notSubmitted.push(row);
    else groups[status].push(row);
  }
  return groups;
}
