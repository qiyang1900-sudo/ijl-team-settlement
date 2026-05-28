import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  formatMonthLabel,
  formatMonthlyNumber,
} from "@/lib/monthly-data";
import {
  buildMonthOptions,
  getCurrentMonthValue,
} from "@/lib/month-options";
import {
  TeamMonthlyScore,
  buildTeamMonthlyScores,
  manualTeamScoreNotes,
} from "@/lib/team-score";

type TeamRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  is_active: boolean | null;
};

type MonthlySubmissionRow = {
  team_id: string;
  target_month: string;
  status: string | null;
  player_rows: unknown;
};

export default async function AdminTeamScoresPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">战队积分计算</h1>
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
    .lte("target_month", currentMonth)
    .order("target_month", { ascending: true });
  const availableMonths = (monthRows || []).map((row) =>
    String(row.target_month || "")
  );
  const monthOptions = buildMonthOptions(availableMonths, {
    includeFutureMonths: false,
    maxMonth: currentMonth,
  });
  const latestApprovedMonth = availableMonths
    .filter((value) => value <= currentMonth)
    .sort()
    .at(-1);
  const selectedMonth =
    month && /^\d{4}-\d{2}$/.test(month) && month <= currentMonth
      ? month
      : latestApprovedMonth || currentMonth;

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, short_name, is_active")
    .eq("is_active", true)
    .order("short_name", { ascending: true });
  const { data: submissions, error: submissionsError } = await supabase
    .from("monthly_data_submissions")
    .select("team_id, target_month, status, player_rows")
    .eq("status", "approved")
    .eq("target_month", selectedMonth);

  const safeTeams = (teams || []) as TeamRow[];
  const safeSubmissions = (submissions || []) as MonthlySubmissionRow[];
  const scores = buildTeamMonthlyScores(
    safeTeams,
    safeSubmissions,
    selectedMonth
  );
  const approvedCount = scores.filter((score) => score.hasApprovedData).length;
  const averageScore =
    scores.length > 0
      ? Math.round(
          scores.reduce((sum, score) => sum + score.score, 0) / scores.length
        )
      : 0;

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
            <h1 className="text-3xl font-bold">战队积分计算</h1>
            <p className="mt-2 text-slate-400">
              根据审核通过的月数据自动整理当月战队分数和扣分项。
            </p>
          </div>
          <form className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-900 p-4 sm:flex-row sm:items-end">
            <label className="text-sm text-slate-300">
              目标月份
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
            <button className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-200">
              计算
            </button>
          </form>
        </div>

        {(teamsError || submissionsError) ? (
          <section className="mt-6 rounded-xl border border-amber-500 bg-amber-950 p-5 text-amber-100">
            <p className="font-bold">积分数据读取失败</p>
            <p className="mt-2 text-xs">
              {teamsError?.message || submissionsError?.message}
            </p>
          </section>
        ) : null}

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <Stat label="目标月份" value={formatMonthLabel(selectedMonth)} />
          <Stat label="战队数" value={`${scores.length} 队`} />
          <Stat label="已通过数据" value={`${approvedCount} 队`} />
          <Stat label="平均分" value={`${averageScore}`} />
        </section>

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-xl font-bold">自动计算口径</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <RuleChip label="X" value="全队170推文或400万Imp、官方账号15推文" />
            <RuleChip label="動画" value="部门账号1本、2名以上选手投稿、全队22本" />
            <RuleChip label="配信" value="3名以上选手直播、全队20回以上" />
            <RuleChip label="Shorts/TikTok" value="全队5本以上短视频投稿" />
          </div>
          <div className="mt-4 rounded-lg bg-slate-950 p-4 text-sm text-slate-400">
            {manualTeamScoreNotes.map((note) => (
              <p key={note} className="leading-6">
                {note}
              </p>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {scores.map((score) => (
            <ScoreCard key={score.teamId} score={score} />
          ))}
        </section>
      </div>
    </main>
  );
}

function ScoreCard({ score }: { score: TeamMonthlyScore }) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
      <div className="grid grid-cols-[92px_1fr] border-b border-slate-700 text-sm">
        <div className="border-r border-slate-700 bg-orange-200 px-4 py-2 font-semibold text-slate-950">
          队伍
        </div>
        <div className="bg-orange-200 px-4 py-2 text-center font-semibold text-slate-950">
          {score.shortName}
        </div>
        <div className="border-r border-slate-700 px-4 py-2 text-slate-300">
          分数
        </div>
        <div className="px-4 py-2 text-center text-lg font-bold">
          {score.displayScore}
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <MetricChip label="全队推文" value={score.metrics.totalTweets} />
        <MetricChip label="官方推文" value={score.metrics.officialTweets} />
        <MetricChip label="总曝光" value={score.metrics.totalImpressions} />
        <MetricChip label="视频合计" value={score.metrics.totalVideosWithArchives} />
        <MetricChip label="直播次数" value={score.metrics.totalStreams} />
        <MetricChip label="Shorts/TikTok" value={score.metrics.totalShortPosts} />
      </div>

      <div className="border-t border-slate-700 p-4">
        <p className="text-sm font-semibold text-slate-300">减分理由</p>
        {score.deductions.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-emerald-300">
            自动计算项全部达成。
          </p>
        ) : (
          <ol className="mt-3 space-y-2 text-sm text-slate-200">
            {score.deductions.map((deduction, index) => (
              <li key={`${deduction.reason}-${index}`} className="leading-6">
                {index + 1}、{deduction.reason}
                <span className="ml-2 font-bold text-red-300">
                  -{deduction.points}分
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
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

function RuleChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-950 p-4">
      <p className="text-sm font-semibold text-slate-200">{label}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{value}</p>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-950 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">
        {formatMonthlyNumber(value)}
      </p>
    </div>
  );
}
