import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  formatMonthLabel,
  formatMonthlyNumber,
  getMonthlyYoutubeViews,
  numericMonthlyValue,
  getMonthlyAdminStatusLabel,
  parseMonthlyPlayerRows,
  splitMonthlyRows,
} from "@/lib/monthly-data";
import { getPlayerDisplayName } from "@/lib/player-display";
import { getAdminStatusLabel, isApprovedLike, isWaitingReview } from "@/lib/status-labels";
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
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
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
  const monthlyStats = safeSubmissions.slice(0, 12).reverse().map((submission) => {
    const { officialRow, playerRows } = splitMonthlyRows(
      parseMonthlyPlayerRows(submission.player_rows)
    );
    const salary = playerRows.reduce((sum, row) => {
      return sum + numericMonthlyValue(row.salaryAmount);
    }, 0);
    const playerXImpressions = playerRows.reduce(
      (sum, row) => sum + numericMonthlyValue(row.xImpressions),
      0
    );
    const playerYoutubeViews = playerRows.reduce(
      (sum, row) => sum + getMonthlyYoutubeViews(row),
      0
    );
    const officialXImpressions = officialRow
      ? numericMonthlyValue(officialRow.xImpressions)
      : 0;
    const officialYoutubeViews = officialRow
      ? getMonthlyYoutubeViews(officialRow)
      : 0;

    return {
      month: submission.target_month,
      salary,
      players: playerRows.length,
      officialXImpressions,
      officialYoutubeViews,
      playerXImpressions,
      playerYoutubeViews,
      totalExposure:
        officialXImpressions +
        officialYoutubeViews +
        playerXImpressions +
        playerYoutubeViews,
    };
  });
  const maxSalary = Math.max(...monthlyStats.map((row) => row.salary), 1);

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
          <h2 className="text-xl font-bold">年度月数据可视化</h2>
          <div className="mt-4 space-y-3">
            {monthlyStats.length === 0 ? (
              <p className="text-sm text-slate-500">暂无月数据。</p>
            ) : (
              monthlyStats.map((row) => (
                <div key={row.month} className="grid gap-3 md:grid-cols-[110px_minmax(0,1fr)_140px] md:items-center">
                  <span className="text-sm text-slate-300">
                    {formatMonthLabel(row.month)}
                  </span>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${Math.max(4, (row.salary / maxSalary) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-slate-200">
                    {formatMonthlyNumber(row.salary)} 円
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-700">
          <div className="bg-slate-900 p-5">
            <h2 className="text-xl font-bold">官方账号与战队月数据</h2>
            <p className="mt-2 text-sm text-slate-400">
              官方账号数据只进入战队统计，不进入单个选手详情。
            </p>
          </div>
          <table className="w-full min-w-[900px] border-collapse bg-slate-900 text-left text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="px-4 py-3">月份</th>
                <th className="px-4 py-3">选手数</th>
                <th className="px-4 py-3">官方 X Imp</th>
                <th className="px-4 py-3">选手 X Imp</th>
                <th className="px-4 py-3">官方 YouTube 视听</th>
                <th className="px-4 py-3">选手 YouTube 视听</th>
                <th className="px-4 py-3">总曝光</th>
              </tr>
            </thead>
            <tbody>
              {monthlyStats.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={7}>
                    暂无月数据。
                  </td>
                </tr>
              ) : (
                monthlyStats.map((row) => (
                  <tr key={row.month} className="border-t border-slate-700">
                    <td className="px-4 py-3">{formatMonthLabel(row.month)}</td>
                    <td className="px-4 py-3 text-slate-300">{row.players}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatMonthlyNumber(row.officialXImpressions)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatMonthlyNumber(row.playerXImpressions)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatMonthlyNumber(row.officialYoutubeViews)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatMonthlyNumber(row.playerYoutubeViews)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-100">
                      {formatMonthlyNumber(row.totalExposure)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

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
