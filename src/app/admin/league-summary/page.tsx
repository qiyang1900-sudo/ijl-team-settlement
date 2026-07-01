import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import {
  formatMonthLabel,
  formatMonthlyNumber,
  getMonthlyAdminStatusLabel,
  parseMonthlyPlayerRows,
  splitMonthlyRows,
} from "@/lib/monthly-data";
import {
  buildMonthOptions,
  getCurrentMonthValue,
  normalizeMonthRange,
} from "@/lib/month-options";
import type { MonthOption } from "@/lib/month-options";
import {
  MonthlySummary,
  buildMonthlySummary,
  combineMonthlySummariesForPeriod,
  formatMonthlyPercent,
  summarizeMonthlySubmissions,
} from "@/lib/monthly-summary";
import {
  applyHistoricalLeagueSummaries,
  getPreviousYearMonth,
  historicalLeagueSummaryRows,
} from "@/lib/league-summary-history";
import { applyTiktokShortVideoToSummary } from "@/lib/tiktok-monthly-data";
import MonthlyComboChart, {
  type ChartInsight,
} from "../components/MonthlyComboChart";

type MonthlySubmissionRow = {
  id: string;
  team_id: string;
  target_month: string;
  status: string;
  player_rows: unknown;
  club_activity_link: string | null;
  club_activity_image_url: string | null;
  teams: {
    name: string | null;
    short_name: string | null;
  } | null;
};

type TeamRow = {
  id: string;
  name: string | null;
  short_name: string | null;
};

type SubmissionStatusRow = {
  team_id: string;
  target_month: string;
  status: string | null;
};

type TeamSummaryRow = {
  team: string;
  shortName: string;
  summary: MonthlySummary;
};

type TeamMonthlySummary = {
  teamId: string;
  team: string;
  shortName: string;
  month: string;
  summary: MonthlySummary;
  hasApprovedSubmission: boolean;
};

type InsightMetricType = "volume" | "count" | "follower";

type InsightMetric = {
  key: string;
  label: string;
  type: InsightMetricType;
  getValue: (summary: MonthlySummary) => number;
};

