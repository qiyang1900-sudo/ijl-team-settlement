import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  formatMonthLabel,
  formatMonthlyNumber,
  parseMonthlyPlayerRows,
} from "@/lib/monthly-data";

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

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function addMonths(monthValue: string, offset: number) {
  const [year, month] = monthValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function LeagueSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const currentMonth = getCurrentMonth();
  const fromMonth = from || addMonths(currentMonth, -5);
  const toMonth = to || currentMonth;
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
  const playerRows = rows.flatMap((submission) => {
    const teamName = submission.teams?.name || "-";
    const teamShortName = submission.teams?.short_name || "-";

    return parseMonthlyPlayerRows(submission.player_rows).map((player) => ({
      submission,
      teamName,
      teamShortName,
      player,
      salary: Number(player.salaryAmount || 0) || 0,
      xImpressions: Number(player.xImpressions || 0) || 0,
      youtubeImpressions: Number(player.youtubeTotalImpressions || 0) || 0,
    }));
  });
  const totalSalary = playerRows.reduce((sum, row) => sum + row.salary, 0);
  const totalXImpressions = playerRows.reduce(
    (sum, row) => sum + row.xImpressions,
    0
  );
  const totalYoutubeImpressions = playerRows.reduce(
    (sum, row) => sum + row.youtubeImpressions,
    0
  );
  const byTeam = Array.from(
    playerRows.reduce((map, row) => {
      const key = row.teamShortName;
      const current = map.get(key) || {
        team: row.teamName,
        shortName: row.teamShortName,
        salary: 0,
        xImpressions: 0,
        youtubeImpressions: 0,
        players: 0,
      };

      current.salary += row.salary;
      current.xImpressions += row.xImpressions;
      current.youtubeImpressions += row.youtubeImpressions;
      current.players += 1;
      map.set(key, current);

      return map;
    }, new Map<string, { team: string; shortName: string; salary: number; xImpressions: number; youtubeImpressions: number; players: number }>())
  ).map(([, value]) => value);
  const maxTeamSalary = Math.max(...byTeam.map((row) => row.salary), 1);
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
              这里先搭建汇总框架：表1 Excel 上传字段确认后接入，表2使用战队月数据。
            </p>
          </div>
          <a
            href={exportHref}
            className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
          >
            导出当前数据 CSV
          </a>
        </div>

        <form className="mt-6 grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="block text-sm text-slate-300">
            开始月份
            <input
              type="month"
              name="from"
              defaultValue={fromMonth}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white"
            />
          </label>
          <label className="block text-sm text-slate-300">
            结束月份
            <input
              type="month"
              name="to"
              defaultValue={toMonth}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white"
            />
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
          <Stat label="給与合计" value={`${formatMonthlyNumber(totalSalary)} 円`} />
          <Stat label="总曝光" value={formatMonthlyNumber(totalXImpressions + totalYoutubeImpressions)} />
        </section>

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-xl font-bold">表1 Excel 上传框架</h2>
          <p className="mt-2 text-sm text-slate-400">
            等你确认表1列名、计算逻辑和导出格式后，这里会启用 Excel 上传、字段映射和表1可视化。
          </p>
          <div className="mt-4 rounded-lg border border-dashed border-slate-700 bg-slate-950 p-6 text-center text-sm text-slate-500">
            Excel 上传入口（字段确认后启用）
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-xl font-bold">战队汇总可视化</h2>
          <div className="mt-4 space-y-3">
            {byTeam.length === 0 ? (
              <p className="text-sm text-slate-500">暂无数据。</p>
            ) : (
              byTeam.map((row) => (
                <div key={row.shortName} className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)_140px] md:items-center">
                  <span className="text-sm font-semibold text-slate-200">
                    {row.shortName}
                  </span>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-violet-400"
                      style={{ width: `${Math.max(4, (row.salary / maxTeamSalary) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-300">
                    {formatMonthlyNumber(row.salary)} 円
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-700">
          <table className="w-full min-w-[920px] border-collapse bg-slate-900 text-left text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="px-4 py-3">战队</th>
                <th className="px-4 py-3">选手数</th>
                <th className="px-4 py-3">給与合计</th>
                <th className="px-4 py-3">X曝光</th>
                <th className="px-4 py-3">YouTube曝光</th>
              </tr>
            </thead>
            <tbody>
              {byTeam.map((row) => (
                <tr key={row.shortName} className="border-t border-slate-700">
                  <td className="px-4 py-3 font-semibold">
                    {row.team}（{row.shortName}）
                  </td>
                  <td className="px-4 py-3">{row.players}</td>
                  <td className="px-4 py-3">{formatMonthlyNumber(row.salary)} 円</td>
                  <td className="px-4 py-3">{formatMonthlyNumber(row.xImpressions)}</td>
                  <td className="px-4 py-3">{formatMonthlyNumber(row.youtubeImpressions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
