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
  normalizeMonthRange,
} from "@/lib/month-options";
import {
  MonthlySummary,
  buildMonthlySummary,
  formatMonthlyPercent,
  summarizeMonthlySubmissions,
} from "@/lib/monthly-summary";
import MetricLineChart from "../components/MetricLineChart";

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
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
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
  const { data: monthRows } = await supabase
    .from("monthly_data_submissions")
    .select("target_month")
    .order("target_month", { ascending: true });
  const availableMonths = (monthRows || []).map((row) =>
    String(row.target_month || "")
  );
  const { fromMonth, toMonth } = normalizeMonthRange({
    from,
    to,
    availableMonths,
  });
  const monthOptions = buildMonthOptions(availableMonths);

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
    .gte("target_month", fromMonth)
    .lte("target_month", toMonth)
    .order("target_month", { ascending: true });

  const rows = (data || []) as unknown as MonthlySubmissionRow[];
  const monthlySummaries = summarizeMonthlySubmissions(rows);
  const periodSummary = buildMonthlySummary(
    "period",
    monthlySummaries.flatMap((summary) => summary.officialRows),
    monthlySummaries.flatMap((summary) => summary.playerRows),
    rows.length
  );
  const byTeam = summarizeByTeam(rows);
  const exportHref = `/api/admin/league-summary/export?from=${encodeURIComponent(
    fromMonth
  )}&to=${encodeURIComponent(toMonth)}`;

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

        <section className="mt-6 grid gap-4 xl:grid-cols-3">
          <LineChartPanel
            title="IJL联盟 X 阅读量推移"
            rows={monthlySummaries.map((row) => ({
              month: row.month,
              value: row.total.xImpressions,
            }))}
            color="#38bdf8"
          />
          <LineChartPanel
            title="IJL联盟 X 互动量推移"
            rows={monthlySummaries.map((row) => ({
              month: row.month,
              value: row.total.xEngagements,
            }))}
            color="#fbbf24"
          />
          <LineChartPanel
            title="IJL联盟 YouTube 投稿数据"
            rows={monthlySummaries.map((row) => ({
              month: row.month,
              value: row.total.youtubeSubscriberCount,
            }))}
            color="#f87171"
          />
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-700">
          <div className="bg-slate-900 p-5">
            <h2 className="text-xl font-bold">汇总表格</h2>
          </div>
          <LeagueSummaryTable rows={monthlySummaries} />
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
      officialRows: MonthlySummary["officialRows"];
      playerRows: MonthlySummary["playerRows"];
      submissionCount: number;
    }
  >();

  for (const submission of rows) {
    const key = submission.teams?.short_name || submission.teams?.name || "-";
    const current = groups.get(key) || {
      team: submission.teams?.name || "-",
      shortName: submission.teams?.short_name || "-",
      officialRows: [],
      playerRows: [],
      submissionCount: 0,
    };
    const splitRows = splitMonthlyRows(parseMonthlyPlayerRows(submission.player_rows));

    if (splitRows.officialRow) {
      current.officialRows.push(splitRows.officialRow);
    }

    current.playerRows.push(...splitRows.playerRows);
    current.submissionCount += 1;
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .map((row) => ({
      team: row.team,
      shortName: row.shortName,
      summary: buildMonthlySummary(
        row.shortName,
        row.officialRows,
        row.playerRows,
        row.submissionCount
      ),
    }))
    .sort((left, right) => left.shortName.localeCompare(right.shortName));
}

function LeagueSummaryTable({ rows }: { rows: MonthlySummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1900px] border-collapse bg-slate-900 text-left text-xs">
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
            <th className="px-3 py-2">总条数</th>
            <th className="px-3 py-2">总曝光</th>
            <th className="px-3 py-2">总互动</th>
            <th className="px-3 py-2">选手粉丝数</th>
            <th className="px-3 py-2">YT 登録者</th>
            <th className="px-3 py-2">投稿数量</th>
            <th className="px-3 py-2">视频播放次数</th>
            <th className="px-3 py-2">直播观看次数</th>
            <th className="px-3 py-2">直播次数</th>
            <th className="px-3 py-2">短视频投稿</th>
            <th className="px-3 py-2">合计播放数</th>
            <th className="px-3 py-2">点赞量</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-5 text-slate-500" colSpan={22}>
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
                <td className="px-3 py-2">{formatMonthlyNumber(row.total.xTweetCount)}</td>
                <td className="px-3 py-2">{formatMonthlyNumber(row.total.xImpressions)}</td>
                <td className="px-3 py-2">{formatMonthlyNumber(row.total.xEngagements)}</td>
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

function LineChartPanel({
  title,
  rows,
  color,
}: {
  title: string;
  rows: Array<{ month: string; value: number }>;
  color: string;
}) {
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-4">
        <MetricLineChart
          color={color}
          points={rows.map((row) => ({
            label: formatShortMonthLabel(row.month),
            value: row.value,
          }))}
        />
      </div>
    </section>
  );
}

function formatShortMonthLabel(month: string) {
  const [year, monthValue] = month.split("-");

  if (!year || !monthValue) {
    return month;
  }

  return `${year.slice(-2)}/${monthValue}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}