export default async function LeagueSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string }>;
}) {
  const { from, to, month } = await searchParams;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">联盟数据汇总</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
  const currentMonth = getCurrentMonthValue();
  const { data: monthRows } = await supabase
    .from("monthly_data_submissions")
    .select("target_month")
    .eq("status", "approved")
    .order("target_month", { ascending: true });
  const availableMonths = [
    ...(monthRows || []).map((row) => String(row.target_month || "")),
    ...historicalLeagueSummaryRows.map((row) => row.month),
  ];
  const { fromMonth, toMonth } = normalizeMonthRange({
    from,
    to,
    availableMonths,
    maxMonth: currentMonth,
  });
  const monthOptions = buildMonthOptions(availableMonths, {
    includeFutureMonths: false,
    maxMonth: currentMonth,
  });
  const [{ data: teamData }, { data: submissionStatusRows }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, short_name")
      .order("short_name", { ascending: true }),
    supabase
      .from("monthly_data_submissions")
      .select("team_id, target_month, status")
      .lte("target_month", currentMonth),
  ]);

  const { data, error } = await supabase
    .from("monthly_data_submissions")
    .select(
      `
      id,
      team_id,
      target_month,
      status,
      player_rows,
      club_activity_link,
      club_activity_image_url,
      teams (
        name,
        short_name
      )
    `
    )
    .lte("target_month", currentMonth)
    .eq("status", "approved")
    .order("target_month", { ascending: true });

  const allRows = (data || []) as unknown as MonthlySubmissionRow[];
  const rows = allRows.filter(
    (row) => row.target_month >= fromMonth && row.target_month <= toMonth
  );
  const teams = ((teamData || []) as TeamRow[]).filter(
    (team) => team.id && team.short_name
  );
  const statusByTeamMonth = buildStatusByTeamMonth(
    (submissionStatusRows || []) as SubmissionStatusRow[]
  );
  const allMonthlySummaries = applyHistoricalLeagueSummaries(
    summarizeMonthlySubmissions(allRows)
  ).map((summary) => applyTiktokShortVideoToSummary(summary));
  const monthlySummaries = allMonthlySummaries.filter(
    (summary) => summary.month >= fromMonth && summary.month <= toMonth
  );
  const periodSummary = combineMonthlySummariesForPeriod(
    "period",
    monthlySummaries,
    rows.length
  );
  const teamSummariesByMonth = buildTeamSummariesByMonth(allRows, teams);
  const byTeam = summarizeByTeam(rows);
  const xTrendInsights = buildLeagueTrendInsights({
    selectedSummaries: monthlySummaries,
    allSummaries: allMonthlySummaries,
    teams,
    teamSummariesByMonth,
    statusByTeamMonth,
    metrics: [
      {
        key: "xEngagements",
        label: "X 互动量",
        type: "volume",
        getValue: (summary) => summary.total.xEngagements,
      },
      {
        key: "xImpressions",
        label: "X 阅读量",
        type: "volume",
        getValue: (summary) => summary.total.xImpressions,
      },
    ],
  });
  const xFollowerInsights = buildLeagueTrendInsights({
    selectedSummaries: monthlySummaries,
    allSummaries: allMonthlySummaries,
    teams,
    teamSummariesByMonth,
    statusByTeamMonth,
    metrics: [
      {
        key: "xFollowerCount",
        label: "X 粉丝数",
        type: "follower",
        getValue: (summary) => summary.total.xFollowerCount,
      },
    ],
  });
  const youtubePostInsights = buildLeagueTrendInsights({
    selectedSummaries: monthlySummaries,
    allSummaries: allMonthlySummaries,
    teams,
    teamSummariesByMonth,
    statusByTeamMonth,
    metrics: [
      {
        key: "youtubeVideoViews",
        label: "YouTube 视频播放数",
        type: "volume",
        getValue: (summary) => summary.total.youtubeVideoViews,
      },
      {
        key: "youtubeSubscriberCount",
        label: "YouTube 登録者数",
        type: "follower",
        getValue: (summary) => summary.total.youtubeSubscriberCount,
      },
    ],
  });
  const shortVideoInsights = buildLeagueTrendInsights({
    selectedSummaries: monthlySummaries,
    allSummaries: allMonthlySummaries,
    teams,
    teamSummariesByMonth,
    statusByTeamMonth,
    metrics: [
      {
        key: "shortVideoViews",
        label: "Shorts / TikTok 短视频播放数",
        type: "volume",
        getValue: (summary) => summary.total.youtubeShortViews,
      },
      {
        key: "shortVideoPostCount",
        label: "Shorts / TikTok 短视频投稿数",
        type: "count",
        getValue: (summary) => summary.total.youtubeShortPostCount,
      },
    ],
  });
  const youtubeLiveInsights = buildLeagueTrendInsights({
    selectedSummaries: monthlySummaries,
    allSummaries: allMonthlySummaries,
    teams,
    teamSummariesByMonth,
    statusByTeamMonth,
    metrics: [
      {
        key: "youtubeStreamViews",
        label: "YouTube 直播观看数",
        type: "volume",
        getValue: (summary) => summary.total.youtubeStreamViews,
      },
      {
        key: "youtubeStreamCount",
        label: "YouTube 直播次数",
        type: "count",
        getValue: (summary) => summary.total.youtubeStreamCount,
      },
    ],
  });
  const selectedComparisonMonth =
    month &&
    /^\d{4}-\d{2}$/.test(month) &&
    month <= currentMonth &&
    allMonthlySummaries.some((summary) => summary.month === month)
      ? month
      : toMonth;
  const selectedMonthSummary =
    allMonthlySummaries.find((summary) => summary.month === selectedComparisonMonth) ||
    null;
  const previousYearSummary =
    allMonthlySummaries.find(
      (summary) => summary.month === getPreviousYearMonth(selectedComparisonMonth)
    ) || null;
  const exportHref = `/api/admin/league-summary/export?from=${encodeURIComponent(
    fromMonth
  )}&to=${encodeURIComponent(toMonth)}&month=${encodeURIComponent(
    selectedComparisonMonth
  )}`;

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/admin/dashboard"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← 返回管理员后台
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-bold">联盟数据汇总</h1>
            <p className="mt-2 text-slate-400">
              按 Excel 汇总表口径查看联盟月数据、战队数据和可视化分析。
            </p>
          </div>
          <a
            href={exportHref}
            className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
          >
            导出当前数据 Excel
          </a>
        </div>

        <form className="mt-6 grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="block text-sm text-slate-300">
            开始月份
            <select
              name="from"
              defaultValue={fromMonth}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-300">
            结束月份
            <select
              name="to"
              defaultValue={toMonth}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-lg bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300">
            筛选
          </button>
        </form>

        {error ? (
          <section className="mt-6 rounded-xl border border-amber-500 bg-amber-950 p-5 text-amber-100">
            <p className="font-bold">月数据表读取失败</p>
            <p className="mt-2 text-xs">{error.message}</p>
          </section>
        ) : null}

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <Stat label="期间" value={`${formatMonthLabel(fromMonth)} - ${formatMonthLabel(toMonth)}`} />
          <Stat label="提交记录" value={`${rows.length} 件`} />
          <Stat label="总曝光" value={formatMonthlyNumber(periodSummary.total.xImpressions)} />
          <Stat label="总互动" value={formatMonthlyNumber(periodSummary.total.xEngagements)} />
        </section>

        <MonthlyComparison
          month={selectedComparisonMonth}
          current={selectedMonthSummary}
          fromMonth={fromMonth}
          toMonth={toMonth}
          monthOptions={monthOptions}
          previous={previousYearSummary}
        />

        <section className="mt-6 grid gap-4 xl:grid-cols-2">
          <MonthlyComboChart
            title="IJL联盟战队推特数据推移"
            barLabel="互动量"
            lineLabel="阅读量"
            barColor="#7e57c2"
            lineColor="#f4b400"
            showInsights
            insights={xTrendInsights}
            points={monthlySummaries.map((row) => ({
              label: shortMonthLabel(row.month),
              barValue: row.total.xEngagements,
              lineValue: row.total.xImpressions,
            }))}
          />
          <MonthlyComboChart
            title="IJL联盟战队推特粉丝数推移"
            lineLabel="粉丝数"
            lineColor="#f4b400"
            showInsights
            insights={xFollowerInsights}
            points={monthlySummaries.map((row) => ({
              label: shortMonthLabel(row.month),
              lineValue: row.total.xFollowerCount,
            }))}
          />
          <MonthlyComboChart
            title="IJL联盟 YouTube 投稿数据"
            barLabel="视频播放次数"
            lineLabel="登録者数"
            barColor="#ef4444"
            lineColor="#3b82f6"
            showInsights
            insights={youtubePostInsights}
            points={monthlySummaries.map((row) => ({
              label: shortMonthLabel(row.month),
              barValue: row.total.youtubeVideoViews,
              lineValue: row.total.youtubeSubscriberCount,
            }))}
          />
          <MonthlyComboChart
            title="IJL联盟 Shorts / TikTok 短视频数据"
            barLabel="短视频播放"
            lineLabel="短视频投稿"
            barColor="#f97316"
            lineColor="#22c55e"
            showInsights
            insights={shortVideoInsights}
            points={monthlySummaries.map((row) => ({
              label: shortMonthLabel(row.month),
              barValue: row.total.youtubeShortViews,
              lineValue: row.total.youtubeShortPostCount,
            }))}
          />
          <MonthlyComboChart
            title="IJL联盟 YouTube 直播数据"
            barLabel="直播观看"
            lineLabel="直播次数"
            barColor="#3b82f6"
            lineColor="#ef4444"
            showInsights
            insights={youtubeLiveInsights}
            points={monthlySummaries.map((row) => ({
              label: shortMonthLabel(row.month),
              barValue: row.total.youtubeStreamViews,
              lineValue: row.total.youtubeStreamCount,
            }))}
          />
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-700">
          <div className="bg-slate-900 p-5">
            <h2 className="text-xl font-bold">汇总表格</h2>
          </div>
          <LeagueSummaryTable rows={monthlySummaries} summary={periodSummary} />
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-700">
          <div className="bg-slate-900 p-5">
            <h2 className="text-xl font-bold">各战队数据整理</h2>
          </div>
          <TeamSummaryTable rows={byTeam} />
        </section>
      </div>
    </main>
  );
}

