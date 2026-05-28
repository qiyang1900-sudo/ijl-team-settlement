import {
  formatMonthLabel,
  formatMonthlyNumber,
  parseMonthlyPlayerRows,
  splitMonthlyRows,
} from "./monthly-data";
import {
  MonthlyAccountSummary,
  MonthlySummary,
  buildMonthlySummary,
} from "./monthly-summary";

export type MonthlyReviewSubmission = {
  id?: string | null;
  team_id: string | null;
  target_month: string;
  status: string | null;
  player_rows: unknown;
};

export type MonthlyReviewAlert = {
  metric: string;
  currentValue: number;
  baselineValue: number;
  changePercent: number | null;
  level: "warning" | "danger";
  message: string;
  basisLabel: string;
  thresholdLabel: string;
};

type AlertMetric = {
  key: keyof MonthlyAccountSummary;
  label: string;
  group: "volume" | "count" | "stock";
  basis: "average" | "latest";
};

const reviewAlertMetrics: AlertMetric[] = [
  { key: "xImpressions", label: "X インプレッション", group: "volume", basis: "average" },
  { key: "xEngagements", label: "X エンゲージメント", group: "volume", basis: "average" },
  { key: "youtubeVideoViews", label: "動画視聴", group: "volume", basis: "average" },
  { key: "youtubeShortViews", label: "ショート視聴", group: "volume", basis: "average" },
  { key: "youtubeStreamViews", label: "配信視聴", group: "volume", basis: "average" },
  { key: "youtubeTotalImpressions", label: "YouTube 合計Imp", group: "volume", basis: "average" },
  { key: "youtubeLikeCount", label: "いいね", group: "volume", basis: "average" },
  { key: "youtubeTotalPlayback", label: "YouTube 合計播放", group: "volume", basis: "average" },
  { key: "xTweetCount", label: "X 投稿数", group: "count", basis: "average" },
  { key: "xFanEventCount", label: "ファンイベント回数", group: "count", basis: "average" },
  { key: "youtubeVideoPostCount", label: "動画投稿数", group: "count", basis: "average" },
  { key: "youtubeShortPostCount", label: "ショート投稿数", group: "count", basis: "average" },
  { key: "youtubeStreamCount", label: "配信回数", group: "count", basis: "average" },
  { key: "xFollowerCount", label: "X フォロワー", group: "stock", basis: "latest" },
  { key: "youtubeSubscriberCount", label: "YouTube 登録者", group: "stock", basis: "latest" },
];

const thresholds = {
  volume: { up: 1.5, down: -0.8, label: "上浮 +150% / 下滑 -80%" },
  count: { up: 1, down: -0.7, label: "上浮 +100% / 下滑 -70%" },
  stock: { up: 0.25, down: -0.25, label: "变化 ±25%" },
} as const;

export function buildMonthlyReviewAlerts(
  submission: MonthlyReviewSubmission,
  allSubmissions: MonthlyReviewSubmission[]
): MonthlyReviewAlert[] {
  const teamId = String(submission.team_id || "");
  const targetMonth = String(submission.target_month || "").slice(0, 7);

  if (!teamId || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    return [];
  }

  const previousSubmissions = allSubmissions
    .filter((row) => String(row.team_id || "") === teamId)
    .filter((row) => row.status === "approved")
    .filter((row) => String(row.target_month || "").slice(0, 7) < targetMonth)
    .sort((left, right) =>
      String(right.target_month || "").localeCompare(String(left.target_month || ""))
    )
    .slice(0, 3)
    .sort((left, right) =>
      String(left.target_month || "").localeCompare(String(right.target_month || ""))
    );

  if (previousSubmissions.length === 0) {
    return [];
  }

  const currentSummary = buildSubmissionSummary(submission);
  const previousSummaries = previousSubmissions.map(buildSubmissionSummary);

  return reviewAlertMetrics
    .map((metric) => buildMetricAlert(metric, currentSummary, previousSummaries))
    .filter((alert): alert is MonthlyReviewAlert => Boolean(alert));
}

function buildMetricAlert(
  metric: AlertMetric,
  currentSummary: MonthlySummary,
  previousSummaries: MonthlySummary[]
): MonthlyReviewAlert | null {
  const currentValue = currentSummary.total[metric.key];
  const previousValues = previousSummaries.map((summary) => summary.total[metric.key]);
  const previousPositiveValues = previousValues.filter((value) => value > 0);

  if (currentValue === 0 && previousPositiveValues.length > 0) {
    const baselineValue = getBaselineValue(metric, previousValues);

    return {
      metric: metric.label,
      currentValue,
      baselineValue,
      changePercent: null,
      level: "danger",
      message: "当月为 0，前三个月有数据，请人工确认是否漏填。",
      basisLabel: getBasisLabel(metric, previousSummaries),
      thresholdLabel: "当月为0触发",
    };
  }

  const baselineValue = getBaselineValue(metric, previousValues);

  if (baselineValue <= 0) {
    return null;
  }

  const changePercent = (currentValue - baselineValue) / baselineValue;
  const threshold = thresholds[metric.group];

  if (changePercent >= threshold.up) {
    return {
      metric: metric.label,
      currentValue,
      baselineValue,
      changePercent,
      level: metric.group === "stock" ? "danger" : "warning",
      message: `较${getBasisLabel(metric, previousSummaries)}上浮 ${formatAlertPercent(
        changePercent
      )}，建议人工确认。`,
      basisLabel: getBasisLabel(metric, previousSummaries),
      thresholdLabel: threshold.label,
    };
  }

  if (changePercent <= threshold.down) {
    return {
      metric: metric.label,
      currentValue,
      baselineValue,
      changePercent,
      level: "danger",
      message: `较${getBasisLabel(metric, previousSummaries)}下滑 ${formatAlertPercent(
        Math.abs(changePercent)
      )}，建议人工确认。`,
      basisLabel: getBasisLabel(metric, previousSummaries),
      thresholdLabel: threshold.label,
    };
  }

  return null;
}

function buildSubmissionSummary(submission: MonthlyReviewSubmission) {
  const { officialRow, playerRows } = splitMonthlyRows(
    parseMonthlyPlayerRows(submission.player_rows)
  );

  return buildMonthlySummary(
    String(submission.target_month || "").slice(0, 7),
    officialRow ? [officialRow] : [],
    playerRows,
    1
  );
}

function getBaselineValue(metric: AlertMetric, previousValues: number[]) {
  if (metric.basis === "latest") {
    return [...previousValues].reverse().find((value) => value > 0) || 0;
  }

  return average(previousValues);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getBasisLabel(metric: AlertMetric, summaries: MonthlySummary[]) {
  if (metric.basis === "latest") {
    const latest = [...summaries]
      .reverse()
      .find((summary) => summary.total[metric.key] > 0);

    return latest ? `${formatMonthLabel(latest.month)}数值` : "前三个月最近数值";
  }

  const monthRange = summaries
    .map((summary) => formatMonthLabel(summary.month))
    .join(" / ");

  return `前三个月平均（${monthRange}）`;
}

export function formatAlertPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatAlertNumber(value: number) {
  return formatMonthlyNumber(Math.round(value));
}
