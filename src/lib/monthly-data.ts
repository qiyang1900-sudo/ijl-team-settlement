export type MonthlyDataStatus =
  | "not_submitted"
  | "draft"
  | "submitted"
  | "reviewing"
  | "returned"
  | "approved";

export type MonthlyPlayerRow = {
  id: string;
  playerId?: string;
  playerHandle?: string;
  playerReading?: string;
  playerPosition?: string;
  playerRole?: string;
  playerName: string;
  salaryAmount: string;
  salaryScreenshotName?: string;
  salaryScreenshotUrl?: string;
  salaryScreenshotStoragePath?: string;
  salaryScreenshotMimeType?: string;
  xTweetCount: string;
  xImpressions: string;
  xEngagements: string;
  xFanEventCount: string;
  xFollowerCount: string;
  youtubeVideoPostCount: string;
  youtubeVideoViews: string;
  youtubeShortPostCount: string;
  youtubeShortViews: string;
  youtubeLikeCount: string;
  youtubeStreamCount: string;
  youtubeStreamViews: string;
  youtubeTotalImpressions: string;
  youtubeSubscriberCount: string;
};

export type SalaryScreenshotSummary = {
  total: number;
  submitted: number;
  missing: number;
  isComplete: boolean;
  label: string;
};

export type MonthlyReminderSetting = {
  target_month: string;
  deadline_at: string | null;
  salary_screenshot_deadline_at?: string | null;
};

export const monthlyReminderStartMonth = "2026-06";

export const officialMonthlyRowHandle = "__official_account__";
export const officialMonthlyRowRole = "official_account";
const legacyOfficialAccountAliases = [
  "a公式",
  "awg公式",
  "arnebwithwog",
  "arnebwithwog公式",
  "axizwave",
  "axiz公式",
  "dfm公式",
  "detonationfocusme",
  "detonationfocusme公式",
  "fennel",
  "fennel公式",
  "qtdig",
  "qtdig公式",
  "rc公式",
  "reject",
  "reject公式",
  "sz公式",
  "scarz",
  "scarz公式",
  "zeta公式",
  "zetadivision",
  "zetadivision公式",
];
const monthlyMetricKeys: Array<keyof MonthlyPlayerRow> = [
  "xTweetCount",
  "xImpressions",
  "xEngagements",
  "xFanEventCount",
  "xFollowerCount",
  "youtubeVideoPostCount",
  "youtubeVideoViews",
  "youtubeShortPostCount",
  "youtubeShortViews",
  "youtubeLikeCount",
  "youtubeStreamCount",
  "youtubeStreamViews",
  "youtubeTotalImpressions",
  "youtubeSubscriberCount",
];

export const emptyMonthlyPlayerRow = (index = 0): MonthlyPlayerRow => ({
  id: `player-${index + 1}`,
  playerId: "",
  playerHandle: "",
  playerReading: "",
  playerPosition: "",
  playerRole: "",
  playerName: "",
  salaryAmount: "",
  salaryScreenshotName: "",
  salaryScreenshotUrl: "",
  salaryScreenshotStoragePath: "",
  salaryScreenshotMimeType: "",
  xTweetCount: "",
  xImpressions: "",
  xEngagements: "",
  xFanEventCount: "",
  xFollowerCount: "",
  youtubeVideoPostCount: "",
  youtubeVideoViews: "",
  youtubeShortPostCount: "",
  youtubeShortViews: "",
  youtubeLikeCount: "",
  youtubeStreamCount: "",
  youtubeStreamViews: "",
  youtubeTotalImpressions: "",
  youtubeSubscriberCount: "",
});

export function createOfficialMonthlyRow(
  teamShortName: string | null | undefined,
  index = 0
): MonthlyPlayerRow {
  const safeTeamShortName = String(teamShortName || "").trim() || "チーム";

  return {
    ...emptyMonthlyPlayerRow(index),
    id: `official-${safeTeamShortName}`,
    playerHandle: officialMonthlyRowHandle,
    playerRole: officialMonthlyRowRole,
    playerName: `${safeTeamShortName}公式`,
  };
}

export function isOfficialMonthlyRow(row: MonthlyPlayerRow) {
  const id = normalizeOfficialLookupText(row.id);
  const handle = normalizeOfficialLookupText(row.playerHandle);
  const name = normalizeOfficialLookupText(row.playerName);
  const officialHandle = normalizeOfficialLookupText(officialMonthlyRowHandle);

  return (
    row.playerRole === officialMonthlyRowRole ||
    row.playerHandle === officialMonthlyRowHandle ||
    id.startsWith("official") ||
    id.includes("official") ||
    id.includes("公式") ||
    handle === officialHandle ||
    handle.includes("公式") ||
    name.includes("公式") ||
    isLegacyOfficialAccountLookup(id) ||
    isLegacyOfficialAccountLookup(handle) ||
    isLegacyOfficialAccountLookup(name)
  );
}

