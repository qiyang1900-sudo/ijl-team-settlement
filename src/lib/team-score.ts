import {
  formatMonthlyNumber,
  numericMonthlyValue,
  parseMonthlyPlayerRows,
  splitMonthlyRows,
} from "./monthly-data";
import type { MonthlyPlayerRow } from "./monthly-data";
import { buildMonthlySummary } from "./monthly-summary";
import { getTiktokMonthlySummary } from "./tiktok-monthly-data";

export type TeamScoreTeam = {
  id: string;
  name: string | null;
  short_name: string | null;
  is_active?: boolean | null;
};

export type TeamScoreSubmission = {
  team_id: string;
  target_month: string;
  status: string | null;
  player_rows: unknown;
};

export type TeamScoreReviewStatus = "draft" | "finalized";

export type TeamScoreReview = {
  team_id: string;
  target_month: string;
  status?: string | null;
  player_management_score?: number | string | null;
  player_management_note?: string | null;
  team_management_score?: number | string | null;
  team_management_note?: string | null;
  youtube_manual_deduction?: number | string | null;
  youtube_manual_note?: string | null;
  tiktok_manual_deduction?: number | string | null;
  tiktok_manual_note?: string | null;
  x_manual_deduction?: number | string | null;
  x_manual_note?: string | null;
  reviewer_note?: string | null;
  finalized_score?: number | string | null;
  finalized_grade?: string | null;
  finalized_at?: string | null;
};

export type TeamScoreDeduction = {
  reason: string;
  points: number;
};

export type TeamScoreSectionKey =
  | "playerManagement"
  | "teamManagement"
  | "youtube"
  | "tiktok"
  | "x";

export type TeamScoreSection = {
  key: TeamScoreSectionKey;
  label: string;
  maxPoints: number;
  score: number;
  autoScore: number | null;
  deductions: TeamScoreDeduction[];
  note: string | null;
};

export type TeamScoreReviewValues = {
  status: TeamScoreReviewStatus;
  playerManagementScore: number;
  playerManagementNote: string;
  teamManagementScore: number;
  teamManagementNote: string;
  youtubeScore: number | null;
  youtubeManualDeduction: number;
  youtubeManualNote: string;
  tiktokScore: number | null;
  tiktokManualDeduction: number;
  tiktokManualNote: string;
  xScore: number | null;
  xManualDeduction: number;
  xManualNote: string;
  reviewerNote: string;
  finalizedAt: string | null;
};

export type TeamMonthlyScore = {
  teamId: string;
  teamName: string;
  shortName: string;
  month: string;
  score: number;
  grade: string;
  displayScore: string;
  deductions: TeamScoreDeduction[];
  sections: TeamScoreSection[];
  review: TeamScoreReviewValues;
  metrics: {
    totalTweets: number;
    totalImpressions: number;
    officialTweets: number;
    officialVideoPosts: number;
    playerVideoPosters: number;
    playerStreamers: number;
    totalStreams: number;
    totalVideosWithArchives: number;
    totalShortPosts: number;
    youtubeShortPosts: number;
    tiktokShortPosts: number;
  };
  hasApprovedData: boolean;
};

export const manualTeamScoreNotes = [
  "選手管理和チーム管理默认按满分录入，管理员可以直接修改最终分数并保存。",
  "YouTube、TikTok / Shorts、X 会先自动计算分数，管理员可在上方卡片直接改为最终确认分数。",
  "TikTok / Shorts 使用 YouTube Shorts 投稿数 + TT 投稿数合并判断。",
  "YouTube 30分、TikTok / Shorts 15分、X 15分分别封顶计算，单项不会扣成负分。",
  "自动计算只使用审核通过的月数据；未审核通过的草稿、已提交、审核中、已驳回数据不会进入积分。",
  "审核备注用于记录整体人工核查说明。",
];

export const sectionScoreOverrideMarker = "__section_score_override__";

const sectionMaximums = {
  playerManagement: 15,
  teamManagement: 25,
  youtube: 30,
  tiktok: 15,
  x: 15,
} as const;

export function buildTeamMonthlyScores(
  teams: TeamScoreTeam[],
  submissions: TeamScoreSubmission[],
  month: string,
  reviews: TeamScoreReview[] = []
): TeamMonthlyScore[] {
  const submissionsByTeam = new Map<string, TeamScoreSubmission[]>();
  const reviewsByTeam = new Map<string, TeamScoreReview>();

  for (const submission of submissions) {
    if (submission.target_month !== month || submission.status !== "approved") {
      continue;
    }

    submissionsByTeam.set(submission.team_id, [
      ...(submissionsByTeam.get(submission.team_id) || []),
      submission,
    ]);
  }

  for (const review of reviews) {
    if (review.target_month === month) {
      reviewsByTeam.set(review.team_id, review);
    }
  }

  return [...teams]
    .sort((left, right) =>
      getTeamShortName(left).localeCompare(getTeamShortName(right))
    )
    .map((team) =>
      calculateTeamMonthlyScore(
        team,
        submissionsByTeam.get(team.id) || [],
        month,
        reviewsByTeam.get(team.id)
      )
    );
}

