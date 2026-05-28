import { createClient } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
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
  TeamScoreReview,
  buildTeamMonthlyScores,
  manualTeamScoreNotes,
} from "@/lib/team-score";

export const dynamic = "force-dynamic";

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

type TeamScoreReviewRow = TeamScoreReview & {
  id?: string;
};

async function saveTeamScoreReview(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功。");
  }

  const teamId = String(formData.get("team_id") || "");
  const targetMonth = String(formData.get("target_month") || "");
  const reviewStatus =
    String(formData.get("review_status") || "") === "finalized"
      ? "finalized"
      : "draft";

  if (!teamId || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    throw new Error("战队或目标月份不正确。");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey);
  const now = new Date().toISOString();
  const draftReview: TeamScoreReviewRow = {
    team_id: teamId,
    target_month: targetMonth,
    status: reviewStatus,
    player_management_score: parseBoundedFormNumber(
      formData.get("player_management_score"),
      15,
      15
    ),
    player_management_note: null,
    team_management_score: parseBoundedFormNumber(
      formData.get("team_management_score"),
      25,
      25
    ),
    team_management_note: null,
    youtube_manual_deduction: 0,
    youtube_manual_note: null,
    tiktok_manual_deduction: 0,
    tiktok_manual_note: null,
    x_manual_deduction: 0,
    x_manual_note: null,
    reviewer_note: parseOptionalText(formData.get("reviewer_note")),
    finalized_at: reviewStatus === "finalized" ? now : null,
  };

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, name, short_name, is_active")
    .eq("id", teamId)
    .maybeSingle();

  if (teamError || !team) {
    throw new Error(teamError?.message || "未找到战队。");
  }

  const { data: submissions, error: submissionsError } = await supabase
    .from("monthly_data_submissions")
    .select("team_id, target_month, status, player_rows")
    .eq("team_id", teamId)
    .eq("target_month", targetMonth)
    .eq("status", "approved");

  if (submissionsError) {
    throw new Error(submissionsError.message);
  }

  const [calculatedScore] = buildTeamMonthlyScores(
    [team as TeamRow],
    (submissions || []) as MonthlySubmissionRow[],
    targetMonth,
    [draftReview]
  );

  if (!calculatedScore?.hasApprovedData) {
    throw new Error("该月还没有审核通过的月数据，不能保存积分审核结果。");
  }

  const { error } = await supabase.from("team_monthly_scores").upsert(
    {
      ...draftReview,
      finalized_score:
        reviewStatus === "finalized" ? calculatedScore.score : null,
      finalized_grade:
        reviewStatus === "finalized" ? calculatedScore.grade : null,
      updated_at: now,
    },
    { onConflict: "team_id,target_month" }
  );

  if (error) {
    throw new Error(error.message);
  }

  redirect(`/admin/team-scores?month=${encodeURIComponent(targetMonth)}`);
}

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
  const { data: reviewRows, error: reviewRowsError } = await supabase
    .from("team_monthly_scores")
    .select(
      "id, team_id, target_month, status, player_management_score, player_management_note, team_management_score, team_management_note, youtube_manual_deduction, youtube_manual_note, tiktok_manual_deduction, tiktok_manual_note, x_manual_deduction, x_manual_note, reviewer_note, finalized_score, finalized_grade, finalized_at"
    )
    .eq("target_month", selectedMonth);

  const safeTeams = (teams || []) as TeamRow[];
  const safeSubmissions = (submissions || []) as MonthlySubmissionRow[];
  const safeReviews = reviewRowsError
    ? []
    : ((reviewRows || []) as TeamScoreReviewRow[]);
  const scores = buildTeamMonthlyScores(
    safeTeams,
    safeSubmissions,
    selectedMonth,
    safeReviews
  );
  const scoreTableReady = !reviewRowsError;
  const approvedCount = scores.filter((score) => score.hasApprovedData).length;
  const finalizedCount = scores.filter(
    (score) => score.review.status === "finalized"
  ).length;
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

        {(teamsError || submissionsError || reviewRowsError) ? (
          <section className="mt-6 rounded-xl border border-amber-500 bg-amber-950 p-5 text-amber-100">
            <p className="font-bold">积分数据读取失败</p>
            <p className="mt-2 text-xs">
              {teamsError?.message ||
                submissionsError?.message ||
                reviewRowsError?.message}
            </p>
            {reviewRowsError ? (
              <p className="mt-3 text-sm">
                如果是第一次使用积分审核，请先在 Supabase 执行
                <span className="font-semibold">
                  {" "}
                  supabase/team-monthly-scores.sql
                </span>
                ，创建保存每月分数的表。
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="mt-6 grid gap-3 md:grid-cols-5">
          <Stat label="目标月份" value={formatMonthLabel(selectedMonth)} />
          <Stat label="战队数" value={`${scores.length} 队`} />
          <Stat label="已通过数据" value={`${approvedCount} 队`} />
          <Stat label="已审核结束" value={`${finalizedCount} 队`} />
          <Stat label="当前平均分" value={`${averageScore}`} />
        </section>

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-xl font-bold">积分口径</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <RuleChip label="選手管理" value="15分，默认满分，人工确认后可减分" />
            <RuleChip label="チーム管理" value="25分，默认满分，人工确认后可减分" />
            <RuleChip label="YouTube" value="30分封顶，视频/直播按板块扣分" />
            <RuleChip label="TikTok / X" value="TikTok 15分，X 15分，单项不扣穿" />
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
            <ScoreCard
              key={score.teamId}
              score={score}
              canPersist={scoreTableReady}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

function ScoreCard({
  score,
  canPersist,
}: {
  score: TeamMonthlyScore;
  canPersist: boolean;
}) {
  const playerManagementSection = getSection(score, "playerManagement");
  const teamManagementSection = getSection(score, "teamManagement");
  const canSave = canPersist && score.hasApprovedData;
  const reviewStatusLabel = !score.hasApprovedData
    ? "无通过数据"
    : score.review.status === "finalized"
      ? "已审核结束"
      : "待人工确认";
  const finalizedAtLabel = score.review.finalizedAt
    ? new Date(score.review.finalizedAt).toLocaleString("ja-JP")
    : null;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
      <div className="border-b border-slate-700 bg-slate-950/70 p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs text-slate-500">队伍</p>
            <h2 className="mt-1 text-2xl font-bold">{score.shortName}</h2>
            <p className="mt-1 text-sm text-slate-400">{score.teamName}</p>
          </div>
          <div className="text-left sm:text-right">
            <span className="inline-flex rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
              {reviewStatusLabel}
            </span>
            <p className="mt-2 text-3xl font-bold">{score.displayScore}</p>
            {finalizedAtLabel ? (
              <p className="mt-1 text-xs text-slate-500">
                审核结束：{finalizedAtLabel}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
        {score.sections.map((section) => (
          <SectionSummary key={section.key} section={section} />
        ))}
      </div>

      <ScoreFoldout title="详细数据・人工审核" badge={`${score.deductions.length} 项扣分`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricChip label="全队推文" value={score.metrics.totalTweets} />
          <MetricChip label="官方推文" value={score.metrics.officialTweets} />
          <MetricChip label="总曝光" value={score.metrics.totalImpressions} />
          <MetricChip label="视频合计" value={score.metrics.totalVideosWithArchives} />
          <MetricChip label="直播次数" value={score.metrics.totalStreams} />
          <MetricChip label="Shorts/TikTok" value={score.metrics.totalShortPosts} />
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
          <p className="text-sm font-semibold text-slate-300">扣分项</p>
          {score.deductions.length === 0 ? (
            <p className="mt-3 text-sm font-semibold text-emerald-300">
              已计算项目全部达成，人工评分暂无扣分。
            </p>
          ) : (
            <ol className="mt-3 max-h-44 space-y-2 overflow-auto pr-2 text-sm text-slate-200">
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

        <form action={saveTeamScoreReview} className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
          <input type="hidden" name="team_id" value={score.teamId} />
          <input type="hidden" name="target_month" value={score.month} />

          <div className="grid gap-3 md:grid-cols-2">
            <ScoreNumberInput
              label="選手管理分数"
              name="player_management_score"
              max={playerManagementSection.maxPoints}
              defaultValue={score.review.playerManagementScore}
            />
            <ScoreNumberInput
              label="チーム管理分数"
              name="team_management_score"
              max={teamManagementSection.maxPoints}
              defaultValue={score.review.teamManagementScore}
            />
          </div>

          <label className="mt-3 block text-sm text-slate-300">
            审核备注
            <textarea
              name="reviewer_note"
              defaultValue={score.review.reviewerNote}
              className="mt-2 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white"
            />
          </label>

          {!canPersist ? (
            <p className="mt-3 rounded-lg border border-amber-500 bg-amber-950 px-3 py-2 text-sm text-amber-100">
              保存表尚未创建，暂时不能保存积分审核。
            </p>
          ) : null}
          {!score.hasApprovedData ? (
            <p className="mt-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-400">
              该月没有审核通过的月数据，不能结束积分审核。
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              name="review_status"
              value="draft"
              disabled={!canSave}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              保存草稿
            </button>
            <button
              name="review_status"
              value="finalized"
              disabled={!canSave}
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              已审核结束
            </button>
          </div>
        </form>
      </ScoreFoldout>
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

function SectionSummary({
  section,
}: {
  section: TeamMonthlyScore["sections"][number];
}) {
  const deductedPoints = section.maxPoints - section.score;

  return (
    <div className="flex min-h-[116px] flex-col rounded-lg bg-slate-950 p-3">
      <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <p className="break-words text-xs font-semibold leading-5 text-slate-400">
          {section.label}
        </p>
        <p className="text-sm font-bold text-white">
          {section.score}/{section.maxPoints}
        </p>
      </div>
      <p className="mt-1 min-h-4 text-xs leading-4 text-slate-500">
        {section.autoScore === null ? "人工评分" : `自动评分 ${section.autoScore}`}
      </p>
      <div className="mt-auto pt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-emerald-400"
            style={{ width: `${(section.score / section.maxPoints) * 100}%` }}
          />
        </div>
        {deductedPoints > 0 ? (
          <p className="mt-2 text-xs font-semibold text-red-300">
            -{deductedPoints}分
          </p>
        ) : (
          <p className="mt-2 text-xs font-semibold text-emerald-300">满分</p>
        )}
      </div>
    </div>
  );
}

function ScoreFoldout({
  title,
  badge,
  children,
}: {
  title: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <details className="border-t border-slate-800">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span className="text-sm font-semibold text-slate-300">{title}</span>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
          {badge} · 展开 / 收起
        </span>
      </summary>
      <div className="border-t border-slate-800 p-4">{children}</div>
    </details>
  );
}

function ScoreNumberInput({
  label,
  name,
  max,
  defaultValue,
}: {
  label: string;
  name: string;
  max: number;
  defaultValue: number;
}) {
  return (
    <label className="text-sm text-slate-300">
      {label}
      <input
        type="number"
        name={name}
        min={0}
        max={max}
        step={1}
        defaultValue={defaultValue}
        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white"
      />
      <span className="mt-1 block text-xs text-slate-500">0 - {max}</span>
    </label>
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

function getSection(
  score: TeamMonthlyScore,
  key: TeamMonthlyScore["sections"][number]["key"]
) {
  const section = score.sections.find((item) => item.key === key);

  if (!section) {
    throw new Error(`积分板块缺失：${key}`);
  }

  return section;
}

function parseBoundedFormNumber(
  value: FormDataEntryValue | null,
  defaultValue: number,
  maxValue: number
) {
  const rawValue = String(value ?? "").trim();

  if (!rawValue) {
    return defaultValue;
  }

  const numberValue = Number(rawValue);

  if (!Number.isFinite(numberValue)) {
    return defaultValue;
  }

  return Math.min(maxValue, Math.max(0, Math.round(numberValue)));
}

function parseOptionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  return text || null;
}
