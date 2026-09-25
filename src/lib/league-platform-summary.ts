import { formatMonthLabel } from "./monthly-data";
import {
  combineMonthlySummariesForPeriod,
  formatMonthlyPercent,
  type MonthlySummary,
} from "./monthly-summary";
import { getTiktokMonthlyRows, type TiktokMonthlyRow } from "./tiktok-monthly-data";

export type LeagueTiktokMetrics = {
  followerCount: number | null;
  postCount: number | null;
  videoViews: number | null;
  likeCount: number | null;
  streamViews: number | null;
  streamCount: number | null;
};

export type LeagueMonthlySummary = MonthlySummary & {
  tiktok: LeagueTiktokMetrics;
};

const tiktokMetricKeys = [
  "followerCount", "postCount", "videoViews", "likeCount", "streamViews", "streamCount",
] as const;

function completeSum(values: Array<number | null | undefined>): number | null {
  if (!values.length || values.some((value) => value == null || !Number.isFinite(value))) {
    return null;
  }
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function withLeagueTiktok(
  summary: MonthlySummary,
  rows: TiktokMonthlyRow[] = getTiktokMonthlyRows(summary.month)
): LeagueMonthlySummary {
  const monthRows = rows.filter((row) => row.month === summary.month);
  const tiktok = Object.fromEntries(
    tiktokMetricKeys.map((key) => [key, completeSum(monthRows.map((row) => row[key]))])
  ) as LeagueTiktokMetrics;
  return { ...summary, tiktok };
}

export function combineLeagueSummariesForPeriod(
  month: string,
  summaries: LeagueMonthlySummary[],
  submissionCount?: number
): LeagueMonthlySummary {
  const latest = [...summaries].sort((a, b) => a.month.localeCompare(b.month)).at(-1);
  // Missing months stay unknown; follower counts are the last month's snapshot.
  const tiktok = Object.fromEntries(tiktokMetricKeys.map((key) => [
    key,
    key === "followerCount"
      ? latest?.tiktok.followerCount ?? null
      : completeSum(summaries.map((summary) => summary.tiktok[key])),
  ])) as LeagueTiktokMetrics;
  return {
    ...combineMonthlySummariesForPeriod(month, summaries, submissionCount),
    tiktok,
  };
}

type LeagueColumn = {
  key: string;
  label: string;
  width: number;
  value: (row: LeagueMonthlySummary) => string | number | null;
};

// One column order for the admin table and its Excel export.
export const leagueSummaryColumns: LeagueColumn[] = [
  { key: "month", label: "月份", width: 16, value: (row) => formatMonthLabel(row.month) },
  { key: "officialTweets", label: "官推条数", width: 12, value: (row) => row.official.xTweetCount },
  { key: "officialEngagements", label: "官推互动量", width: 16, value: (row) => row.official.xEngagements },
  { key: "officialImpressions", label: "官推阅读量", width: 16, value: (row) => row.official.xImpressions },
  { key: "officialRate", label: "互动率", width: 12, value: (row) => formatMonthlyPercent(row.official.xEngagementRate) },
  { key: "officialFollowers", label: "官方粉丝数", width: 14, value: (row) => row.official.xFollowerCount },
  { key: "playerTweets", label: "选手推条数", width: 14, value: (row) => row.players.xTweetCount },
  { key: "playerEngagements", label: "互动量", width: 16, value: (row) => row.players.xEngagements },
  { key: "playerImpressions", label: "阅读量", width: 16, value: (row) => row.players.xImpressions },
  { key: "playerRate", label: "互动率", width: 12, value: (row) => formatMonthlyPercent(row.players.xEngagementRate) },
  { key: "playerFollowers", label: "选手粉丝数", width: 14, value: (row) => row.players.xFollowerCount },
  { key: "ytFollowers", label: "YT 登録者", width: 14, value: (row) => row.total.youtubeSubscriberCount },
  { key: "ttFollowers", label: "TT 登録者", width: 14, value: (row) => row.tiktok.followerCount },
  { key: "ytPosts", label: "投稿数量（YT）", width: 20, value: (row) => row.total.youtubeTotalPostCount },
  { key: "ytViews", label: "视频播放次数（YT）", width: 24, value: (row) => row.total.youtubeVideoViews },
  { key: "ytStreamViews", label: "直播观看次数（YT）", width: 24, value: (row) => row.total.youtubeStreamViews },
  { key: "ytStreams", label: "直播次数（YT）", width: 20, value: (row) => row.total.youtubeStreamCount },
  { key: "ttStreamViews", label: "直播观看次数（TT）", width: 24, value: (row) => row.tiktok.streamViews },
  { key: "ttStreams", label: "直播次数（TT）", width: 20, value: (row) => row.tiktok.streamCount },
  { key: "ytShortPosts", label: "短视频投稿（YT）", width: 22, value: (row) => row.total.youtubeShortPostCount },
  { key: "ytShortViews", label: "短视频播放（YT）", width: 22, value: (row) => row.total.youtubeShortViews },
  { key: "ytLikes", label: "点赞量（YT）", width: 24, value: (row) => row.total.youtubeLikeCount },
  { key: "ttPosts", label: "短视频投稿（TT）", width: 22, value: (row) => row.tiktok.postCount },
  { key: "ttViews", label: "短视频播放（TT）", width: 22, value: (row) => row.tiktok.videoViews },
  { key: "ttLikes", label: "短视频点赞量（TT）", width: 24, value: (row) => row.tiktok.likeCount },
];

export type LeagueMetric = {
  label: string;
  value: (row: LeagueMonthlySummary) => number | null;
};

export const leaguePeriodMetrics: LeagueMetric[] = [
  { label: "总条数", value: (row) => row.total.xTweetCount },
  { label: "总曝光", value: (row) => row.total.xImpressions },
  { label: "总互动", value: (row) => row.total.xEngagements },
  { label: "视频播放合计（YT）", value: (row) => row.total.youtubeVideoViews },
  { label: "短视频播放合计（YT）", value: (row) => row.total.youtubeShortViews },
  { label: "短视频播放合计（TT）", value: (row) => row.tiktok.videoViews },
  { label: "直播观看合计（YT）", value: (row) => row.total.youtubeStreamViews },
  { label: "直播次数合计（YT）", value: (row) => row.total.youtubeStreamCount },
  { label: "直播观看合计（TT）", value: (row) => row.tiktok.streamViews },
  { label: "直播次数合计（TT）", value: (row) => row.tiktok.streamCount },
  { label: "合计播放数（YT）", value: (row) => row.total.youtubeTotalPlayback },
  { label: "合计播放数（TT）", value: (row) => completeSum([row.tiktok.videoViews, row.tiktok.streamViews]) },
];

export const leagueComparisonMetrics: LeagueMetric[] = [
  { label: "X 总推文", value: (row) => row.total.xTweetCount },
  { label: "X 总曝光", value: (row) => row.total.xImpressions },
  { label: "X 总互动", value: (row) => row.total.xEngagements },
  { label: "视频播放（YT）", value: (row) => row.total.youtubeVideoViews },
  { label: "短视频播放（YT）", value: (row) => row.total.youtubeShortViews },
  { label: "直播观看（YT）", value: (row) => row.total.youtubeStreamViews },
  { label: "直播次数（YT）", value: (row) => row.total.youtubeStreamCount },
  { label: "YT 登録者", value: (row) => row.total.youtubeSubscriberCount },
  { label: "短视频播放（TT）", value: (row) => row.tiktok.videoViews },
  { label: "直播观看（TT）", value: (row) => row.tiktok.streamViews },
  { label: "直播次数（TT）", value: (row) => row.tiktok.streamCount },
  { label: "TT 登録者", value: (row) => row.tiktok.followerCount },
];

export function formatLeagueComparison(current: number | null, previous?: number | null) {
  if (current === null || !previous) return "-";
  const change = (current - previous) / previous;
  return `${change > 0 ? "+" : ""}${(change * 100).toFixed(1)}%`;
}
