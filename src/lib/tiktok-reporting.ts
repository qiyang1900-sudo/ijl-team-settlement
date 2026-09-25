import { addMonths } from "./month-options";
import { tiktokMonthlyRows, type TiktokMonthlyRow } from "./tiktok-monthly-data";

export type TiktokReportingMetrics = {
  followerCount: number | null;
  postCount: number | null;
  videoViews: number | null;
  streamViews: number | null;
  streamCount: number | null;
};

export type TiktokReportingMonth = {
  month: string;
  total: TiktokReportingMetrics;
};

export type TeamTiktokReport = {
  months: TiktokReportingMonth[];
  total: TiktokReportingMetrics;
  rows: TiktokMonthlyRow[];
};

const metricKeys = [
  "followerCount", "postCount", "videoViews", "streamViews", "streamCount",
] as const;

function completeSum(values: Array<number | null | undefined>): number | null {
  if (!values.length || values.some((value) => value == null || !Number.isFinite(value))) {
    return null;
  }
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function summarizeTiktokReportingRows(rows: TiktokMonthlyRow[]): TiktokReportingMetrics {
  return Object.fromEntries(
    metricKeys.map((key) => [key, completeSum(rows.map((row) => row[key]))])
  ) as TiktokReportingMetrics;
}

export function combineTiktokReportingMonths(months: TiktokReportingMonth[]): TiktokReportingMetrics {
  const latest = [...months].sort((a, b) => a.month.localeCompare(b.month)).at(-1);
  // Missing months stay unknown; followers use the last month's snapshot.
  return Object.fromEntries(metricKeys.map((key) => [
    key,
    key === "followerCount"
      ? latest?.total.followerCount ?? null
      : completeSum(months.map((row) => row.total[key])),
  ])) as TiktokReportingMetrics;
}

export function getTiktokTeamRows(
  teamShortName: string | null,
  sourceRows: TiktokMonthlyRow[] = tiktokMonthlyRows
) {
  const team = String(teamShortName || "").trim().toUpperCase();
  if (!team) return [];
  return sourceRows.filter((row) => row.teamShortName.trim().toUpperCase() === team);
}

export function buildTeamTiktokReport(
  teamShortName: string | null,
  from: string,
  to: string,
  sourceRows: TiktokMonthlyRow[] = tiktokMonthlyRows
): TeamTiktokReport {
  const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!monthPattern.test(from) || !monthPattern.test(to) || from > to) {
    return { months: [], total: summarizeTiktokReportingRows([]), rows: [] };
  }
  const rows = getTiktokTeamRows(teamShortName, sourceRows)
    .filter((row) => row.month >= from && row.month <= to)
    .sort((a, b) => b.month.localeCompare(a.month) || Number(b.isOfficial) - Number(a.isOfficial));
  const months: TiktokReportingMonth[] = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) {
    months.push({
      month,
      total: summarizeTiktokReportingRows(rows.filter((row) => row.month === month)),
    });
  }
  return { months, total: combineTiktokReportingMonths(months), rows };
}
