import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  MonthlyPlayerRow,
  formatMonthLabel,
  formatMonthlyNumber,
  isOfficialMonthlyRow,
  parseMonthlyPlayerRows,
} from "@/lib/monthly-data";
import {
  buildMonthOptions,
  normalizeMonthRange,
} from "@/lib/month-options";
import { getPlayerDisplayName } from "@/lib/player-display";
import MonthlyComboChart from "../../components/MonthlyComboChart";

export const dynamic = "force-dynamic";

type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
};

type PlayerRow = {
  id: string;
  handle: string | null;
  reading: string | null;
  position_label: string | null;
  roster_role: string | null;
  current_team_id: string | null;
  current_team_short_name: string | null;
  teams: TeamRow | null;
};

type MonthlySubmissionRow = {
  id: string;
  team_id: string | null;
  target_month: string;
  status: string | null;
  player_rows: unknown;
  teams: TeamRow | null;
};

type PlayerMonthData = {
  month: string;
  teamName: string;
  row: MonthlyPlayerRow;
};

const metricFields = [
  { key: "salaryAmount", label: "选手薪资", mode: "sum" },
  { key: "xTweetCount", label: "X ツイート", mode: "sum" },
  { key: "xImpressions", label: "X インプレッション", mode: "sum" },
  { key: "xEngagements", label: "X エンゲージメント", mode: "sum" },
  { key: "xFanEventCount", label: "ファンイベント", mode: "sum" },
  { key: "xFollowerCount", label: "X フォロワー", mode: "latest" },
  { key: "youtubeVideoPostCount", label: "動画投稿", mode: "sum" },
  { key: "youtubeVideoViews", label: "動画視聴", mode: "sum" },
  { key: "youtubeShortPostCount", label: "ショート投稿", mode: "sum" },
  { key: "youtubeShortViews", label: "ショート視聴", mode: "sum" },
  { key: "youtubeLikeCount", label: "いいね", mode: "sum" },
  { key: "youtubeStreamCount", label: "配信回数", mode: "sum" },
  { key: "youtubeStreamViews", label: "配信視聴", mode: "sum" },
  { key: "youtubeTotalImpressions", label: "YouTube 合計Imp", mode: "sum" },
  { key: "youtubeSubscriberCount", label: "登録者", mode: "latest" },
] as const;

type PlayerMetricKey = (typeof metricFields)[number]["key"];
type PlayerTotals = Record<PlayerMetricKey, number> & {
  youtubeViews: number;
};