function calculateTeamMonthlyScore(
  team: TeamScoreTeam,
  submissions: TeamScoreSubmission[],
  month: string,
  review: TeamScoreReview | undefined
): TeamMonthlyScore {
  const teamName = team.name || getTeamShortName(team);
  const shortName = getTeamShortName(team);
  const reviewValues = normalizeReviewValues(review);

  if (submissions.length === 0) {
    const sections = buildEmptySections(reviewValues);

    return {
      teamId: team.id,
      teamName,
      shortName,
      month,
      score: 0,
      grade: "未提交",
      displayScore: "0（未提交）",
      deductions: [{ reason: "该月没有审核通过月数据", points: 100 }],
      sections,
      review: reviewValues,
      metrics: emptyMetrics(),
      hasApprovedData: false,
    };
  }

  const officialRows: MonthlyPlayerRow[] = [];
  const playerRows: MonthlyPlayerRow[] = [];

  for (const submission of submissions) {
    const rows = parseMonthlyPlayerRows(submission.player_rows);
    const splitRows = splitMonthlyRows(rows);

    if (splitRows.officialRow) {
      officialRows.push(splitRows.officialRow);
    }

    playerRows.push(...splitRows.playerRows);
  }

  const summary = buildMonthlySummary(month, officialRows, playerRows, submissions.length);
  const tiktokSummary = getTiktokMonthlySummary(month, shortName);
  const youtubeShortPosts = summary.total.youtubeShortPostCount;
  const tiktokShortPosts = tiktokSummary.total.postCount;
  const metrics = {
    totalTweets: summary.total.xTweetCount,
    totalImpressions: summary.total.xImpressions,
    officialTweets: summary.official.xTweetCount,
    officialVideoPosts: summary.official.youtubeVideoPostCount,
    playerVideoPosters: playerRows.filter(
      (row) => numericMonthlyValue(row.youtubeVideoPostCount) > 0
    ).length,
    playerStreamers: playerRows.filter(
      (row) => numericMonthlyValue(row.youtubeStreamCount) > 0
    ).length,
    totalStreams: summary.total.youtubeStreamCount,
    totalVideosWithArchives:
      summary.total.youtubeVideoPostCount +
      summary.total.youtubeShortPostCount +
      summary.total.youtubeStreamCount,
    totalShortPosts: youtubeShortPosts + tiktokShortPosts,
    youtubeShortPosts,
    tiktokShortPosts,
  };

  const sections = buildSections(metrics, reviewValues);
  const deductions = sections.flatMap((section) => section.deductions);
  const score = sections.reduce((sum, section) => sum + section.score, 0);
  const grade = getScoreGrade(score);

  return {
    teamId: team.id,
    teamName,
    shortName,
    month,
    score,
    grade,
    displayScore: `${score}（${grade}）`,
    deductions,
    sections,
    review: reviewValues,
    metrics,
    hasApprovedData: true,
  };
}

function buildSections(
  metrics: TeamMonthlyScore["metrics"],
  review: TeamScoreReviewValues
): TeamScoreSection[] {
  const youtubeAutoDeductions = buildYoutubeDeductions(metrics);
  const tiktokAutoDeductions = buildTiktokDeductions(metrics);
  const xAutoDeductions = buildXDeductions(metrics);

  const youtube = buildContentSection({
    key: "youtube",
    label: "YouTube",
    maxPoints: sectionMaximums.youtube,
    autoDeductions: youtubeAutoDeductions,
    scoreOverride: review.youtubeScore,
  });
  const tiktok = buildContentSection({
    key: "tiktok",
    label: "TikTok / Shorts",
    maxPoints: sectionMaximums.tiktok,
    autoDeductions: tiktokAutoDeductions,
    scoreOverride: review.tiktokScore,
  });
  const x = buildContentSection({
    key: "x",
    label: "X",
    maxPoints: sectionMaximums.x,
    autoDeductions: xAutoDeductions,
    scoreOverride: review.xScore,
  });

  return [
    buildManualSection({
      key: "playerManagement",
      label: "選手管理",
      maxPoints: sectionMaximums.playerManagement,
      score: review.playerManagementScore,
      note: "",
    }),
    buildManualSection({
      key: "teamManagement",
      label: "チーム管理",
      maxPoints: sectionMaximums.teamManagement,
      score: review.teamManagementScore,
      note: "",
    }),
    youtube,
    tiktok,
    x,
  ];
}

