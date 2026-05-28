import {
  MonthlyPlayerRow,
  getMonthlyYoutubeViews,
  numericMonthlyValue,
  parseMonthlyPlayerRows,
  splitMonthlyRows,
} from "./monthly-data";

export type MonthlySubmissionLike = {
  target_month: string;
  player_rows: unknown;
};

export type MonthlyAccountSummary = {
  xTweetCount: number;
  xImpressions: number;
  xEngagements: number;
  xEngagementRate: number;
  xFanEventCount: number;
  xFollowerCount: number;
  youtubeVideoPostCount: number;
  youtubeVideoViews: number;
  youtubeShortPostCount: number;
  youtubeShortViews: number;
  youtubeLikeCount: number;
  youtubeStreamCount: number;
  youtubeStreamViews: number;
  youtubeTotalImpressions: number;
  youtubeSubscriberCount: number;
  youtubeTotalPostCount: number;
  youtubeVideoAndShortViews: number;
  youtubeTotalPlayback: number;
};

export type MonthlySummary = {
  month: string;
  submissionCount: number;
  officialRows: MonthlyPlayerRow[];
  playerRows: MonthlyPlayerRow[];
  official: MonthlyAccountSummary;
  players: MonthlyAccountSummary;
  total: MonthlyAccountSummary;
};

export function summarizeMonthlySubmissions(
  submissions: MonthlySubmissionLike[]
): MonthlySummary[] {
  const grouped = new Map<string, MonthlySubmissionLike[]>();

  for (const submission of submissions) {
    grouped.set(submission.target_month, [
      ...(grouped.get(submission.target_month) || []),
      submission,
    ]);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, monthSubmissions]) => {
      const officialRows: MonthlyPlayerRow[] = [];
      const playerRows: MonthlyPlayerRow[] = [];

      for (const submission of monthSubmissions) {
        const rows = parseMonthlyPlayerRows(submission.player_rows);
        const splitRows = splitMonthlyRows(rows);

        if (splitRows.officialRow) {
          officialRows.push(splitRows.officialRow);
        }

        playerRows.push(...splitRows.playerRows);
      }

      return buildMonthlySummary(month, officialRows, playerRows, monthSubmissions.length);
    });
}

export function buildMonthlySummary(
  month: string,
  officialRows: MonthlyPlayerRow[],
  playerRows: MonthlyPlayerRow[],
  submissionCount = 1
): MonthlySummary {
  const official = summarizeRows(officialRows);
  const players = summarizeRows(playerRows);
  const total = combineSummaries(official, players);

  return {
    month,
    submissionCount,
    officialRows,
    playerRows,
    official,
    players,
    total,
  };
}

export function combineMonthlySummariesForPeriod(
  month: string,
  summaries: MonthlySummary[],
  submissionCount = summaries.reduce((sum, summary) => sum + summary.submissionCount, 0)
): MonthlySummary {
  const summary = buildMonthlySummary(
    month,
    summaries.flatMap((item) => item.officialRows),
    summaries.flatMap((item) => item.playerRows),
    submissionCount
  );
  const latestSummary = [...summaries]
    .sort((left, right) => left.month.localeCompare(right.month))
    .at(-1);

  if (!latestSummary) {
    return summary;
  }

  return {
    ...summary,
    official: {
      ...summary.official,
      xFollowerCount: latestSummary.official.xFollowerCount,
      youtubeSubscriberCount: latestSummary.official.youtubeSubscriberCount,
    },
    players: {
      ...summary.players,
      xFollowerCount: latestSummary.players.xFollowerCount,
      youtubeSubscriberCount: latestSummary.players.youtubeSubscriberCount,
    },
    total: {
      ...summary.total,
      xFollowerCount: latestSummary.total.xFollowerCount,
      youtubeSubscriberCount: latestSummary.total.youtubeSubscriberCount,
    },
  };
}

