import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  formatMonthLabel,
  formatMonthlyNumber,
  getMonthlyAdminStatusLabel,
} from "@/lib/monthly-data";
import { buildMonthOptions } from "@/lib/month-options";
import {
  MonthlySummary,
  formatMonthlyPercent,
  summarizeMonthlySubmissions,
} from "@/lib/monthly-summary";
import { getPlayerDisplayName } from "@/lib/player-display";
import { getAdminStatusLabel, isApprovedLike, isWaitingReview } from "@/lib/status-labels";
import MetricLineChart from "../../components/MetricLineChart";
import PlayerTeamSelect from "../../players/PlayerTeamSelect";

type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
};

type PlayerRow = {
  id: string;
  handle: string | null;
  reading: string | null;
  position_label: string | null;
  roster_role: string | null;
  current_team_id: string | null;
  current_team_short_name: string | null;
  teams: {
    id: string;
    name: string;
    short_name: string | null;
  } | null;
};

type MonthlySubmissionRow = {
  id: string;
  target_month: string;
  status: string;
  player_rows: unknown;
  club_activity_link: string | null;
  club_activity_image_url: string | null;
  updated_at: string | null;
};

type ProjectTeamRow = {
  id: string;
  status: string | null;
  submitted_at: string | null;
  return_reason: string | null;
  projects: {
    id: string | null;
    title: string | null;
    deadline_at: string | null;
  } | null;
};