function buildStatusByTeamMonth(rows: SubmissionStatusRow[]) {
  const map = new Map<string, string>();

  for (const row of rows) {
    map.set(`${row.team_id}:${row.target_month}`, String(row.status || ""));
  }

  return map;
}

function buildTeamSummariesByMonth(
  rows: MonthlySubmissionRow[],
  teams: TeamRow[]
) {
  const map = new Map<string, Map<string, TeamMonthlySummary>>();
  const teamById = new Map(teams.map((team) => [team.id, team]));

  for (const submission of rows) {
    const team = teamById.get(submission.team_id);
    const splitRows = splitMonthlyRows(parseMonthlyPlayerRows(submission.player_rows));
    const summary = applyTiktokShortVideoToSummary(
      buildMonthlySummary(
        submission.target_month,
        splitRows.officialRow ? [splitRows.officialRow] : [],
        splitRows.playerRows,
        1
      ),
      team?.short_name || submission.teams?.short_name
    );
    const monthMap = map.get(submission.target_month) || new Map();

    monthMap.set(submission.team_id, {
      teamId: submission.team_id,
      team: team?.name || submission.teams?.name || "-",
      shortName: team?.short_name || submission.teams?.short_name || "-",
      month: submission.target_month,
      summary,
      hasApprovedSubmission: true,
    });
    map.set(submission.target_month, monthMap);
  }

  return map;
}