export function summarizeRows(rows: MonthlyPlayerRow[]): MonthlyAccountSummary {
  const xImpressions = sumRows(rows, "xImpressions");
  const xEngagements = sumRows(rows, "xEngagements");
  const youtubeVideoViews = sumRows(rows, "youtubeVideoViews");
  const youtubeShortViews = sumRows(rows, "youtubeShortViews");
  const youtubeStreamViews = sumRows(rows, "youtubeStreamViews");
  const youtubeVideoPostCount = sumRows(rows, "youtubeVideoPostCount");
  const youtubeShortPostCount = sumRows(rows, "youtubeShortPostCount");

  return {
    xTweetCount: sumRows(rows, "xTweetCount"),
    xImpressions,
    xEngagements,
    xEngagementRate: xImpressions > 0 ? xEngagements / xImpressions : 0,
    xFanEventCount: sumRows(rows, "xFanEventCount"),
    xFollowerCount: sumRows(rows, "xFollowerCount"),
    youtubeVideoPostCount,
    youtubeVideoViews,
    youtubeShortPostCount,
    youtubeShortViews,
    youtubeLikeCount: sumRows(rows, "youtubeLikeCount"),
    youtubeStreamCount: sumRows(rows, "youtubeStreamCount"),
    youtubeStreamViews,
    youtubeTotalImpressions: sumRows(rows, "youtubeTotalImpressions"),
    youtubeSubscriberCount: sumRows(rows, "youtubeSubscriberCount"),
    youtubeTotalPostCount: youtubeVideoPostCount + youtubeShortPostCount,
    youtubeVideoAndShortViews: youtubeVideoViews + youtubeShortViews,
    youtubeTotalPlayback: rows.reduce(
      (sum, row) => sum + getMonthlyYoutubeViews(row),
      0
    ),
  };
}

export function formatMonthlyPercent(value: unknown) {
  const numberValue = Number(value || 0);
  const safeValue = Number.isFinite(numberValue) ? numberValue : 0;

  return `${(safeValue * 100).toFixed(1)}%`;
}

function combineSummaries(
  official: MonthlyAccountSummary,
  players: MonthlyAccountSummary
): MonthlyAccountSummary {
  const xImpressions = official.xImpressions + players.xImpressions;
  const xEngagements = official.xEngagements + players.xEngagements;

  return {
    xTweetCount: official.xTweetCount + players.xTweetCount,
    xImpressions,
    xEngagements,
    xEngagementRate: xImpressions > 0 ? xEngagements / xImpressions : 0,
    xFanEventCount: official.xFanEventCount + players.xFanEventCount,
    xFollowerCount: official.xFollowerCount + players.xFollowerCount,
    youtubeVideoPostCount:
      official.youtubeVideoPostCount + players.youtubeVideoPostCount,
    youtubeVideoViews: official.youtubeVideoViews + players.youtubeVideoViews,
    youtubeShortPostCount:
      official.youtubeShortPostCount + players.youtubeShortPostCount,
    youtubeShortViews: official.youtubeShortViews + players.youtubeShortViews,
    youtubeLikeCount: official.youtubeLikeCount + players.youtubeLikeCount,
    youtubeStreamCount: official.youtubeStreamCount + players.youtubeStreamCount,
    youtubeStreamViews: official.youtubeStreamViews + players.youtubeStreamViews,
    youtubeTotalImpressions:
      official.youtubeTotalImpressions + players.youtubeTotalImpressions,
    youtubeSubscriberCount:
      official.youtubeSubscriberCount + players.youtubeSubscriberCount,
    youtubeTotalPostCount:
      official.youtubeTotalPostCount + players.youtubeTotalPostCount,
    youtubeVideoAndShortViews:
      official.youtubeVideoAndShortViews + players.youtubeVideoAndShortViews,
    youtubeTotalPlayback:
      official.youtubeTotalPlayback + players.youtubeTotalPlayback,
  };
}

function sumRows(rows: MonthlyPlayerRow[], key: keyof MonthlyPlayerRow) {
  return rows.reduce((sum, row) => sum + numericMonthlyValue(row[key]), 0);
}