function buildManualSection({
  key,
  label,
  maxPoints,
  score,
  note,
}: {
  key: TeamScoreSectionKey;
  label: string;
  maxPoints: number;
  score: number;
  note: string;
}): TeamScoreSection {
  const safeScore = clampNumber(score, 0, maxPoints);
  const deductedPoints = maxPoints - safeScore;

  return {
    key,
    label,
    maxPoints,
    score: safeScore,
    autoScore: null,
    note: note || null,
    deductions:
      deductedPoints > 0
        ? [
            {
              reason: `${label}人工确认扣分${note ? `：${note}` : ""}`,
              points: deductedPoints,
            },
          ]
        : [],
  };
}

function buildContentSection({
  key,
  label,
  maxPoints,
  autoDeductions,
  scoreOverride,
}: {
  key: TeamScoreSectionKey;
  label: string;
  maxPoints: number;
  autoDeductions: TeamScoreDeduction[];
  scoreOverride: number | null;
}): TeamScoreSection {
  const cappedAutoDeduction = Math.min(
    maxPoints,
    autoDeductions.reduce((sum, deduction) => sum + deduction.points, 0)
  );
  const autoScore = Math.max(0, maxPoints - cappedAutoDeduction);
  const score =
    scoreOverride === null
      ? autoScore
      : clampNumber(scoreOverride, 0, maxPoints);
  const deductions = [...autoDeductions];
  const manualDeduction = Math.max(0, autoScore - score);

  if (manualDeduction > 0) {
    deductions.push({
      reason: `${label}人工确认调整（自动${autoScore}分 → 确认${score}分）`,
      points: manualDeduction,
    });
  }

  return {
    key,
    label,
    maxPoints,
    score,
    autoScore,
    deductions,
    note: null,
  };
}

function buildYoutubeDeductions(metrics: TeamMonthlyScore["metrics"]) {
  const deductions: TeamScoreDeduction[] = [];

  if (metrics.officialVideoPosts < 1) {
    deductions.push({
      reason: `チーム公式／部門アカウントの動画投稿未達（${formatMonthlyNumber(
        metrics.officialVideoPosts
      )}）`,
      points: 10,
    });
  }

  if (metrics.playerVideoPosters < 2 || metrics.totalVideosWithArchives < 22) {
    deductions.push({
      reason: `動画制作基準未達（2名以上選手投稿 ${formatMonthlyNumber(
        metrics.playerVideoPosters
      )}名 / 全体22本 ${formatMonthlyNumber(metrics.totalVideosWithArchives)}本）`,
      points: 10,
    });
  }

  if (metrics.playerStreamers < 3 || metrics.totalStreams < 20) {
    deductions.push({
      reason: `YouTube配信基準未達（3名以上配信 ${formatMonthlyNumber(
        metrics.playerStreamers
      )}名 / 全体20回 ${formatMonthlyNumber(metrics.totalStreams)}回）`,
      points: 10,
    });
  }

  return deductions;
}

function buildTiktokDeductions(metrics: TeamMonthlyScore["metrics"]) {
  const deductions: TeamScoreDeduction[] = [];

  if (metrics.totalShortPosts < 5) {
    deductions.push({
      reason: `ショート／TikTok投稿5本未満（YouTube Shorts ${formatMonthlyNumber(
        metrics.youtubeShortPosts
      )}本 + TikTok ${formatMonthlyNumber(metrics.tiktokShortPosts)}本 = ${formatMonthlyNumber(
        metrics.totalShortPosts
      )}本）`,
      points: 10,
    });
  }

  return deductions;
}

function buildXDeductions(metrics: TeamMonthlyScore["metrics"]) {
  const deductions: TeamScoreDeduction[] = [];

  if (metrics.totalTweets < 170 && metrics.totalImpressions < 4_000_000) {
    deductions.push({
      reason: `全チーム月ツイート170未満／400万Imp未満（${formatMonthlyNumber(
        metrics.totalTweets
      )} / ${formatMonthlyNumber(metrics.totalImpressions)}）`,
      points: 10,
    });
  }

  if (metrics.officialTweets < 15) {
    deductions.push({
      reason: `チーム公式アカウント月15本以上投稿未満（${formatMonthlyNumber(
        metrics.officialTweets
      )}）`,
      points: 5,
    });
  }

  return deductions;
}

function getScoreGrade(score: number) {
  if (score >= 90) {
    return "S";
  }

  if (score >= 85) {
    return "A";
  }

  if (score >= 75) {
    return "B";
  }

  if (score >= 65) {
    return "C";
  }

  return "D";
}