function buildLeagueTrendInsights({
  selectedSummaries,
  allSummaries,
  teams,
  teamSummariesByMonth,
  statusByTeamMonth,
  metrics,
}: {
  selectedSummaries: MonthlySummary[];
  allSummaries: MonthlySummary[];
  teams: TeamRow[];
  teamSummariesByMonth: Map<string, Map<string, TeamMonthlySummary>>;
  statusByTeamMonth: Map<string, string>;
  metrics: InsightMetric[];
}): ChartInsight[] {
  const insights: ChartInsight[] = [];
  const sortedSummaries = [...allSummaries].sort((left, right) =>
    left.month.localeCompare(right.month)
  );

  for (const current of selectedSummaries) {
    const previousThree = sortedSummaries
      .filter((summary) => summary.month < current.month)
      .slice(-3);

    if (previousThree.length === 0) {
      continue;
    }

    for (const metric of metrics) {
      const currentValue = metric.getValue(current);
      const previousAverage = average(previousThree.map(metric.getValue));

      if (!isInsightTriggered(currentValue, previousAverage, metric.type)) {
        continue;
      }

      const changePercent =
        previousAverage > 0 ? (currentValue - previousAverage) / previousAverage : null;
      const tone = currentValue >= previousAverage ? "up" : "down";
      const teamDetail = buildTeamInsightDetail({
        month: current.month,
        previousMonths: previousThree.map((summary) => summary.month),
        teams,
        teamSummariesByMonth,
        statusByTeamMonth,
        metric,
        tone,
      });

      insights.push({
        key: `${metric.key}-${current.month}-${currentValue}-${previousAverage}`,
        tone,
        message: `${formatMonthLabel(current.month)} ${metric.label} 较前三个月平均${
          tone === "up" ? "上升" : "下降"
        } ${formatSignedPercent(changePercent)}。`,
        detail: `前三个月平均 ${formatMonthlyNumber(
          Math.round(previousAverage)
        )} → 本月 ${formatMonthlyNumber(currentValue)}。${teamDetail}`,
        changePercent,
      });
    }
  }

  return insights
    .sort((left, right) => Math.abs(right.changePercent || 10) - Math.abs(left.changePercent || 10))
    .slice(0, 8);
}

function isInsightTriggered(
  currentValue: number,
  previousAverage: number,
  type: InsightMetricType
) {
  if (previousAverage > 0 && currentValue === 0) {
    return true;
  }

  if (previousAverage <= 0) {
    return currentValue > 0;
  }

  const change = (currentValue - previousAverage) / previousAverage;
  const threshold = getInsightThreshold(type);

  return change >= threshold.up || change <= threshold.down;
}

function getInsightThreshold(type: InsightMetricType) {
  if (type === "count") {
    return { up: 1, down: -0.7 };
  }

  if (type === "follower") {
    return { up: 0.25, down: -0.25 };
  }

  return { up: 1.5, down: -0.8 };
}