export default async function AdminPlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { playerId } = await params;
  const { from, to } = await searchParams;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">选手详情</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: player, error: playerError } = await supabase
    .from("league_players")
    .select(
      `
      id,
      handle,
      reading,
      position_label,
      roster_role,
      current_team_id,
      current_team_short_name,
      teams:current_team_id (
        id,
        name,
        short_name
      )
    `
    )
    .eq("id", playerId)
    .maybeSingle();
  const { data: monthRows } = await supabase
    .from("monthly_data_submissions")
    .select("target_month")
    .eq("status", "approved")
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

  let monthlyQuery = supabase
    .from("monthly_data_submissions")
    .select(
      `
      id,
      team_id,
      target_month,
      status,
      player_rows,
      teams:team_id (
        id,
        name,
        short_name
      )
    `
    )
    .order("target_month", { ascending: true });

  monthlyQuery = monthlyQuery.gte("target_month", fromMonth);
  monthlyQuery = monthlyQuery.lte("target_month", toMonth);
  monthlyQuery = monthlyQuery.eq("status", "approved");

  const { data: submissions, error: submissionsError } = await monthlyQuery;

  if (playerError || !player) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <Link href="/admin/players" className="text-sm text-slate-400 hover:text-white">
          ← 返回选手管理
        </Link>
        <section className="mt-6 rounded-xl border border-red-500 bg-red-950 p-5">
          <p className="font-bold text-red-300">选手读取失败</p>
          <p className="mt-2 text-sm text-red-200">
            {playerError?.message || "未找到选手。"}
          </p>
        </section>
      </main>
    );
  }

  const safePlayer = player as unknown as PlayerRow;
  const safeSubmissions = (submissions || []) as unknown as MonthlySubmissionRow[];
  const playerMonths = collectPlayerMonthData(safePlayer, safeSubmissions);
  const monthlySummaries = summarizePlayerMonthsByMonth(playerMonths);
  const totals = summarizePlayerData(monthlySummaries);

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin/players" className="text-sm text-slate-400 hover:text-white">
          ← 返回选手管理
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-bold">
              {getPlayerDisplayName(safePlayer)}
            </h1>
            <p className="mt-2 text-slate-400">
              {safePlayer.reading || "-"} / {safePlayer.position_label || "-"} /{" "}
              {safePlayer.roster_role || "-"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              当前所属：{safePlayer.teams?.name || safePlayer.current_team_short_name || "未所属"}
            </p>
          </div>
          {safePlayer.current_team_id ? (
            <Link
              href={`/admin/teams/${safePlayer.current_team_id}`}
              className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
            >
              查看所属战队
            </Link>
          ) : null}
        </div>

        {submissionsError ? (
          <section className="mt-6 rounded-xl border border-amber-500 bg-amber-950 p-5 text-amber-100">
            <p className="font-bold">月数据读取失败</p>
            <p className="mt-2 text-xs">{submissionsError.message}</p>
          </section>
        ) : null}

        <form className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-xl font-bold">期间筛选</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[180px_180px_auto] sm:items-end">
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
            <button className="rounded-lg bg-indigo-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-indigo-300">
              查看期间
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            当前统计基于战队提交的月数据。后续导入历史数据后，只要写入同一结构，就会进入这里。
          </p>
        </form>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="记录月份" value={`${monthlySummaries.length} 月`} />
          <Stat label="薪资合计" value={`${formatMonthlyNumber(totals.salaryAmount)} 円`} />
          <Stat label="X Imp 合计" value={formatMonthlyNumber(totals.xImpressions)} />
          <Stat label="YouTube 视听合计" value={formatMonthlyNumber(totals.youtubeViews)} />
        </div>

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-xl font-bold">期间全数据</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {metricFields.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={formatMonthlyNumber(totals[metric.key])}
                hint={metric.mode === "latest" ? "最新值" : "期间合计"}
              />
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-xl font-bold">可视化分析</h2>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <MonthlyComboChart
              title="IJL選手推特数据推移"
              barLabel="互动量"
              lineLabel="阅读量"
              barColor="#3b82f6"
              lineColor="#ef4444"
              points={monthlySummaries.map((item) => ({
                label: formatShortMonthLabel(item.month),
                barValue: numericValue(item.row.xEngagements),
                lineValue: numericValue(item.row.xImpressions),
              }))}
            />
            <MonthlyComboChart
              title="IJL選手推特粉丝数推移"
              lineLabel="粉丝数"
              lineColor="#cc79a7"
              points={monthlySummaries.map((item) => ({
                label: formatShortMonthLabel(item.month),
                lineValue: numericValue(item.row.xFollowerCount),
              }))}
            />
            <MonthlyComboChart
              title="IJL選手Youtube投稿数据"
              barLabel="再生数"
              lineLabel="登録者"
              barColor="#ef4444"
              lineColor="#3b82f6"
              points={monthlySummaries.map((item) => ({
                label: formatShortMonthLabel(item.month),
                barValue:
                  numericValue(item.row.youtubeVideoViews) +
                  numericValue(item.row.youtubeShortViews),
                lineValue: numericValue(item.row.youtubeSubscriberCount),
              }))}
            />
            <MonthlyComboChart
              title="IJL選手Youtube直播数据"
              barLabel="直播观看"
              lineLabel="直播次数"
              barColor="#3b82f6"
              lineColor="#ef4444"
              points={monthlySummaries.map((item) => ({
                label: formatShortMonthLabel(item.month),
                barValue: numericValue(item.row.youtubeStreamViews),
                lineValue: numericValue(item.row.youtubeStreamCount),
              }))}
            />
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-700">
          <div className="bg-slate-900 p-5">
            <h2 className="text-xl font-bold">每月数据汇总</h2>
          </div>
          <PlayerMonthlySummaryTable rows={monthlySummaries} totals={totals} />
        </section>
      </div>
    </main>
  );
}