export function splitMonthlyRows(rows: MonthlyPlayerRow[]) {
  const officialRows = rows.filter(isOfficialMonthlyRow);
  const officialRow = combineOfficialRows(officialRows);
  const playerRows = rows.filter((row) => !isOfficialMonthlyRow(row));

  return {
    officialRow,
    officialRows: officialRow ? [officialRow] : [],
    playerRows,
  };
}

export function getSalaryScreenshotSummary(
  playerRows: MonthlyPlayerRow[]
): SalaryScreenshotSummary {
  const total = playerRows.length;
  const submitted = playerRows.filter((row) =>
    Boolean(String(row.salaryScreenshotUrl || row.salaryScreenshotName || "").trim())
  ).length;
  const missing = Math.max(0, total - submitted);
  const isComplete = total > 0 && missing === 0;
  const label =
    total === 0
      ? "未設定"
      : isComplete
        ? "提出済み"
        : submitted > 0
          ? `一部提出（${submitted}/${total}）`
          : "未提出";

  return {
    total,
    submitted,
    missing,
    isComplete,
    label,
  };
}

export function isMonthlyReminderEligibleMonth(targetMonth: unknown) {
  const month = String(targetMonth || "").slice(0, 7);

  return /^\d{4}-\d{2}$/.test(month) && month >= monthlyReminderStartMonth;
}

export function buildMonthlyReminderSettings(
  settings: MonthlyReminderSetting[],
  now = new Date()
) {
  const settingByMonth = new Map(
    settings
      .filter((setting) => isMonthlyReminderEligibleMonth(setting.target_month))
      .map((setting) => [setting.target_month, setting])
  );

  for (const month of getExpectedMonthlySubmissionMonths(now)) {
    if (!settingByMonth.has(month)) {
      settingByMonth.set(month, {
        target_month: month,
        deadline_at: null,
        salary_screenshot_deadline_at: null,
      });
    }
  }

  return Array.from(settingByMonth.values())
    .map((setting) => ({
      ...setting,
      deadline_at:
        setting.deadline_at || buildDefaultMonthlyDeadlineAt(setting.target_month),
      salary_screenshot_deadline_at:
        setting.salary_screenshot_deadline_at ||
        buildDefaultSalaryScreenshotDeadlineAt(setting.target_month),
    }))
    .sort((left, right) => left.target_month.localeCompare(right.target_month));
}

export function getExpectedMonthlySubmissionMonths(now = new Date()) {
  const currentMonth = getTokyoMonthValue(now);
  const latestTargetMonth = addMonthsToMonth(currentMonth, -1);
  const months: string[] = [];

  if (latestTargetMonth < monthlyReminderStartMonth) {
    return months;
  }

  let cursor = monthlyReminderStartMonth;

  while (cursor <= latestTargetMonth) {
    months.push(cursor);
    cursor = addMonthsToMonth(cursor, 1);
  }

  return months;
}

export function buildDefaultMonthlyDeadlineAt(monthValue: string) {
  const parts = parseMonthValue(monthValue);

  if (!parts) {
    return new Date().toISOString();
  }

  return new Date(Date.UTC(parts.year, parts.month, 10, 14, 59, 0)).toISOString();
}

export function buildDefaultSalaryScreenshotDeadlineAt(monthValue: string) {
  const parts = parseMonthValue(monthValue);

  if (!parts) {
    return new Date().toISOString();
  }

  return new Date(Date.UTC(parts.year, parts.month + 1, 0, 14, 59, 0)).toISOString();
}

function getTokyoMonthValue(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";

  return `${year}-${month}`;
}