function buildTeamInsightDetail({
  month,
  previousMonths,
  teams,
  teamSummariesByMonth,
  statusByTeamMonth,
  metric,
  tone,
}: {
  month: string;
  previousMonths: string[];
  teams: TeamRow[];
  teamSummariesByMonth: Map<string, Map<string, TeamMonthlySummary>>;
  statusByTeamMonth: Map<string, string>;
  metric: InsightMetric;
  tone: "up" | "down";
}) {
  const monthMap = teamSummariesByMonth.get(month);

  if (!monthMap || monthMap.size === 0) {
    return "该月份为历史汇总数据或暂无已通过的战队拆分数据，暂时只能判断联盟合计变化。";
  }

  const previousTeamMonths = previousMonths.filter((previousMonth) =>
    teamSummariesByMonth.has(previousMonth)
  );

  if (previousTeamMonths.length === 0) {
    return "前三个月为历史汇总数据或暂无战队拆分数据，暂时只能判断联盟合计变化。";
  }

  const contributions = teams
    .map((team) => {
      const currentSummary = monthMap.get(team.id);
      const currentValue = currentSummary
        ? metric.getValue(currentSummary.summary)
        : 0;
      const previousValues = previousTeamMonths.map((previousMonth) => {
        const previousSummary = teamSummariesByMonth
          .get(previousMonth)
          ?.get(team.id);

        return previousSummary ? metric.getValue(previousSummary.summary) : 0;
      });
      const previousAverage = average(previousValues);
      const delta = currentValue - previousAverage;
      const status = statusByTeamMonth.get(`${team.id}:${month}`) || "";

      return {
        team: team.name || "-",
        shortName: team.short_name || "-",
        currentValue,
        previousAverage,
        delta,
        hasApprovedSubmission: Boolean(currentSummary?.hasApprovedSubmission),
        status,
      };
    })
    .filter(
      (row) =>
        Math.abs(row.delta) > 0 ||
        (row.previousAverage > 0 && row.currentValue === 0)
    )
    .sort((left, right) =>
      tone === "up" ? right.delta - left.delta : left.delta - right.delta
    )
    .slice(0, 3);

  if (contributions.length === 0) {
    return "各战队变化比较平均，没有单一战队造成明显偏移。";
  }

  const prefix = tone === "up" ? "主要增加来自" : "主要下降来自";
  const details = contributions.map((row) => {
    const change =
      row.previousAverage > 0
        ? formatSignedPercent((row.currentValue - row.previousAverage) / row.previousAverage)
        : row.currentValue > 0
          ? "从 0 新增"
          : "0";
    const valueText = `${formatMonthlyNumber(
      Math.round(row.previousAverage)
    )} → ${formatMonthlyNumber(row.currentValue)}`;

    if (!row.hasApprovedSubmission && row.previousAverage > 0) {
      const statusText = row.status
        ? `数据状态为${getMonthlyAdminStatusLabel(row.status)}，尚未进入已通过汇总`
        : "没交数据";

      return `${row.shortName} ${statusText}（前三个月平均 ${formatMonthlyNumber(
        Math.round(row.previousAverage)
      )} → 本月 0）`;
    }

    if (row.currentValue === 0 && row.previousAverage > 0) {
      return `${row.shortName} 本月该项为 0（${valueText}，${change}）`;
    }

    return `${row.shortName} ${change}（${valueText}）`;
  });

  return `${prefix}：${details.join("；")}。`;
}