async function updatePlayerTeam(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功。");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const playerId = String(formData.get("player_id") || "");
  const teamId = String(formData.get("team_id") || "");
  const returnTeamId = String(formData.get("return_team_id") || teamId);
  let teamShortName: string | null = null;

  if (teamId) {
    const { data: team } = await supabase
      .from("teams")
      .select("short_name")
      .eq("id", teamId)
      .maybeSingle();

    teamShortName = team?.short_name || null;
  }

  const { error } = await supabase
    .from("league_players")
    .update({
      current_team_id: teamId || null,
      current_team_short_name: teamShortName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  if (error) {
    throw new Error(error.message);
  }

  redirect(`/admin/teams/${returnTeamId}`);
}

export default async function AdminTeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const { teamId } = await params;
  const { month, view } = await searchParams;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">战队详情</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: team } = await supabase
    .from("teams")
    .select("id, name, short_name, contact_name, contact_email")
    .eq("id", teamId)
    .maybeSingle();
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, short_name")
    .order("short_name", { ascending: true });
  const { data: players, error: playersError } = await supabase
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
    .eq("current_team_id", teamId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const { data: submissions, error: submissionsError } = await supabase
    .from("monthly_data_submissions")
    .select("id, target_month, status, player_rows, club_activity_link, club_activity_image_url, updated_at")
    .eq("team_id", teamId)
    .order("target_month", { ascending: false });
  const { data: projectTeams, error: projectTeamsError } = await supabase
    .from("project_teams")
    .select(
      `
      id,
      status,
      submitted_at,
      return_reason,
      projects (
        id,
        title,
        deadline_at
      )
    `
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (!team) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <Link href="/admin/teams" className="text-sm text-slate-400 hover:text-white">
          ← 返回战队管理
        </Link>
        <p className="mt-6 text-red-300">未找到战队资料。</p>
      </main>
    );
  }

  const safeTeam = team as TeamRow;
  const safeTeams = (teams || []) as TeamRow[];
  const safePlayers = (players || []) as unknown as PlayerRow[];
  const safeSubmissions = (submissions || []) as MonthlySubmissionRow[];
  const safeProjectTeams = (projectTeams || []) as unknown as ProjectTeamRow[];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentYear = new Date().getFullYear().toString();
  const currentSubmission = safeSubmissions.find(
    (submission) => submission.target_month === currentMonth
  );
  const yearlySubmissions = safeSubmissions.filter((submission) =>
    submission.target_month.startsWith(currentYear)
  );
  const projectSummary = summarizeProjectRows(safeProjectTeams);
  const monthlySummary = summarizeMonthlyRows(safeSubmissions, currentMonth);
  const monthlyStats = summarizeMonthlySubmissions(safeSubmissions);
  const selectedMonth =
    month && monthlyStats.some((row) => row.month === month)
      ? month
      : monthlyStats.some((row) => row.month === currentMonth)
        ? currentMonth
        : monthlyStats.at(-1)?.month || currentMonth;
  const selectedSummary =
    monthlyStats.find((row) => row.month === selectedMonth) || null;
  const selectedView = view === "youtube" ? "youtube" : "x";
  const monthOptions = buildMonthOptions(safeSubmissions.map((row) => row.target_month));

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin/teams" className="text-sm text-slate-400 hover:text-white">
          ← 返回战队管理
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-bold">{safeTeam.name}</h1>
            <p className="mt-2 text-slate-400">
              {safeTeam.short_name || "-"} / {safeTeam.contact_name || "联系人未设置"} / {safeTeam.contact_email || "邮箱未设置"}
            </p>
          </div>
          <Link
            href="/admin/players"
            className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
          >
            去选手管理
          </Link>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <Stat
            label="本月状态"
            value={
              currentSubmission
                ? getMonthlyAdminStatusLabel(currentSubmission.status)
                : "未提交"
            }
          />
          <Stat label="本年度提交" value={`${yearlySubmissions.length} 月`} />
          <Stat label="当前选手" value={`${safePlayers.length} 名`} />
          <Stat
            label="项目进度"
            value={`${projectSummary.approved}/${projectSummary.total} 通过`}
          />
        </div>

        {(playersError || submissionsError || projectTeamsError) ? (
          <section className="mt-6 rounded-xl border border-amber-500 bg-amber-950 p-5 text-amber-100">
            <p className="font-bold">部分数据表还没有准备好</p>
            <p className="mt-2 text-xs">
              {playersError?.message || submissionsError?.message || projectTeamsError?.message}
            </p>
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-xl font-bold">项目提交进度</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <MiniStat label="总项目" value={projectSummary.total} />
              <MiniStat label="待审核" value={projectSummary.waiting} />
              <MiniStat label="待补充" value={projectSummary.returned} />
              <MiniStat label="已通过" value={projectSummary.approved} />
            </div>
            <div className="mt-4 space-y-2">
              {safeProjectTeams.length === 0 ? (
                <p className="text-sm text-slate-500">暂无项目提交记录。</p>
              ) : (
                safeProjectTeams.slice(0, 6).map((row) => (
                  <Link
                    key={row.id}
                    href={`/admin/projects/${row.projects?.id}/teams/${row.id}`}
                    className="grid gap-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm hover:border-slate-500 md:grid-cols-[minmax(0,1fr)_120px]"
                  >
                    <span className="truncate font-semibold text-slate-200">
                      {row.projects?.title || "-"}
                    </span>
                    <span className="text-slate-400">
                      {getAdminStatusLabel(String(row.status || ""))}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-xl font-bold">月数据提交进度</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <MiniStat label="总月份" value={monthlySummary.total} />
              <MiniStat label="本月" value={monthlySummary.currentStatus} />
              <MiniStat label="已通过" value={monthlySummary.approved} />
            </div>
            <div className="mt-4 space-y-2">
              {safeSubmissions.length === 0 ? (
                <p className="text-sm text-slate-500">暂无月数据提交记录。</p>
              ) : (
                safeSubmissions.slice(0, 6).map((submission) => (
                  <div
                    key={submission.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-slate-200">
                      {formatMonthLabel(submission.target_month)}
                    </span>
                    <span className="text-slate-400">
                      {getMonthlyAdminStatusLabel(submission.status)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h2 className="text-xl font-bold">战队月数据整合</h2>
              <p className="mt-2 text-sm text-slate-400">
                官方账号和选手数据合并统计，口径与 Excel 汇总表一致。
              </p>
            </div>
            <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="view" value={selectedView} />
              <label className="text-sm text-slate-300">
                查看月份
                <select
                  name="month"
                  defaultValue={selectedMonth}
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
                查看
              </button>
            </form>
          </div>

          <div className="mt-5 inline-flex overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-1 text-sm">
            <Link
              href={`/admin/teams/${teamId}?month=${encodeURIComponent(selectedMonth)}&view=x`}
              className={`rounded-md px-4 py-2 font-semibold ${
                selectedView === "x"
                  ? "bg-cyan-400 text-slate-950"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              X
            </Link>
            <Link
              href={`/admin/teams/${teamId}?month=${encodeURIComponent(selectedMonth)}&view=youtube`}
              className={`rounded-md px-4 py-2 font-semibold ${
                selectedView === "youtube"
                  ? "bg-red-300 text-slate-950"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              YouTube
            </Link>
          </div>

          {selectedSummary ? (
            selectedView === "x" ? (
              <XTotalPanel summary={selectedSummary} />
            ) : (
              <YoutubeTotalPanel summary={selectedSummary} />
            )
          ) : (
            <p className="mt-5 text-sm text-slate-500">暂无月数据。</p>
          )}
        </section>

        {selectedView === "x" ? (
          <section className="mt-6 grid gap-4 xl:grid-cols-3">
            <LineChartPanel
              title="X 阅读量推移"
              rows={monthlyStats.map((row) => ({
                month: row.month,
                value: row.total.xImpressions,
              }))}
              color="#38bdf8"
            />
            <LineChartPanel
              title="X 互动量推移"
              rows={monthlyStats.map((row) => ({
                month: row.month,
                value: row.total.xEngagements,
              }))}
              color="#fbbf24"
            />
            <LineChartPanel
              title="X 粉丝数推移"
              rows={monthlyStats.map((row) => ({
                month: row.month,
                value: row.total.xFollowerCount,
              }))}
              color="#34d399"
            />
          </section>
        ) : (
          <section className="mt-6 grid gap-4 xl:grid-cols-3">
            <LineChartPanel
              title="YouTube 再生数推移"
              rows={monthlyStats.map((row) => ({
                month: row.month,
                value: row.total.youtubeTotalPlayback,
              }))}
              color="#f87171"
            />
            <LineChartPanel
              title="YouTube 合計Imp推移"
              rows={monthlyStats.map((row) => ({
                month: row.month,
                value: row.total.youtubeTotalImpressions,
              }))}
              color="#a78bfa"
            />
            <LineChartPanel
              title="YouTube 登録者推移"
              rows={monthlyStats.map((row) => ({
                month: row.month,
                value: row.total.youtubeSubscriberCount,
              }))}
              color="#60a5fa"
            />
          </section>
        )}

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-xl font-bold">俱乐部选手</h2>
          <p className="mt-2 text-sm text-slate-400">
            下拉修改选手所属俱乐部后，选手名前缀会自动按新俱乐部简称显示，并同步到战队月数据表。
          </p>
          {safePlayers.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">当前没有归属到该战队的选手。</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-700">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">选手名</th>
                    <th className="px-4 py-3">读音</th>
                    <th className="px-4 py-3">位置</th>
                    <th className="px-4 py-3">阵营</th>
                    <th className="px-4 py-3">更改俱乐部</th>
                  </tr>
                </thead>
                <tbody>
                  {safePlayers.map((player) => (
                    <tr key={player.id} className="border-t border-slate-700">
                      <td className="px-4 py-3 font-semibold">
                        <Link
                          href={`/admin/players/${player.id}`}
                          className="hover:text-sky-300 hover:underline"
                        >
                          {getPlayerDisplayName(player)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {player.reading || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {player.position_label || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {player.roster_role || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <PlayerTeamSelect
                          playerId={player.id}
                          currentTeamId={player.current_team_id}
                          teams={safeTeams}
                          action={updatePlayerTeam}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-950 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-100">{value}</p>
    </div>
  );
}

function XTotalPanel({ summary }: { summary: MonthlySummary }) {
  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-slate-700">
      <div className="grid gap-3 bg-slate-950 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <MiniStat label="推文条数" value={formatMonthlyNumber(summary.total.xTweetCount)} />
        <MiniStat label="阅读量" value={formatMonthlyNumber(summary.total.xImpressions)} />
        <MiniStat label="互动量" value={formatMonthlyNumber(summary.total.xEngagements)} />
        <MiniStat label="ファンイベント" value={formatMonthlyNumber(summary.total.xFanEventCount)} />
        <MiniStat label="互动率" value={formatMonthlyPercent(summary.total.xEngagementRate)} />
        <MiniStat label="粉丝数" value={formatMonthlyNumber(summary.total.xFollowerCount)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] border-collapse bg-slate-900 text-left text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="px-4 py-3">推文条数</th>
              <th className="px-4 py-3">互动量</th>
              <th className="px-4 py-3">阅读量</th>
              <th className="px-4 py-3">ファンイベント</th>
              <th className="px-4 py-3">互动率</th>
              <th className="px-4 py-3">粉丝数</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-700">
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.xTweetCount)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.xEngagements)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.xImpressions)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.xFanEventCount)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyPercent(summary.total.xEngagementRate)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.xFollowerCount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <details className="border-t border-slate-700 bg-slate-950/50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-300">
          查看本月 X 明细
        </summary>
        <MonthlyXDetailRows summary={summary} />
      </details>
    </section>
  );
}

function YoutubeTotalPanel({ summary }: { summary: MonthlySummary }) {
  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-slate-700">
      <div className="grid gap-3 bg-slate-950 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <MiniStat label="投稿数量" value={formatMonthlyNumber(summary.total.youtubeTotalPostCount)} />
        <MiniStat label="视频播放" value={formatMonthlyNumber(summary.total.youtubeVideoViews)} />
        <MiniStat label="短视频播放" value={formatMonthlyNumber(summary.total.youtubeShortViews)} />
        <MiniStat label="直播观看" value={formatMonthlyNumber(summary.total.youtubeStreamViews)} />
        <MiniStat label="合計Imp" value={formatMonthlyNumber(summary.total.youtubeTotalImpressions)} />
        <MiniStat label="登録者数" value={formatMonthlyNumber(summary.total.youtubeSubscriberCount)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse bg-slate-900 text-left text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="px-4 py-3">投稿数量</th>
              <th className="px-4 py-3">视频播放</th>
              <th className="px-4 py-3">直播观看</th>
              <th className="px-4 py-3">直播次数</th>
              <th className="px-4 py-3">短视频投稿</th>
              <th className="px-4 py-3">短视频播放</th>
              <th className="px-4 py-3">点赞量</th>
              <th className="px-4 py-3">合計Imp</th>
              <th className="px-4 py-3">登録者数</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-700">
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.youtubeTotalPostCount)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.youtubeVideoViews)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.youtubeStreamViews)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.youtubeStreamCount)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.youtubeShortPostCount)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.youtubeShortViews)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.youtubeLikeCount)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.youtubeTotalImpressions)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatMonthlyNumber(summary.total.youtubeSubscriberCount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <details className="border-t border-slate-700 bg-slate-950/50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-300">
          查看本月 YouTube 明细
        </summary>
        <MonthlyYoutubeDetailRows summary={summary} />
      </details>
    </section>
  );
}

function MonthlyXDetailRows({ summary }: { summary: MonthlySummary }) {
  const rows = [
    ...summary.officialRows.map((row) => ({ type: "官方账号", row })),
    ...summary.playerRows.map((row) => ({ type: "选手", row })),
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-xs">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-4 py-2">分类</th>
            <th className="px-4 py-2">名称</th>
            <th className="px-4 py-2">推文</th>
            <th className="px-4 py-2">阅读量</th>
            <th className="px-4 py-2">互动量</th>
            <th className="px-4 py-2">ファンイベント</th>
            <th className="px-4 py-2">粉丝数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ type, row }) => (
            <tr key={`${type}-${row.id}`} className="border-t border-slate-800">
              <td className="px-4 py-2 text-slate-400">{type}</td>
              <td className="px-4 py-2 font-semibold">{row.playerName}</td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.xTweetCount)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.xImpressions)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.xEngagements)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.xFanEventCount)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.xFollowerCount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyYoutubeDetailRows({ summary }: { summary: MonthlySummary }) {
  const rows = [
    ...summary.officialRows.map((row) => ({ type: "官方账号", row })),
    ...summary.playerRows.map((row) => ({ type: "选手", row })),
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-left text-xs">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-4 py-2">分类</th>
            <th className="px-4 py-2">名称</th>
            <th className="px-4 py-2">動画投稿</th>
            <th className="px-4 py-2">動画視聴</th>
            <th className="px-4 py-2">ショート投稿</th>
            <th className="px-4 py-2">ショート視聴</th>
            <th className="px-4 py-2">配信回数</th>
            <th className="px-4 py-2">配信視聴</th>
            <th className="px-4 py-2">いいね</th>
            <th className="px-4 py-2">合計Imp</th>
            <th className="px-4 py-2">登録者</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ type, row }) => (
            <tr key={`${type}-${row.id}`} className="border-t border-slate-800">
              <td className="px-4 py-2 text-slate-400">{type}</td>
              <td className="px-4 py-2 font-semibold">{row.playerName}</td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.youtubeVideoPostCount)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.youtubeVideoViews)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.youtubeShortPostCount)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.youtubeShortViews)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.youtubeStreamCount)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.youtubeStreamViews)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.youtubeLikeCount)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.youtubeTotalImpressions)}
              </td>
              <td className="px-4 py-2 text-slate-300">
                {formatMonthlyNumber(row.youtubeSubscriberCount)}
              </td>
            </tr>
          ))}
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

function summarizeProjectRows(rows: ProjectTeamRow[]) {
  return rows.reduce(
    (summary, row) => {
      const status = String(row.status || "");

      if (isApprovedLike(status)) {
        summary.approved += 1;
      } else if (isWaitingReview(status)) {
        summary.waiting += 1;
      } else if (status === "returned") {
        summary.returned += 1;
      }

      summary.total += 1;
      return summary;
    },
    { total: 0, waiting: 0, returned: 0, approved: 0 }
  );
}

function summarizeMonthlyRows(rows: MonthlySubmissionRow[], currentMonth: string) {
  const currentSubmission = rows.find((row) => row.target_month === currentMonth);

  return {
    total: rows.length,
    approved: rows.filter((row) => row.status === "approved").length,
    currentStatus: currentSubmission
      ? getMonthlyAdminStatusLabel(currentSubmission.status)
      : "未提交",
  };
}