function normalizeReviewValues(
  review: TeamScoreReview | undefined
): TeamScoreReviewValues {
  return {
    status: review?.status === "finalized" ? "finalized" : "draft",
    playerManagementScore: boundedReviewNumber(
      review?.player_management_score,
      sectionMaximums.playerManagement,
      sectionMaximums.playerManagement
    ),
    playerManagementNote: "",
    teamManagementScore: boundedReviewNumber(
      review?.team_management_score,
      sectionMaximums.teamManagement,
      sectionMaximums.teamManagement
    ),
    teamManagementNote: "",
    youtubeScore: scoreOverrideFromStoredDeduction(
      review?.youtube_manual_note,
      review?.youtube_manual_deduction,
      sectionMaximums.youtube
    ),
    youtubeManualDeduction: boundedReviewNumber(
      review?.youtube_manual_deduction,
      0,
      sectionMaximums.youtube
    ),
    youtubeManualNote: "",
    tiktokScore: scoreOverrideFromStoredDeduction(
      review?.tiktok_manual_note,
      review?.tiktok_manual_deduction,
      sectionMaximums.tiktok
    ),
    tiktokManualDeduction: boundedReviewNumber(
      review?.tiktok_manual_deduction,
      0,
      sectionMaximums.tiktok
    ),
    tiktokManualNote: "",
    xScore: scoreOverrideFromStoredDeduction(
      review?.x_manual_note,
      review?.x_manual_deduction,
      sectionMaximums.x
    ),
    xManualDeduction: boundedReviewNumber(
      review?.x_manual_deduction,
      0,
      sectionMaximums.x
    ),
    xManualNote: "",
    reviewerNote: String(review?.reviewer_note || ""),
    finalizedAt: review?.finalized_at || null,
  };
}

function scoreOverrideFromStoredDeduction(
  note: string | null | undefined,
  deduction: number | string | null | undefined,
  maxValue: number
) {
  if (note !== sectionScoreOverrideMarker) {
    return null;
  }

  return maxValue - boundedReviewNumber(deduction, 0, maxValue);
}

function boundedReviewNumber(
  value: number | string | null | undefined,
  defaultValue: number,
  maxValue: number
) {
  const rawValue = String(value ?? "").trim();

  if (!rawValue) {
    return defaultValue;
  }

  return clampNumber(Number(rawValue), 0, maxValue);
}

function buildEmptySections(review: TeamScoreReviewValues): TeamScoreSection[] {
  return [
    {
      key: "playerManagement",
      label: "選手管理",
      maxPoints: sectionMaximums.playerManagement,
      score: 0,
      autoScore: null,
      deductions: [{ reason: "该月没有审核通过月数据", points: sectionMaximums.playerManagement }],
      note: review.playerManagementNote || null,
    },
    {
      key: "teamManagement",
      label: "チーム管理",
      maxPoints: sectionMaximums.teamManagement,
      score: 0,
      autoScore: null,
      deductions: [{ reason: "该月没有审核通过月数据", points: sectionMaximums.teamManagement }],
      note: review.teamManagementNote || null,
    },
    {
      key: "youtube",
      label: "YouTube",
      maxPoints: sectionMaximums.youtube,
      score: 0,
      autoScore: 0,
      deductions: [{ reason: "该月没有审核通过月数据", points: sectionMaximums.youtube }],
      note: review.youtubeManualNote || null,
    },
    {
      key: "tiktok",
      label: "TikTok / Shorts",
      maxPoints: sectionMaximums.tiktok,
      score: 0,
      autoScore: 0,
      deductions: [{ reason: "该月没有审核通过月数据", points: sectionMaximums.tiktok }],
      note: review.tiktokManualNote || null,
    },
    {
      key: "x",
      label: "X",
      maxPoints: sectionMaximums.x,
      score: 0,
      autoScore: 0,
      deductions: [{ reason: "该月没有审核通过月数据", points: sectionMaximums.x }],
      note: review.xManualNote || null,
    },
  ];
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function emptyMetrics(): TeamMonthlyScore["metrics"] {
  return {
    totalTweets: 0,
    totalImpressions: 0,
    officialTweets: 0,
    officialVideoPosts: 0,
    playerVideoPosters: 0,
    playerStreamers: 0,
    totalStreams: 0,
    totalVideosWithArchives: 0,
    totalShortPosts: 0,
    youtubeShortPosts: 0,
    tiktokShortPosts: 0,
  };
}

function getTeamShortName(team: TeamScoreTeam) {
  return String(team.short_name || team.name || "-").trim() || "-";
}