function summarizeByTeam(rows: MonthlySubmissionRow[]): TeamSummaryRow[] {
  const groups = new Map<
    string,
    {
      team: string;
      shortName: string;
      summariesByMonth: Map<string, MonthlySummary>;
    }
  >();

  for (const submission of rows) {
    const key = submission.teams?.short_name || submission.teams?.name || "-";
    const current = groups.get(key) || {
      team: submission.teams?.name || "-",
      shortName: submission.teams?.short_name || "-",
      summariesByMonth: new Map<string, MonthlySummary>(),
    };
    const splitRows = splitMonthlyRows(parseMonthlyPlayerRows(submission.player_rows));
    const monthSummary = buildMonthlySummary(
      submission.target_month,
      splitRows.officialRow ? [splitRows.officialRow] : [],
      splitRows.playerRows,
      1
    );
    const existingSummary = current.summariesByMonth.get(submission.target_month);

    current.summariesByMonth.set(
      submission.target_month,
      existingSummary
        ? combineMonthlySummariesForPeriod(submission.target_month, [
            existingSummary,
            monthSummary,
          ])
        : monthSummary
    );
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .map((row) => {
      const summaries = Array.from(row.summariesByMonth.values())
        .sort((left, right) => left.month.localeCompare(right.month))
        .map((summary) => applyTiktokShortVideoToSummary(summary, row.shortName));

      return {
        team: row.team,
        shortName: row.shortName,
        summary: combineMonthlySummariesForPeriod(row.shortName, summaries),
      };
    })
    .sort((left, right) => left.shortName.localeCompare(right.shortName));
}

function LeagueSummaryTable({
  rows,
  summary,
}: {
  rows: MonthlySummary[];
  summary: MonthlySummary;
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1700px] border-collapse bg-slate-900 text-left text-xs">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="px-3 py-2">月份</th>
              <th className="px-3 py-2">官推条数</th>
              <th className="px-3 py-2">官推互动量</th>
              <th className="px-3 py-2">官推阅读量</th>
              <th className="px-3 py-2">互动率</th>
              <th className="px-3 py-2">官方粉丝数</th>
              <th className="px-3 py-2">选手推条数</th>
              <th className="px-3 py-2">互动量</th>
              <th className="px-3 py-2">阅读量</th>
              <th className="px-3 py-2">互动率</th>
              <th className="px-3 py-2">选手粉丝数</th>
              <th className="px-3 py-2">YT 登録者</th>
              <th className="px-3 py-2">投稿数量</th>
              <th className="px-3 py-2">视频播放次数</th>
              <th className="px-3 py-2">直播观看次数</th>
              <th className="px-3 py-2">直播次数</th>
              <th className="px-3 py-2">短视频投稿（Shorts+TT）</th>
              <th className="px-3 py-2">短视频播放（Shorts+TT）</th>
              <th className="px-3 py-2">点赞量</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-slate-500" colSpan={19}>
                  暂无数据。
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.month} className="border-t border-slate-700">
                  <td className="px-3 py-2 font-semibold">
                    {formatMonthLabel(row.month)}
                  </td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.official.xTweetCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.official.xEngagements)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.official.xImpressions)}</td>
                  <td className="px-3 py-2">{formatMonthlyPercent(row.official.xEngagementRate)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.official.xFollowerCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.players.xTweetCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.players.xEngagements)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.players.xImpressions)}</td>
                  <td className="px-3 py-2">{formatMonthlyPercent(row.players.xEngagementRate)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.players.xFollowerCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.total.youtubeSubscriberCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.total.youtubeTotalPostCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.total.youtubeVideoViews)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.total.youtubeStreamViews)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.total.youtubeStreamCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.total.youtubeShortPostCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.total.youtubeShortViews)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(row.total.youtubeLikeCount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <LeagueSummaryTotals summary={summary} />
    </>
  );
}