function addMonthsToMonth(monthValue: string, offset: number) {
  const parts = parseMonthValue(monthValue);

  if (!parts) {
    return monthValue;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function parseMonthValue(monthValue: string) {
  const match = monthValue.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

export function sumMonthlyField(
  rows: MonthlyPlayerRow[],
  key: keyof MonthlyPlayerRow
) {
  return rows.reduce((sum, row) => sum + numericMonthlyValue(row[key]), 0);
}

export function getMonthlyYoutubeViews(row: MonthlyPlayerRow) {
  return (
    numericMonthlyValue(row.youtubeVideoViews) +
    numericMonthlyValue(row.youtubeShortViews) +
    numericMonthlyValue(row.youtubeStreamViews)
  );
}

export function numericMonthlyValue(value: unknown) {
  const numberValue = Number(normalizeNumericText(value) || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function normalizeNumericText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  const normalized = String(value)
    .normalize("NFKC")
    .replace(/[,\s円¥￥]/g, "")
    .replace(/[−－ー]/g, "-")
    .trim();

  if (!normalized || /^-+$/.test(normalized)) {
    return "";
  }

  const match = normalized.match(/-?\d+(?:\.\d+)?/);

  return match ? match[0] : "";
}

export function normalizeMonthlyStatus(status: unknown): MonthlyDataStatus {
  const value = String(status || "");

  if (
    value === "draft" ||
    value === "submitted" ||
    value === "reviewing" ||
    value === "returned" ||
    value === "approved"
  ) {
    return value;
  }

  return "not_submitted";
}

export function getMonthlyStatusLabel(status: unknown) {
  const normalized = normalizeMonthlyStatus(status);

  const labels: Record<MonthlyDataStatus, string> = {
    not_submitted: "未提出",
    draft: "保存済み",
    submitted: "提出済み",
    reviewing: "審査中",
    returned: "差し戻し（追記必要）",
    approved: "承認済み",
  };

  return labels[normalized];
}

export function getMonthlyAdminStatusLabel(status: unknown) {
  const normalized = normalizeMonthlyStatus(status);

  const labels: Record<MonthlyDataStatus, string> = {
    not_submitted: "未提交",
    draft: "已保存",
    submitted: "已提交",
    reviewing: "审核中",
    returned: "已驳回需补充",
    approved: "已通过",
  };

  return labels[normalized];
}

export function getMonthlyStatusTone(status: unknown) {
  const normalized = normalizeMonthlyStatus(status);

  const tones: Record<MonthlyDataStatus, string> = {
    not_submitted: "bg-slate-100 text-slate-600 ring-slate-200",
    draft: "bg-sky-50 text-sky-700 ring-sky-200",
    submitted: "bg-amber-50 text-amber-700 ring-amber-200",
    reviewing: "bg-orange-50 text-orange-700 ring-orange-200",
    returned: "bg-rose-50 text-rose-700 ring-rose-200",
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };

  return tones[normalized];
}

export function parseMonthlyPlayerRows(value: unknown): MonthlyPlayerRow[] {
  if (Array.isArray(value)) {
    return normalizeMonthlyPlayerRows(value);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? normalizeMonthlyPlayerRows(parsed) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeMonthlyPlayerRows(rows: unknown[]): MonthlyPlayerRow[] {
  return rows.map((row, index) => ({
    ...emptyMonthlyPlayerRow(index),
    ...(typeof row === "object" && row ? row : {}),
    id:
      typeof row === "object" && row && "id" in row
        ? String((row as { id?: unknown }).id || `player-${index + 1}`)
        : `player-${index + 1}`,
  }));
}

export function formatMonthLabel(value: unknown) {
  const rawValue = String(value || "");

  if (/^\d{4}-\d{2}/.test(rawValue)) {
    const [year, month] = rawValue.split("-");
    return `${year}年${month}月`;
  }

  return rawValue || "-";
}

export function formatMonthlyNumber(value: unknown) {
  return new Intl.NumberFormat("ja-JP").format(numericMonthlyValue(value));
}

function combineOfficialRows(rows: MonthlyPlayerRow[]) {
  if (rows.length === 0) {
    return null;
  }

  const base =
    rows.find(
      (row) =>
        row.playerRole === officialMonthlyRowRole ||
        row.playerHandle === officialMonthlyRowHandle
    ) || rows[0];
  const combined: MonthlyPlayerRow = {
    ...base,
    playerHandle: officialMonthlyRowHandle,
    playerRole: officialMonthlyRowRole,
  };

  for (const key of monthlyMetricKeys) {
    const values = rows.map((row) => numericMonthlyValue(row[key]));
    const maxValue = Math.max(0, ...values);
    combined[key] = maxValue > 0 ? String(maxValue) : "";
  }

  return combined;
}

function normalizeOfficialLookupText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[＿_・,，.。()（）"']/g, "")
    .trim();
}

function isLegacyOfficialAccountLookup(value: string) {
  return legacyOfficialAccountAliases.some(
    (alias) => value === alias || value.endsWith(alias)
  );
}
