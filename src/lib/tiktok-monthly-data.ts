import type { MonthlyAccountSummary, MonthlySummary } from "./monthly-summary";
import rawTiktokMonthlyRows from "./tiktok-monthly-history-data.json";

export type TiktokMonthlyRow = {
  month: string;
  teamShortName: string;
  accountName: string;
  isOfficial: boolean;
  link: string;
  followerCount: number;
  streamCount: number;
  postCount: number;
  streamViews: number;
  videoViews: number;
};

export type TiktokMetricSummary = {
  followerCount: number;
  streamCount: number;
  postCount: number;
  streamViews: number;
  videoViews: number;
};

export type TiktokMonthlySummary = {
  official: TiktokMetricSummary;
  players: TiktokMetricSummary;
  total: TiktokMetricSummary;
  rows: TiktokMonthlyRow[];
};

export const tiktokMonthlyRows =
  rawTiktokMonthlyRows as TiktokMonthlyRow[];

export function getTiktokMonthlyRows(
  month: string,
  teamShortName?: string | null
) {
  const normalizedTeam = normalizeTeamShortName(teamShortName);

  return tiktokMonthlyRows.filter((row) => {
    if (row.month !== month) {
      return false;
    }

    return normalizedTeam
      ? normalizeTeamShortName(row.teamShortName) === normalizedTeam
      : true;
  });
}

export function getTiktokRowsForMonths(
  months: string[],
  teamShortName?: string | null
) {
  const monthSet = new Set(months);
  const normalizedTeam = normalizeTeamShortName(teamShortName);

  return tiktokMonthlyRows.filter((row) => {
    if (!monthSet.has(row.month)) {
      return false;
    }

    return normalizedTeam
      ? normalizeTeamShortName(row.teamShortName) === normalizedTeam
      : true;
  });
}

export function getTiktokMonthlySummary(
  month: string,
  teamShortName?: string | null
): TiktokMonthlySummary {
  return summarizeTiktokRows(getTiktokMonthlyRows(month, teamShortName));
}

export function getTiktokPeriodSummary(
  months: string[],
  teamShortName?: string | null
): TiktokMonthlySummary {
  return summarizeTiktokRows(getTiktokRowsForMonths(months, teamShortName));
}

export function summarizeTiktokRows(rows: TiktokMonthlyRow[]): TiktokMonthlySummary {
  const officialRows = rows.filter((row) => row.isOfficial);
  const playerRows = rows.filter((row) => !row.isOfficial);
  const official = summarizeTiktokMetricRows(officialRows);
  const players = summarizeTiktokMetricRows(playerRows);

  return {
    official,
    players,
    total: combineTiktokMetricSummaries(official, players),
    rows,
  };
}

export function applyTiktokShortVideoToSummary(
  summary: MonthlySummary,
  teamShortName?: string | null
): MonthlySummary {
  const tiktokSummary = getTiktokMonthlySummary(summary.month, teamShortName);

  if (tiktokSummary.rows.length === 0) {
    return summary;
  }

  return mergeTiktokShortVideoSummary(summary, tiktokSummary);
}

export function applyTiktokShortVideoToPeriodSummary(
  summary: MonthlySummary,
  months: string[],
  teamShortName?: string | null
): MonthlySummary {
  const tiktokSummary = getTiktokPeriodSummary(months, teamShortName);

  if (tiktokSummary.rows.length === 0) {
    return summary;
  }

  return mergeTiktokShortVideoSummary(summary, tiktokSummary);
}

function mergeTiktokShortVideoSummary(
  summary: MonthlySummary,
  tiktokSummary: TiktokMonthlySummary
): MonthlySummary {
  return {
    ...summary,
    official: mergeAccountShortVideo(summary.official, tiktokSummary.official),
    players: mergeAccountShortVideo(summary.players, tiktokSummary.players),
    total: mergeAccountShortVideo(summary.total, tiktokSummary.total),
  };
}

function mergeAccountShortVideo(
  account: MonthlyAccountSummary,
  tiktok: TiktokMetricSummary
): MonthlyAccountSummary {
  return {
    ...account,
    youtubeShortPostCount: account.youtubeShortPostCount + tiktok.postCount,
    youtubeShortViews: account.youtubeShortViews + tiktok.videoViews,
    youtubeTotalPostCount: account.youtubeTotalPostCount + tiktok.postCount,
    youtubeVideoAndShortViews:
      account.youtubeVideoAndShortViews + tiktok.videoViews,
    youtubeTotalPlayback: account.youtubeTotalPlayback + tiktok.videoViews,
  };
}

function summarizeTiktokMetricRows(rows: TiktokMonthlyRow[]): TiktokMetricSummary {
  return rows.reduce(
    (summary, row) => ({
      followerCount: summary.followerCount + safeNumber(row.followerCount),
      streamCount: summary.streamCount + safeNumber(row.streamCount),
      postCount: summary.postCount + safeNumber(row.postCount),
      streamViews: summary.streamViews + safeNumber(row.streamViews),
      videoViews: summary.videoViews + safeNumber(row.videoViews),
    }),
    emptyTiktokSummary()
  );
}

function combineTiktokMetricSummaries(
  official: TiktokMetricSummary,
  players: TiktokMetricSummary
): TiktokMetricSummary {
  return {
    followerCount: official.followerCount + players.followerCount,
    streamCount: official.streamCount + players.streamCount,
    postCount: official.postCount + players.postCount,
    streamViews: official.streamViews + players.streamViews,
    videoViews: official.videoViews + players.videoViews,
  };
}

function emptyTiktokSummary(): TiktokMetricSummary {
  return {
    followerCount: 0,
    streamCount: 0,
    postCount: 0,
    streamViews: 0,
    videoViews: 0,
  };
}

function safeNumber(value: unknown) {
  const numberValue = Number(value || 0);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeTeamShortName(value: unknown) {
  return String(value || "").trim().toUpperCase();
}
