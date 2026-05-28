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
  const numericValue = Number(value || 0);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

  return new Intl.NumberFormat("ja-JP").format(safeValue);
}
