import {
  createOfficialMonthlyRow,
  emptyMonthlyPlayerRow,
} from "./monthly-data";
import {
  MonthlySummary,
  buildMonthlySummary,
} from "./monthly-summary";

export type HistoricalLeagueSummaryRow = {
  month: string;
  officialTweetCount: number;
  officialEngagements: number;
  officialImpressions: number;
  officialFollowers: number;
  playerTweetCount: number;
  playerEngagements: number;
  playerImpressions: number;
  playerFollowers: number;
  youtubeSubscriberCount: number;
  youtubeVideoPostCount: number;
  youtubeVideoViews: number;
  youtubeStreamViews: number;
  youtubeStreamCount: number;
  youtubeShortPostCount: number;
  youtubeShortViews: number;
  youtubeLikeCount: number;
};

export const historicalLeagueSummaryRows: HistoricalLeagueSummaryRow[] = [
  row("2024-03", 361, 340513, 16058063, 0, 1893, 786014, 28239651, 930830, 0, 0, 0, 0, 0, 0, 0, 0),
  row("2024-04", 363, 652212, 24997428, 0, 1548, 1254161, 35173455, 0, 0, 181, 1935354, 324106, 119, 132, 1078070, 47932),
  row("2024-05", 365, 652174, 23511174, 0, 1906, 1464032, 35976186, 0, 0, 81, 1976936, 844681, 261, 105, 1687334, 68778),
  row("2024-06", 402, 717198, 17809146, 0, 2008, 1114038, 24276398, 0, 0, 142, 2610488, 660163, 244, 65, 856648, 33625),
  row("2024-07", 325, 411758, 17007142, 0, 1111, 967428, 19694492, 0, 0, 158, 2724663, 1056264, 317, 207, 2914560, 172974),
  row("2024-08", 99, 192815, 5108257, 0, 763, 579846, 11913897, 0, 0, 154, 1983949, 970959, 417, 141, 1608209, 157808),
  row("2024-09", 136, 262159, 9872863, 0, 1031, 1061491, 33209481, 0, 0, 105, 1881444, 1018488, 403, 93, 1108224, 55850),
  row("2024-10", 173, 305163, 10018015, 0, 1066, 1018487, 18914264, 0, 0, 102, 2519396, 866145, 382, 80, 690112, 33865),
  row("2024-11", 284, 715176, 13009169, 0, 1129, 608474, 12294390, 0, 0, 145, 2269089, 411829, 303, 120, 1539926, 83915),
  row("2024-12", 387, 360152, 14351489, 0, 1377, 963498, 23165582, 0, 0, 180, 3519154, 1073428, 312, 133, 1831805, 109563),
  row("2025-01", 133, 515908, 8562173, 0, 911, 807742, 16231382, 0, 0, 176, 3590151, 1159270, 413, 151, 1936622, 111721),
  row("2025-02", 141, 447324, 11795437, 0, 1085, 876326, 18055421, 0, 0, 178, 3200153, 850562, 383, 137, 1686134, 82459),
  row("2025-03", 207, 633027, 14564948, 0, 1194, 827160, 23308724, 0, 0, 209, 3481302, 1200022, 390, 167, 1913461, 315469),
  row("2025-04", 208, 705464, 15765772, 0, 1122, 1493441, 28382416, 0, 0, 212, 3736412, 1032404, 268, 172, 2638643, 228500),
];

export function applyHistoricalLeagueSummaries(
  summaries: MonthlySummary[]
): MonthlySummary[] {
  const byMonth = new Map(summaries.map((summary) => [summary.month, summary]));

  for (const historicalRow of historicalLeagueSummaryRows) {
    if (!byMonth.has(historicalRow.month)) {
      byMonth.set(historicalRow.month, buildHistoricalMonthlySummary(historicalRow));
    }
  }

  return Array.from(byMonth.values()).sort((left, right) =>
    left.month.localeCompare(right.month)
  );
}

export function getPreviousYearMonth(month: string) {
  const [year, monthValue] = month.split("-");
  const numericYear = Number(year);

  if (!Number.isFinite(numericYear) || !monthValue) {
    return "";
  }

  return `${numericYear - 1}-${monthValue}`;
}

function buildHistoricalMonthlySummary(rowData: HistoricalLeagueSummaryRow) {
  const officialRow = {
    ...createOfficialMonthlyRow("IJL", 0),
    id: `history-summary-${rowData.month}-official`,
    playerName: "IJL公式合计",
    xTweetCount: String(rowData.officialTweetCount),
    xImpressions: String(rowData.officialImpressions),
    xEngagements: String(rowData.officialEngagements),
    xFollowerCount: String(rowData.officialFollowers),
    youtubeVideoPostCount: String(rowData.youtubeVideoPostCount),
    youtubeVideoViews: String(rowData.youtubeVideoViews),
    youtubeShortPostCount: String(rowData.youtubeShortPostCount),
    youtubeShortViews: String(rowData.youtubeShortViews),
    youtubeLikeCount: String(rowData.youtubeLikeCount),
    youtubeStreamCount: String(rowData.youtubeStreamCount),
    youtubeStreamViews: String(rowData.youtubeStreamViews),
    youtubeSubscriberCount: String(rowData.youtubeSubscriberCount),
  };
  const playerRow = {
    ...emptyMonthlyPlayerRow(1),
    id: `history-summary-${rowData.month}-players`,
    playerName: "IJL选手合计",
    xTweetCount: String(rowData.playerTweetCount),
    xImpressions: String(rowData.playerImpressions),
    xEngagements: String(rowData.playerEngagements),
    xFollowerCount: String(rowData.playerFollowers),
  };

  return buildMonthlySummary(rowData.month, [officialRow], [playerRow], 0);
}

function row(
  month: string,
  officialTweetCount: number,
  officialEngagements: number,
  officialImpressions: number,
  officialFollowers: number,
  playerTweetCount: number,
  playerEngagements: number,
  playerImpressions: number,
  playerFollowers: number,
  youtubeSubscriberCount: number,
  youtubeVideoPostCount: number,
  youtubeVideoViews: number,
  youtubeStreamViews: number,
  youtubeStreamCount: number,
  youtubeShortPostCount: number,
  youtubeShortViews: number,
  youtubeLikeCount: number
): HistoricalLeagueSummaryRow {
  return {
    month,
    officialTweetCount,
    officialEngagements,
    officialImpressions,
    officialFollowers,
    playerTweetCount,
    playerEngagements,
    playerImpressions,
    playerFollowers,
    youtubeSubscriberCount,
    youtubeVideoPostCount,
    youtubeVideoViews,
    youtubeStreamViews,
    youtubeStreamCount,
    youtubeShortPostCount,
    youtubeShortViews,
    youtubeLikeCount,
  };
}
