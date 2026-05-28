import {
  formatMonthlyNumber,
  numericMonthlyValue,
  parseMonthlyPlayerRows,
  splitMonthlyRows,
} from "./monthly-data";
import type { MonthlyPlayerRow } from "./monthly-data";
import { buildMonthlySummary } from "./monthly-summary";

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

export type TeamScoreDeduction = {
  reason: string;
  points: number;
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
  };
  hasApprovedData: boolean;
};

export const manualTeamScoreNotes = [
  "选手简介格式统一、指定投稿转发、视频内容质量、官方指定主题、直播时长40小时、TikTok账号开设这些项目目前没有表单字段，先作为人工确认项。",
  "自动计算只使用审核通过的月数据；未审核通过的草稿、已提交、审核中、已驳回数据不会进入积分。",
];

export function buildTeamMonthlyScores(
  teams: TeamScoreTeam[],
  submissions: TeamScoreSubmission[],
  month: string
): TeamMonthlyScore[] {
  const submissionsByTeam = new Map<string, TeamScoreSubmission[]>();

  for (const submission of submissions) {
    if (submission.target_month !== month || submission.status !== "approved") {
      continue;
    }

    submissionsByTeam.set(submission.team_id, [
      ...(submissionsByTeam.get(submission.team_id) || []),
      submission,
    ]);
  }

  return [...teams]
    .sort((left, right) =>
      getTeamShortName(left).localeCompare(getTeamShortName(right))
    )
    .map((team) =>
      calculateTeamMonthlyScore(
        team,
        submissionsByTeam.get(team.id) || [],
        month
      )
    );
}

function calculateTeamMonthlyScore(
  team: TeamScoreTeam,
  submissions: TeamScoreSubmission[],
  month: string
): TeamMonthlyScore {
  const teamName = team.name || getTeamShortName(team);
  const shortName = getTeamShortName(team);

  if (submissions.length === 0) {
    return {
      teamId: team.id,
      teamName,
      shortName,
      month,
      score: 0,
      grade: "未提交",
      displayScore: "0（未提交）",
      deductions: [{ reason: "该月没有审核通过月数据", points: 100 }],
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
    totalShortPosts: summary.total.youtubeShortPostCount,
  };
  const deductions = buildDeductions(metrics);
  const score = Math.max(
    0,
    100 - deductions.reduce((sum, deduction) => sum + deduction.points, 0)
  );
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
    metrics,
    hasApprovedData: true,
  };
}

function buildDeductions(metrics: TeamMonthlyScore["metrics"]) {
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
      reason: `チームアカウントで月15本以上ツイート未満（${formatMonthlyNumber(
        metrics.officialTweets
      )}）`,
      points: 5,
    });
  }

  if (metrics.officialVideoPosts < 1) {
    deductions.push({
      reason: `部門アカウントは月1本以上の動画を投稿未満（${formatMonthlyNumber(
        metrics.officialVideoPosts
      )}）`,
      points: 5,
    });
  }

  if (metrics.playerVideoPosters < 2) {
    deductions.push({
      reason: `2名以上選手の動画投稿未満（${formatMonthlyNumber(
        metrics.playerVideoPosters
      )}名）`,
      points: 5,
    });
  }

  if (metrics.playerStreamers < 3) {
    deductions.push({
      reason: `3名以上選手の配信未満（${formatMonthlyNumber(
        metrics.playerStreamers
      )}名）`,
      points: 5,
    });
  }

  if (metrics.totalStreams < 20) {
    deductions.push({
      reason: `チーム全体で月20回以上の配信未満（${formatMonthlyNumber(
        metrics.totalStreams
      )}）`,
      points: 10,
    });
  }

  if (metrics.totalVideosWithArchives < 22) {
    deductions.push({
      reason: `チーム全体22本以上動画未満（${formatMonthlyNumber(
        metrics.totalVideosWithArchives
      )}）`,
      points: 10,
    });
  }

  if (metrics.totalShortPosts < 5) {
    deductions.push({
      reason: `ショート／TikTok投稿5本未満（${formatMonthlyNumber(
        metrics.totalShortPosts
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

  if (score >= 80) {
    return "B";
  }

  if (score >= 70) {
    return "C";
  }

  return "D";
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
  };
}

function getTeamShortName(team: TeamScoreTeam) {
  return String(team.short_name || team.name || "-").trim() || "-";
}