function collectPlayerMonthData(
  player: PlayerRow,
  submissions: MonthlySubmissionRow[]
): PlayerMonthData[] {
  const playerName = getPlayerDisplayName(player);
  const handle = String(player.handle || "");

  return submissions
    .flatMap((submission) =>
      parseMonthlyPlayerRows(submission.player_rows)
        .filter((row) => !isOfficialMonthlyRow(row))
        .filter((row) => isSamePlayer(row, player, playerName, handle))
        .map((row) => ({
          month: submission.target_month,
          teamName:
            submission.teams?.short_name ||
            submission.teams?.name ||
            row.playerName.split("_")[0] ||
            "-",
          row,
        }))
    )
    .sort((a, b) => a.month.localeCompare(b.month));
}

function summarizePlayerMonthsByMonth(
  playerMonths: PlayerMonthData[]
): PlayerMonthData[] {
  const groups = new Map<string, PlayerMonthData[]>();

  for (const item of playerMonths) {
    groups.set(item.month, [...(groups.get(item.month) || []), item]);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, items]) => {
      if (items.length === 1) {
        return items[0];
      }

      const baseRow = items[0].row;
      const row: MonthlyPlayerRow = {
        ...baseRow,
        id: `summary-${month}-${baseRow.playerId || baseRow.playerHandle || baseRow.playerName}`,
      };

      for (const metric of metricFields) {
        if (metric.mode === "latest") {
          const latest = [...items]
            .reverse()
            .find((item) => numericValue(item.row[metric.key]) > 0);
          row[metric.key] = String(latest ? numericValue(latest.row[metric.key]) : 0);
          continue;
        }

        row[metric.key] = String(
          items.reduce((sum, item) => sum + numericValue(item.row[metric.key]), 0)
        );
      }

      return {
        month,
        teamName: Array.from(new Set(items.map((item) => item.teamName))).join(" / "),
        row,
      };
    });
}

function isSamePlayer(
  row: MonthlyPlayerRow,
  player: PlayerRow,
  playerName: string,
  handle: string
) {
  if (row.playerId && row.playerId === player.id) {
    return true;
  }

  if (handle && row.playerHandle === handle) {
    return true;
  }

  return Boolean(
    handle &&
      (row.playerName === playerName ||
        row.playerName.endsWith(`_${handle}`) ||
        row.playerName === handle)
  );
}

function summarizePlayerData(playerMonths: PlayerMonthData[]): PlayerTotals {
  const totals = Object.fromEntries(
    metricFields.map((metric) => [metric.key, 0])
  ) as Record<PlayerMetricKey, number>;

  for (const metric of metricFields) {
    if (metric.mode === "latest") {
      const latest = [...playerMonths]
        .reverse()
        .find((item) => numericValue(item.row[metric.key]) > 0);
      totals[metric.key] = latest ? numericValue(latest.row[metric.key]) : 0;
      continue;
    }

    totals[metric.key] = playerMonths.reduce(
      (sum, item) => sum + numericValue(item.row[metric.key]),
      0
    );
  }

  return {
    ...totals,
    youtubeViews: playerMonths.reduce(
      (sum, item) => sum + getYoutubeViews(item.row),
      0
    ),
  };
}

