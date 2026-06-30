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
  row("2024-03", 361, 340513, 16058063, 116417, 1893, 786014, 28239651, 930830, 0, 0, 0, 0, 0, 0, 0, 0),
  row("2024-04", 363, 652212, 24997428, 126665, 1548, 1254161, 35173455, 968223, 384334, 181, 1935354, 324106, 119, 132, 1078070, 47932),
  row("2024-05", 365, 652174, 23511174, 131988, 1906, 1464032, 35976186, 901512, 407590, 81, 1976936, 844681, 261, 105, 1687334, 68778),
  row("2024-06", 402, 717198, 17809146, 134921, 2008, 1114038, 24276398, 902006, 338521, 142, 2610488, 660163, 244, 65, 856648, 33625),
  row("2024-07", 325, 411758, 17007142, 138460, 1111, 967428, 19694492, 917065, 399492, 158, 2724663, 1056264, 317, 207, 2914560, 172974),
  row("2024-08", 99, 192815, 5108257, 139784, 763, 579846, 11913897, 923083, 415770, 154, 1983949, 970959, 417, 141, 1608209, 157808),
  row("2024-09", 136, 262159, 9872863, 143854, 1031, 1061491, 33209481, 955689, 524598, 105, 1881444, 1018488, 403, 93, 1108224, 55850),
  row("2024-10", 173, 305163, 10018015, 145750, 1066, 1018487, 18914264, 979285, 452741, 102, 2519396, 866145, 382, 80, 690112, 33865),
  row("2024-11", 284, 715176, 13009169, 148935, 1129, 608474, 12294390, 953538, 478505, 145, 2269089, 411829, 303, 120, 1539926, 83915),
  row("2024-12", 387, 360152, 14351489, 154211, 1377, 963498, 23165582, 981244, 473970, 180, 3519154, 1073428, 312, 133, 1831805, 109563),
  row("2025-01", 133, 515908, 8562173, 154868, 911, 807742, 16231382, 981740, 468511, 176, 3590151, 1159270, 413, 151, 1936622, 111721),
  row("2025-02", 141, 447324, 11795437, 158055, 1085, 876326, 18055421, 1028166, 539966, 178, 3200153, 850562, 383, 137, 1686134, 82459),
  row("2025-03", 207, 633027, 14564948, 160831, 1194, 827160, 23308724, 1059804, 568397, 209, 3481302, 1200022, 390, 167, 1913461, 315469),
  row("2025-04", 208, 705464, 15765772, 169223, 1122, 1493441, 28382416, 1085834, 579538, 212, 3736412, 1032404, 268, 172, 2638643, 228500),
  row("2025-05", 216, 1458453, 32520595, 197776, 1425, 3776982, 67356957, 1085896, 641734, 95, 1562190, 1562190, 344, 97, 3724633, 143749),
  row("2025-06", 412, 1341424, 18213188, 207158, 1570, 1658959, 36094122, 1111123, 648341, 97, 924424, 924424, 345, 147, 3995987, 97168),
  row("2025-07", 521, 1371097, 24733410, 205945, 1924, 2353441, 42615309, 1153524, 649397, 96, 1029042, 1069723, 342, 137, 2921795, 93937),
  row("2025-08", 351, 953548, 15930806, 209124, 1176, 1672449, 29205472, 1160559, 679022, 116, 808012, 1162367, 464, 121, 2783655, 82510),
  row("2025-09", 233, 829074, 15274676, 213679, 1450, 2133720, 33738017, 1196445, 714472, 111, 782958, 1110362, 456, 275, 2520431, 66494),
  row("2025-10", 253, 612632, 14453201, 241518, 1302, 1582613, 29941885, 1179916, 718985, 78, 670235, 1155696, 469, 123, 1814278, 56519),
  row("2025-11", 443, 625099, 16781057, 242716, 1397, 1480239, 29330026, 1173043, 720834, 59, 820571, 894410, 367, 159, 3763289, 112420),
  row("2025-12", 475, 1263413, 21513405, 249964, 1438, 2943315, 36736630, 1206891, 734221, 76, 1137411, 1657453, 390, 126, 3464164, 108963),
  row("2026-01", 174, 463229, 10606914, 251112, 1512, 1570538, 23519700, 1211532, 746978, 66, 874343, 1424326, 624, 145, 3261349, 89779),
  row("2026-02", 207, 867451, 17792001, 252915, 1413, 1330887, 25438827, 1237273, 753855, 79, 821952, 1549029, 441, 125, 2572375, 73335),
  row("2026-03", 251, 516386, 10438036, 256475, 1364, 3320572, 33235051, 1255416, 744994, 53, 585107, 931951, 418, 128, 3685317, 69284),
  row("2026-04", 359, 2383477, 20433849, 270072, 1233, 2311512, 37116401, 1318540, 760963, 74, 739989, 543636, 341, 138, 3229762, 87167),
  row("2026-05", 274, 424831, 20843352, 275881, 1340, 1365094, 37154708, 1178043, 706909, 73, 1002058, 1192139, 432, 113, 1835121, 56079),
];

export function applyHistoricalLeagueSummaries(
  summaries: MonthlySummary[]
): MonthlySummary[] {
  const byMonth = new Map(summaries.map((summary) => [summary.month, summary]));

  for (const historicalRow of historicalLeagueSummaryRows) {
    byMonth.set(historicalRow.month, buildHistoricalMonthlySummary(historicalRow));
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
