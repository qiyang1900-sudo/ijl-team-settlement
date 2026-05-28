import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  MonthlyPlayerRow,
  formatMonthLabel,
  formatMonthlyNumber,
  isOfficialMonthlyRow,
  parseMonthlyPlayerRows,
} from "@/lib/monthly-data";
import { getPlayerDisplayName } from "@/lib/player-display";

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

  if (from) {
    monthlyQuery = monthlyQuery.gte("target_month", from);
  }

  if (to) {
    monthlyQuery = monthlyQuery.lte("target_month", to);
  }

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
  const totals = summarizePlayerData(playerMonths);
  const maxTrendValue = Math.max(
    ...playerMonths.map((item) => getTrendValue(item.row)),
    1
  );

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
              <input
                type="month"
                name="from"
                defaultValue={from || ""}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white"
              />
            </label>
            <label className="block text-sm text-slate-300">
              结束月份
              <input
                type="month"
                name="to"
                defaultValue={to || ""}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white"
              />
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
          <Stat label="记录月份" value={`${playerMonths.length} 月`} />
          <Stat label="薪资合计" value={`${formatMonthlyNumber(totals.salaryAmount)} 円`} />
          <Stat label="X Imp 合计" value={formatMonthlyNumber(totals.xImpressions)} />
          <Stat label="YouTube 视听合计" value={formatMonthlyNumber(totals.youtubeViews)} />
        </div>

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-xl font-bold">总数据</h2>
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
          <p className="mt-2 text-sm text-slate-400">
            先显示每月「X Imp + YouTube 视听」趋势，后续可以继续增加分平台图表和评分逻辑。
          </p>
          <div className="mt-4 space-y-3">
            {playerMonths.length === 0 ? (
              <p className="text-sm text-slate-500">当前期间没有这个选手的月数据。</p>
            ) : (
              playerMonths.map((item) => {
                const value = getTrendValue(item.row);

                return (
                  <div
                    key={`${item.month}-${item.teamName}`}
                    className="grid gap-3 md:grid-cols-[110px_minmax(0,1fr)_150px] md:items-center"
                  >
                    <span className="text-sm text-slate-300">
                      {formatMonthLabel(item.month)}
                    </span>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{
                          width: `${Math.max(4, (value / maxTrendValue) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-200">
                      {formatMonthlyNumber(value)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-700">
          <table className="w-full min-w-[920px] border-collapse bg-slate-900 text-left text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="px-4 py-3">月份</th>
                <th className="px-4 py-3">战队</th>
                <th className="px-4 py-3">薪资</th>
                <th className="px-4 py-3">X Imp</th>
                <th className="px-4 py-3">X ENG</th>
                <th className="px-4 py-3">YouTube 视听</th>
                <th className="px-4 py-3">粉丝/注册者</th>
              </tr>
            </thead>
            <tbody>
              {playerMonths.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={7}>
                    暂无数据。
                  </td>
                </tr>
              ) : (
                playerMonths.map((item) => (
                  <tr key={`${item.month}-${item.teamName}`} className="border-t border-slate-700">
                    <td className="px-4 py-3">{formatMonthLabel(item.month)}</td>
                    <td className="px-4 py-3 text-slate-300">{item.teamName}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatMonthlyNumber(item.row.salaryAmount)} 円
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatMonthlyNumber(item.row.xImpressions)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatMonthlyNumber(item.row.xEngagements)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatMonthlyNumber(getYoutubeViews(item.row))}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      X {formatMonthlyNumber(item.row.xFollowerCount)} / YT{" "}
                      {formatMonthlyNumber(item.row.youtubeSubscriberCount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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

function summarizePlayerData(playerMonths: PlayerMonthData[]) {
  const totals = Object.fromEntries(metricFields.map((metric) => [metric.key, 0])) as Record<
    (typeof metricFields)[number]["key"],
    number
  >;

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

function getYoutubeViews(row: MonthlyPlayerRow) {
  return (
    numericValue(row.youtubeVideoViews) +
    numericValue(row.youtubeShortViews) +
    numericValue(row.youtubeStreamViews)
  );
}

function getTrendValue(row: MonthlyPlayerRow) {
  return numericValue(row.xImpressions) + getYoutubeViews(row);
}

function numericValue(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
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