function LeagueSummaryTotals({ summary }: { summary: MonthlySummary }) {
  const items = [
    { label: "总条数", value: summary.total.xTweetCount },
    { label: "总曝光", value: summary.total.xImpressions },
    { label: "总互动", value: summary.total.xEngagements },
    { label: "视频播放合计", value: summary.total.youtubeVideoViews },
    { label: "短视频播放合计（Shorts+TT）", value: summary.total.youtubeShortViews },
    { label: "直播观看合计", value: summary.total.youtubeStreamViews },
    { label: "直播次数合计", value: summary.total.youtubeStreamCount },
    { label: "合计播放数", value: summary.total.youtubeTotalPlayback },
  ];

  return (
    <div className="border-t border-slate-700 bg-slate-900 p-5">
      <h3 className="text-sm font-semibold text-slate-300">
        当前期间总计算数
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg bg-slate-950 p-3">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className="mt-1 text-lg font-bold">
              {formatMonthlyNumber(item.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamSummaryTable({ rows }: { rows: TeamSummaryRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-collapse bg-slate-900 text-left text-sm">
        <thead className="bg-slate-800 text-slate-300">
          <tr>
            <th className="px-4 py-3">战队</th>
            <th className="px-4 py-3">X 粉丝数</th>
            <th className="px-4 py-3">推文条数</th>
            <th className="px-4 py-3">战队合计曝光</th>
            <th className="px-4 py-3">战队合计互动</th>
            <th className="px-4 py-3">YT 粉丝数</th>
            <th className="px-4 py-3">投稿条数（含短视频）</th>
            <th className="px-4 py-3">直播次数</th>
            <th className="px-4 py-3">总播放</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-slate-500" colSpan={9}>
                暂无数据。
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.shortName} className="border-t border-slate-700">
                <td className="px-4 py-3 font-semibold">
                  {row.team}（{row.shortName}）
                </td>
                <td className="px-4 py-3">{formatMonthlyNumber(row.summary.total.xFollowerCount)}</td>
                <td className="px-4 py-3">{formatMonthlyNumber(row.summary.total.xTweetCount)}</td>
                <td className="px-4 py-3">{formatMonthlyNumber(row.summary.total.xImpressions)}</td>
                <td className="px-4 py-3">{formatMonthlyNumber(row.summary.total.xEngagements)}</td>
                <td className="px-4 py-3">{formatMonthlyNumber(row.summary.total.youtubeSubscriberCount)}</td>
                <td className="px-4 py-3">{formatMonthlyNumber(row.summary.total.youtubeTotalPostCount)}</td>
                <td className="px-4 py-3">{formatMonthlyNumber(row.summary.total.youtubeStreamCount)}</td>
                <td className="px-4 py-3">{formatMonthlyNumber(row.summary.total.youtubeTotalPlayback)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyComparison({
  month,
  current,
  fromMonth,
  toMonth,
  monthOptions,
  previous,
}: {
  month: string;
  current: MonthlySummary | null;
  fromMonth: string;
  toMonth: string;
  monthOptions: MonthOption[];
  previous: MonthlySummary | null;
}) {
  const items = current
    ? [
        {
          label: "X 总推文",
          value: current.total.xTweetCount,
          previous: previous?.total.xTweetCount,
        },
        {
          label: "X 总曝光",
          value: current.total.xImpressions,
          previous: previous?.total.xImpressions,
        },
        {
          label: "X 总互动",
          value: current.total.xEngagements,
          previous: previous?.total.xEngagements,
        },
        {
          label: "视频播放",
          value: current.total.youtubeVideoViews,
          previous: previous?.total.youtubeVideoViews,
        },
        {
          label: "短视频播放（Shorts+TT）",
          value: current.total.youtubeShortViews,
          previous: previous?.total.youtubeShortViews,
        },
        {
          label: "直播观看",
          value: current.total.youtubeStreamViews,
          previous: previous?.total.youtubeStreamViews,
        },
        {
          label: "直播次数",
          value: current.total.youtubeStreamCount,
          previous: previous?.total.youtubeStreamCount,
        },
        {
          label: "YouTube 登録者",
          value: current.total.youtubeSubscriberCount,
          previous: previous?.total.youtubeSubscriberCount,
        },
      ]
    : [];

  return (
    <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-bold">
            指定月份总数据：{formatMonthLabel(month)}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            上方筛选是期间，这里单独指定一个月份，用于查看所有战队合计和去年同月增减。
          </p>
        </div>
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="from" value={fromMonth} />
          <input type="hidden" name="to" value={toMonth} />
          <label className="text-sm text-slate-300">
            指定月份
            <select
              name="month"
              defaultValue={month}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white sm:w-44"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-200">
            切换
          </button>
        </form>
      </div>
      <p className="mt-3 text-sm text-slate-500">
        对比月份：{formatMonthLabel(getPreviousYearMonth(month))}
      </p>
      {current ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="rounded-lg bg-slate-950 p-4">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1 text-xl font-bold">
                {formatMonthlyNumber(item.value)}
              </p>
              <p className={`mt-1 text-xs ${comparisonTone(item.value, item.previous)}`}>
                去年同月 {formatComparison(item.value, item.previous)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">该月份没有已通过数据。</p>
      )}
    </section>
  );
}

function formatComparison(current: number, previous?: number) {
  if (!previous) {
    return "-";
  }

  const change = (current - previous) / previous;
  const sign = change > 0 ? "+" : "";

  return `${sign}${(change * 100).toFixed(1)}%`;
}

function formatSignedPercent(value: number | null) {
  if (value === null) {
    return "从 0 变化";
  }

  const sign = value > 0 ? "+" : "";

  return `${sign}${(value * 100).toFixed(1)}%`;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function comparisonTone(current: number, previous?: number) {
  if (!previous || current === previous) {
    return "text-slate-500";
  }

  return current > previous ? "text-emerald-300" : "text-rose-300";
}

function shortMonthLabel(month: string) {
  const [, monthValue] = month.split("-");
  return monthValue ? `${Number(monthValue)}月` : month;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}
