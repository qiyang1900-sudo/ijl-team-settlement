import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  formatMonthLabel,
  formatMonthlyNumber,
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
import MonthlyComboChart from "../components/MonthlyComboChart";

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

type TeamSummaryRow = {
  team: string;
  shortName: string;
  summary: MonthlySummary;
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

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
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
  const allMonthlySummaries = applyHistoricalLeagueSummaries(
    summarizeMonthlySubmissions(allRows)
  );
  const monthlySummaries = allMonthlySummaries.filter(
    (summary) => summary.month >= fromMonth && summary.month <= toMonth
  );
  const periodSummary = combineMonthlySummariesForPeriod(
    "period",
    monthlySummaries,
    rows.length
  );
  const byTeam = summarizeByTeam(rows);
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
            points={monthlySummaries.map((row) => ({
              label: shortMonthLabel(row.month),
              barValue: row.total.youtubeVideoAndShortViews,
              lineValue: row.total.youtubeSubscriberCount,
            }))}
          />
          <MonthlyComboChart
            title="IJL联盟 YouTube 直播数据"
            barLabel="直播观看"
            lineLabel="直播次数"
            barColor="#3b82f6"
            lineColor="#ef4444"
            showInsights
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
      const summaries = Array.from(row.summariesByMonth.values()).sort((left, right) =>
        left.month.localeCompare(right.month)
      );

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
              <th className="px-3 py-2">短视频投稿</th>
              <th className="px-3 py-2">短视频播放次数</th>
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
    { label: "短视频播放合计", value: summary.total.youtubeShortViews },
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
            <th className="px-4 py-3">视频发布条数</th>
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
          label: "短视频播放",
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