function PlayerMonthlySummaryTable({
  rows,
  totals,
}: {
  rows: PlayerMonthData[];
  totals: PlayerTotals;
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1800px] border-collapse bg-slate-900 text-left text-xs">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="px-3 py-2">月份</th>
              <th className="px-3 py-2">战队</th>
              <th className="px-3 py-2">选手薪资</th>
              <th className="px-3 py-2">X ツイート</th>
              <th className="px-3 py-2">X インプレッション</th>
              <th className="px-3 py-2">X エンゲージメント</th>
              <th className="px-3 py-2">ファンイベント</th>
              <th className="px-3 py-2">X フォロワー</th>
              <th className="px-3 py-2">動画投稿</th>
              <th className="px-3 py-2">動画視聴</th>
              <th className="px-3 py-2">ショート投稿</th>
              <th className="px-3 py-2">ショート視聴</th>
              <th className="px-3 py-2">いいね</th>
              <th className="px-3 py-2">配信回数</th>
              <th className="px-3 py-2">配信視聴</th>
              <th className="px-3 py-2">YouTube 合計Imp</th>
              <th className="px-3 py-2">登録者</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-slate-500" colSpan={17}>
                  暂无数据。
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr key={item.month} className="border-t border-slate-700">
                  <td className="px-3 py-2 font-semibold">
                    {formatMonthLabel(item.month)}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{item.teamName}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.salaryAmount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.xTweetCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.xImpressions)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.xEngagements)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.xFanEventCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.xFollowerCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.youtubeVideoPostCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.youtubeVideoViews)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.youtubeShortPostCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.youtubeShortViews)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.youtubeLikeCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.youtubeStreamCount)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.youtubeStreamViews)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.youtubeTotalImpressions)}</td>
                  <td className="px-3 py-2">{formatMonthlyNumber(item.row.youtubeSubscriberCount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <PlayerTotalsPanel totals={totals} />
    </>
  );
}

function PlayerTotalsPanel({ totals }: { totals: PlayerTotals }) {
  const items = [
    { label: "选手薪资", value: totals.salaryAmount, hint: "期间合计" },
    { label: "X ツイート", value: totals.xTweetCount, hint: "期间合计" },
    { label: "X インプレッション", value: totals.xImpressions, hint: "期间合计" },
    { label: "X エンゲージメント", value: totals.xEngagements, hint: "期间合计" },
    { label: "ファンイベント", value: totals.xFanEventCount, hint: "期间合计" },
    { label: "X フォロワー", value: totals.xFollowerCount, hint: "最新值" },
    { label: "動画投稿", value: totals.youtubeVideoPostCount, hint: "期间合计" },
    { label: "動画視聴", value: totals.youtubeVideoViews, hint: "期间合计" },
    { label: "ショート投稿", value: totals.youtubeShortPostCount, hint: "期间合计" },
    { label: "ショート視聴", value: totals.youtubeShortViews, hint: "期间合计" },
    { label: "配信回数", value: totals.youtubeStreamCount, hint: "期间合计" },
    { label: "配信視聴", value: totals.youtubeStreamViews, hint: "期间合计" },
    { label: "YouTube 合计视听", value: totals.youtubeViews, hint: "期间合计" },
    { label: "登録者", value: totals.youtubeSubscriberCount, hint: "最新值" },
  ];

  return (
    <div className="border-t border-slate-700 bg-slate-900 p-5">
      <h3 className="text-sm font-semibold text-slate-300">全数据汇总</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg bg-slate-950 p-3">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className="mt-1 text-lg font-bold">
              {formatMonthlyNumber(item.value)}
            </p>
            <p className="mt-1 text-[11px] text-slate-600">{item.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function getYoutubeViews(row: MonthlyPlayerRow) {
  return (
    numericValue(row.youtubeVideoViews) +
    numericValue(row.youtubeShortViews) +
    numericValue(row.youtubeStreamViews)
  );
}

function numericValue(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatShortMonthLabel(month: string) {
  const [, monthValue] = month.split("-");

  return monthValue ? `${Number(monthValue)}月` : month;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg bg-slate-950 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-100">{value}</p>
      <p className="mt-1 text-[11px] text-slate-600">{hint}</p>
    </div>
  );
}
