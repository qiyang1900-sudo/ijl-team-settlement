import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/lib/date-format";
import { parseClubActivityItems } from "@/lib/club-activities";
import DeleteMonthlySubmissionButton from "./DeleteMonthlySubmissionButton";
import ImagePreview from "./ImagePreview";
import ReminderButton from "../reviews/ReminderButton";
import {
  MonthlyDataStatus,
  MonthlyPlayerRow,
  buildMonthlyReminderSettings,
  formatMonthLabel,
  formatMonthlyNumber,
  getMonthlyAdminStatusLabel,
  getMonthlyStatusTone,
  getSalaryScreenshotSummary,
  isMonthlyReminderEligibleMonth,
  monthlyReminderStartMonth,
  normalizeMonthlyStatus,
  parseMonthlyPlayerRows,
  splitMonthlyRows,
} from "@/lib/monthly-data";
import {
  buildMonthlyReviewAlerts,
  formatAlertNumber,
  formatAlertPercent,
} from "@/lib/monthly-review-alerts";
import type { MonthlyReviewAlert } from "@/lib/monthly-review-alerts";

export const dynamic = "force-dynamic";

type MonthlySubmissionRow = {
  id: string;
  team_id: string;
  target_month: string;
  status: string;
  player_rows: unknown;
  club_activity_link: string | null;
  club_activity_image_url: string | null;
  club_activity_image_name: string | null;
  return_reason: string | null;
  submitted_at: string | null;
  reviewing_at: string | null;
  returned_at: string | null;
  approved_at: string | null;
  updated_at: string | null;
  teams: {
    id?: string | null;
    name: string | null;
    short_name: string | null;
    is_active?: boolean | null;
  } | null;
  deadline_at?: string | null;
  salary_screenshot_deadline_at?: string | null;
  isSynthetic?: boolean;
};

type TeamRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  is_active: boolean | null;
};

type MonthlySettingRow = {
  target_month: string;
  deadline_at: string | null;
  salary_screenshot_deadline_at?: string | null;
};

async function updateMonthlyDataStatus(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功。");
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
  const submissionId = String(formData.get("submission_id") || "");
  const actionType = String(formData.get("action_type") || "");
  const returnReason = String(formData.get("return_reason") || "").trim();
  const now = new Date().toISOString();

  if (!submissionId) {
    throw new Error("未找到月数据提交记录。");
  }

  const patch: Record<string, unknown> = {
    updated_at: now,
  };

  if (actionType === "reviewing") {
    patch.status = "reviewing";
    patch.reviewing_at = now;
  }

  if (actionType === "approved") {
    patch.status = "approved";
    patch.approved_at = now;
    patch.return_reason = null;
  }

  if (actionType === "returned") {
    patch.status = "returned";
    patch.returned_at = now;
    patch.return_reason = returnReason || "请补充月数据内容后重新提交。";
  }

  const { error } = await supabase
    .from("monthly_data_submissions")
    .update(patch)
    .eq("id", submissionId);

  if (error) {
    throw new Error(error.message);
  }

  redirect("/admin/reward");
}

async function deleteMonthlyDataSubmission(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功。");
  }

  const submissionId = String(formData.get("submission_id") || "");

  if (!submissionId) {
    throw new Error("未找到月数据提交记录。");
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
  const { error } = await supabase
    .from("monthly_data_submissions")
    .delete()
    .eq("id", submissionId);

  if (error) {
    throw new Error(error.message);
  }

  redirect("/admin/reward");
}

export default async function RewardPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">月数据审核</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
  const [submissionResult, settingsResult, teamsResult] = await Promise.all([
    supabase
      .from("monthly_data_submissions")
      .select(
        `
        *,
        teams (
          id,
          name,
          short_name,
          is_active
        )
      `
      )
      .order("updated_at", { ascending: false }),
    supabase.from("monthly_data_settings").select("*"),
    supabase
      .from("teams")
      .select("id, name, short_name, is_active")
      .eq("is_active", true),
  ]);
  const error = submissionResult.error || settingsResult.error || teamsResult.error;
  const rows = buildMonthlyReviewRows({
    submissions: (submissionResult.data || []) as MonthlySubmissionRow[],
    settings: buildMonthlyReminderSettings(
      (settingsResult.data || []) as MonthlySettingRow[]
    ),
    teams: (teamsResult.data || []) as TeamRow[],
  });
  const grouped = groupRows(rows);
  const alertMap = buildReviewAlertMap(rows);
  const alertCount = Array.from(alertMap.values()).filter(
    (alerts) => alerts.length > 0
  ).length;
  const reminderRows = rows.filter((row) =>
    isMonthlyReminderEligibleMonth(row.target_month)
  );
  const salaryMissingRows = reminderRows.filter((row) =>
    isSalaryScreenshotMissing(row)
  );
  const monthlyReminderCount = reminderRows.filter((row) =>
    isMonthlyReminderTarget(row.status)
  ).length;

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <Link
              href="/admin/dashboard"
              className="text-sm text-slate-400 hover:text-white"
            >
              ← 返回管理员后台
            </Link>

            <h1 className="mt-4 text-3xl font-bold">月数据审核</h1>
            <p className="mt-2 text-slate-400">
              审核战队每月提交的选手薪资、X、YouTube 和俱乐部活动资料。数据波动提醒只提示人工确认，不会改变状态、分数或录入数据。
            </p>
          </div>
          <Link
            href="/admin/monthly-import"
            className="rounded-lg bg-white px-4 py-3 text-sm font-bold text-slate-950 hover:bg-slate-200"
          >
            历史月数据导入
          </Link>
        </div>

        {error ? (
          <div className="rounded-xl border border-amber-500 bg-amber-950 p-5">
            <p className="font-bold text-amber-200">月数据表还没有准备好</p>
            <p className="mt-2 text-sm text-amber-100">{error.message}</p>
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
              <StatCard label="未提交" count={grouped.notSubmitted.length} color="slate" />
              <StatCard label="已提交" count={grouped.submitted.length} color="yellow" />
              <StatCard label="审核中" count={grouped.reviewing.length} color="orange" />
              <StatCard label="需人工确认" count={alertCount} color="amber" />
              <StatCard label="已驳回需补充" count={grouped.returned.length} color="red" />
              <StatCard label="已通过" count={grouped.approved.length} color="green" />
              <StatCard label="已保存" count={grouped.draft.length} color="blue" />
            </div>

            <div className="mb-6 rounded-xl border border-sky-400/40 bg-sky-950/30 p-4">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-base font-bold text-sky-100">
                    Discord 立即提醒
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    只提醒 {formatMonthLabel(monthlyReminderStartMonth)} 之后的月数据和給与截图。
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <ReminderButton
                    scope="monthly_all"
                    label={`提醒月数据 ${monthlyReminderCount} 条`}
                    confirmMessage="确定立即提醒所有月数据未提交、已保存或已驳回需补充的战队吗？"
                    disabled={monthlyReminderCount === 0}
                  />
                  <ReminderButton
                    scope="monthly_salary_all"
                    label={`提醒給与截图 ${salaryMissingRows.length} 条`}
                    confirmMessage="确定立即提醒所有給与截图未提交或部分提交的战队吗？"
                    disabled={salaryMissingRows.length === 0}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <ReviewSection
                title="未提交"
                rows={grouped.notSubmitted}
                color="slate"
                alertMap={alertMap}
              />
              <ReviewSection
                title="已提交"
                rows={grouped.submitted}
                color="yellow"
                alertMap={alertMap}
              />
              <ReviewSection
                title="审核中"
                rows={grouped.reviewing}
                color="orange"
                alertMap={alertMap}
              />
              <ReviewSection
                title="已驳回需补充"
                rows={grouped.returned}
                color="red"
                alertMap={alertMap}
              />
              <ReviewSection
                title="已通过"
                rows={grouped.approved}
                color="green"
                alertMap={alertMap}
              />
              <ReviewSection
                title="已保存"
                rows={grouped.draft}
                color="blue"
                alertMap={alertMap}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function buildMonthlyReviewRows({
  submissions,
  settings,
  teams,
}: {
  submissions: MonthlySubmissionRow[];
  settings: MonthlySettingRow[];
  teams: TeamRow[];
}) {
  const settingByMonth = new Map(
    settings.map((setting) => [setting.target_month, setting])
  );
  const submissionByTeamMonth = new Map(
    submissions.map((row) => [`${row.team_id}:${row.target_month}`, row])
  );
  const activeTeams = teams.filter((team) => team.is_active !== false);
  const syntheticRows = settings.flatMap((setting) =>
    activeTeams
      .filter((team) => !submissionByTeamMonth.has(`${team.id}:${setting.target_month}`))
      .map((team) => ({
        id: `missing-${setting.target_month}-${team.id}`,
        team_id: team.id,
        target_month: setting.target_month,
        status: "not_submitted",
        player_rows: [],
        club_activity_link: null,
        club_activity_image_url: null,
        club_activity_image_name: null,
        club_activity_image_mime_type: null,
        club_activity_image_storage_path: null,
        return_reason: null,
        submitted_at: null,
        reviewing_at: null,
        returned_at: null,
        approved_at: null,
        updated_at: setting.deadline_at || setting.salary_screenshot_deadline_at || null,
        teams: team,
        deadline_at: setting.deadline_at,
        salary_screenshot_deadline_at: setting.salary_screenshot_deadline_at || null,
        isSynthetic: true,
      }))
  );
  const rowsWithDeadlines = submissions.map((row) => {
    const setting = settingByMonth.get(row.target_month);

    return {
      ...row,
      deadline_at: setting?.deadline_at || null,
      salary_screenshot_deadline_at:
        setting?.salary_screenshot_deadline_at || null,
    };
  });

  return [...rowsWithDeadlines, ...syntheticRows].sort((a, b) => {
    const monthCompare = String(b.target_month).localeCompare(String(a.target_month));

    if (monthCompare !== 0) {
      return monthCompare;
    }

    return String(a.teams?.short_name || a.teams?.name || "").localeCompare(
      String(b.teams?.short_name || b.teams?.name || "")
    );
  });
}

function groupRows(rows: MonthlySubmissionRow[]) {
  return {
    notSubmitted: rows.filter(
      (row) => normalizeMonthlyStatus(row.status) === "not_submitted"
    ),
    draft: rows.filter((row) => normalizeMonthlyStatus(row.status) === "draft"),
    submitted: rows.filter(
      (row) => normalizeMonthlyStatus(row.status) === "submitted"
    ),
    reviewing: rows.filter(
      (row) => normalizeMonthlyStatus(row.status) === "reviewing"
    ),
    returned: rows.filter(
      (row) => normalizeMonthlyStatus(row.status) === "returned"
    ),
    approved: rows.filter(
      (row) => normalizeMonthlyStatus(row.status) === "approved"
    ),
  };
}

function getSalarySummaryForRow(row: MonthlySubmissionRow) {
  const { playerRows } = splitMonthlyRows(parseMonthlyPlayerRows(row.player_rows));

  return getSalaryScreenshotSummary(playerRows);
}

function isSalaryScreenshotMissing(row: MonthlySubmissionRow) {
  return !getSalarySummaryForRow(row).isComplete;
}

function isMonthlyReminderTarget(status: string | null | undefined) {
  const normalized = normalizeMonthlyStatus(status);

  return (
    normalized === "not_submitted" ||
    normalized === "draft" ||
    normalized === "returned"
  );
}

function buildReviewAlertMap(rows: MonthlySubmissionRow[]) {
  const alertMap = new Map<string, MonthlyReviewAlert[]>();

  for (const row of rows) {
    const status = normalizeMonthlyStatus(row.status);

    if (status !== "submitted" && status !== "reviewing") {
      alertMap.set(row.id, []);
      continue;
    }

    alertMap.set(row.id, buildMonthlyReviewAlerts(row, rows));
  }

  return alertMap;
}

function StatCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "yellow" | "orange" | "amber" | "red" | "green" | "blue" | "slate";
}) {
  const colorClass = {
    yellow: "border-yellow-500 bg-yellow-950 text-yellow-200",
    orange: "border-orange-500 bg-orange-950 text-orange-200",
    amber: "border-amber-400 bg-amber-950 text-amber-100",
    red: "border-red-500 bg-red-950 text-red-200",
    green: "border-green-500 bg-green-950 text-green-200",
    blue: "border-blue-500 bg-blue-950 text-blue-200",
    slate: "border-slate-700 bg-slate-900 text-slate-200",
  }[color];

  return (
    <div className={`rounded-lg border px-4 py-3 ${colorClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm opacity-80">{label}</p>
        <p className="text-2xl font-bold">{count}</p>
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  rows,
  color,
  alertMap,
}: {
  title: string;
  rows: MonthlySubmissionRow[];
  color: "yellow" | "orange" | "red" | "green" | "blue" | "slate";
  alertMap: Map<string, MonthlyReviewAlert[]>;
}) {
  const colorClass = {
    yellow: "border-yellow-500 bg-yellow-950 text-yellow-200",
    orange: "border-orange-500 bg-orange-950 text-orange-200",
    red: "border-red-500 bg-red-950 text-red-200",
    green: "border-green-500 bg-green-950 text-green-200",
    blue: "border-blue-500 bg-blue-950 text-blue-200",
    slate: "border-slate-700 bg-slate-900 text-slate-200",
  }[color];

  return (
    <details
      className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900"
      open={rows.length > 0}
    >
      <summary className={`cursor-pointer list-none border-b border-slate-700 px-4 py-3 ${colorClass}`}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-bold">
            {title} <span className="text-sm font-normal">({rows.length})</span>
          </h2>
          <span className="text-xs opacity-75">展开 / 收起</span>
        </div>
      </summary>

      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-400">暂无数据。</p>
      ) : (
        <div className="space-y-4 p-3">
          {rows.map((row) => (
            <ReviewRow
              key={row.id}
              row={row}
              alerts={alertMap.get(row.id) || []}
            />
          ))}
        </div>
      )}
    </details>
  );
}

function ReviewRow({
  row,
  alerts,
}: {
  row: MonthlySubmissionRow;
  alerts: MonthlyReviewAlert[];
}) {
  const status = normalizeMonthlyStatus(row.status);
  const { officialRow, playerRows: players } = splitMonthlyRows(
    parseMonthlyPlayerRows(row.player_rows)
  );
  const salarySummary = getSalarySummaryForRow(row);
  const totalSalary = players.reduce((sum, player) => {
    const amount = Number(player.salaryAmount || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return (
    <article className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
      <div className="grid gap-4 lg:grid-cols-[160px_110px_120px_150px_150px_140px_minmax(0,1fr)]">
        <CompactInfo
          label="战队"
          value={`${row.teams?.name || "-"}${row.teams?.short_name ? `（${row.teams.short_name}）` : ""}`}
        />
        <CompactInfo label="月份" value={formatMonthLabel(row.target_month)} />
        <div>
          <p className="text-xs text-slate-500">状态</p>
          <span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getMonthlyStatusTone(status)}`}>
            {getMonthlyAdminStatusLabel(status)}
          </span>
        </div>
        <CompactInfo
          label="月数据截止"
          value={row.deadline_at ? formatDateTime(row.deadline_at) : "-"}
        />
        <CompactInfo
          label="給与截图截止"
          value={
            row.salary_screenshot_deadline_at
              ? formatDateTime(row.salary_screenshot_deadline_at)
              : "-"
          }
        />
        <CompactInfo label="选手給与合计" value={`${formatMonthlyNumber(totalSalary)} 円`} />
        <div className="min-w-0">
          <p className="text-xs text-slate-500">給与截图</p>
          <p className="mt-1 text-sm font-semibold text-slate-200">
            {salarySummary.label}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isMonthlyReminderEligibleMonth(row.target_month) &&
        isMonthlyReminderTarget(row.status) &&
        row.team_id ? (
          <ReminderButton
            scope="monthly_single"
            monthlySubmissionId={row.isSynthetic ? undefined : row.id}
            teamId={row.team_id}
            targetMonth={row.target_month}
            label="月数据立即提醒"
            confirmMessage={`确定立即提醒 ${row.teams?.short_name || row.teams?.name || "该战队"} 提交 ${formatMonthLabel(row.target_month)} 月数据吗？`}
            compact
          />
        ) : null}
        {isMonthlyReminderEligibleMonth(row.target_month) &&
        isSalaryScreenshotMissing(row) &&
        row.team_id ? (
          <ReminderButton
            scope="monthly_salary_single"
            monthlySubmissionId={row.isSynthetic ? undefined : row.id}
            teamId={row.team_id}
            targetMonth={row.target_month}
            label="給与截图提醒"
            confirmMessage={`确定立即提醒 ${row.teams?.short_name || row.teams?.name || "该战队"} 提交 ${formatMonthLabel(row.target_month)} 給与截图吗？`}
            compact
          />
        ) : null}
      </div>

      {row.submitted_at ? (
        <div className="mt-3 text-xs text-slate-500">
          提交时间：{formatDateTime(row.submitted_at)}
        </div>
      ) : null}

      {row.return_reason ? (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3">
          <p className="text-xs font-semibold text-rose-200">驳回理由</p>
          <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-words pr-2 text-xs leading-5 text-rose-100">
            {row.return_reason}
          </p>
        </div>
      ) : null}

      {alerts.length > 0 ? <ReviewAlertPanel alerts={alerts} /> : null}

      {row.isSynthetic ? (
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-400">
          この戦隊はまだこの月の月データを提出していません。
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <PlayerDataTable players={players} />
          <div className="space-y-4">
            <OfficialDataPanel officialRow={officialRow} />
            <ActivityPanel row={row} />
          </div>
        </div>
      )}

      {row.isSynthetic ? null : <AdminActions row={row} status={status} />}

      {row.isSynthetic ? null : (
        <div className="mt-4 border-t border-slate-800 pt-4">
          <DeleteMonthlySubmissionButton
            submissionId={row.id}
            action={deleteMonthlyDataSubmission}
          />
        </div>
      )}
    </article>
  );
}

function ReviewAlertPanel({ alerts }: { alerts: MonthlyReviewAlert[] }) {
  return (
    <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-950/25 p-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-bold text-amber-100">数据波动提醒</p>
          <p className="mt-1 text-xs text-amber-100/75">
            与前三个月相比变化较大，仅提醒管理员人工确认，不影响数据和分数。
          </p>
        </div>
        <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-950">
          {alerts.length} 项
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {alerts.map((alert) => (
          <div
            key={`${alert.metric}-${alert.currentValue}-${alert.baselineValue}`}
            className={`rounded-lg border p-3 ${
              alert.level === "danger"
                ? "border-rose-400/50 bg-rose-950/30"
                : "border-amber-400/40 bg-slate-950/60"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-100">{alert.metric}</p>
              <span className="rounded-full bg-slate-900 px-2 py-1 text-[11px] text-slate-300">
                {alert.changePercent === null
                  ? "当月为 0"
                  : `${alert.changePercent > 0 ? "+" : ""}${formatAlertPercent(
                      alert.changePercent
                    )}`}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              当前 {formatAlertNumber(alert.currentValue)} / 基准{" "}
              {formatAlertNumber(alert.baselineValue)}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100">
              {alert.message}
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              {alert.basisLabel} · {alert.thresholdLabel}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OfficialDataPanel({
  officialRow,
}: {
  officialRow: MonthlyPlayerRow | null;
}) {
  if (!officialRow) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
        <h3 className="font-bold">公式アカウント</h3>
        <p className="mt-3 text-sm text-slate-400">未提交。</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
      <h3 className="font-bold">公式アカウント</h3>
      <div className="mt-3 grid gap-2 text-xs text-slate-300">
        <p>X Imp：{formatMonthlyNumber(officialRow.xImpressions)}</p>
        <p>X ENG：{formatMonthlyNumber(officialRow.xEngagements)}</p>
        <p>YT 合計Imp：{formatMonthlyNumber(officialRow.youtubeTotalImpressions)}</p>
        <p>YT 登録者：{formatMonthlyNumber(officialRow.youtubeSubscriberCount)}</p>
      </div>
    </div>
  );
}

function CompactInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function PlayerDataTable({ players }: { players: MonthlyPlayerRow[] }) {
  if (players.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 p-4 text-sm text-slate-400">
        选手数据暂无。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="min-w-[1500px] w-full text-left text-xs">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-3 py-2">選手名</th>
            <th className="px-3 py-2">給与</th>
            <th className="px-3 py-2">給与截图</th>
            <th className="px-3 py-2">X投稿</th>
            <th className="px-3 py-2">Xインプレッション</th>
            <th className="px-3 py-2">Xエンゲージメント</th>
            <th className="px-3 py-2">Xイベント</th>
            <th className="px-3 py-2">Xフォロワー</th>
            <th className="px-3 py-2">YT動画</th>
            <th className="px-3 py-2">YT動画視聴</th>
            <th className="px-3 py-2">YTショート</th>
            <th className="px-3 py-2">YTショート視聴</th>
            <th className="px-3 py-2">YTいいね</th>
            <th className="px-3 py-2">YT配信</th>
            <th className="px-3 py-2">YT配信視聴</th>
            <th className="px-3 py-2">合計インプレッション</th>
            <th className="px-3 py-2">登録者数</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => (
            <tr key={player.id || index} className="border-t border-slate-700">
              <td className="px-3 py-2 font-semibold">{player.playerName || "-"}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.salaryAmount)} 円</td>
              <td className="px-3 py-2">
                {player.salaryScreenshotUrl ? (
                  <ImagePreview
                    imageUrl={player.salaryScreenshotUrl}
                    fileName={player.salaryScreenshotName || player.playerName}
                  />
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.xTweetCount)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.xImpressions)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.xEngagements)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.xFanEventCount)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.xFollowerCount)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.youtubeVideoPostCount)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.youtubeVideoViews)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.youtubeShortPostCount)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.youtubeShortViews)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.youtubeLikeCount)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.youtubeStreamCount)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.youtubeStreamViews)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.youtubeTotalImpressions)}</td>
              <td className="px-3 py-2">{formatMonthlyNumber(player.youtubeSubscriberCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityPanel({ row }: { row: MonthlySubmissionRow }) {
  const activities = parseClubActivityItems({
    link: row.club_activity_link,
    imageUrl: row.club_activity_image_url,
    imageName: row.club_activity_image_name,
  });

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
      <h3 className="font-bold">俱乐部活动</h3>
      {activities.length > 0 ? (
        <div className="mt-3 space-y-3">
          {activities.map((activity, index) => (
            <div
              key={`${activity.id}-${index}`}
              className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"
            >
              <p className="text-xs font-semibold text-slate-400">
                クラブ活動 {index + 1}
              </p>
              {activity.link ? (
                <a
                  href={activity.link}
                  target="_blank"
                  className="mt-2 block break-all text-sm text-sky-300 underline"
                >
                  {activity.link}
                </a>
              ) : null}
              {activity.imageUrl ? (
                <div className="mt-3">
                  <ImagePreview
                    imageUrl={activity.imageUrl}
                    fileName={activity.imageName}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">未提交。</p>
      )}
    </div>
  );
}

function AdminActions({
  row,
  status,
}: {
  row: MonthlySubmissionRow;
  status: MonthlyDataStatus;
}) {
  const canReview = status === "submitted";
  const canDecide = status === "submitted" || status === "reviewing";

  if (!canReview && !canDecide) {
    return null;
  }

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-[180px_180px_minmax(0,1fr)]">
      {canReview ? (
        <form action={updateMonthlyDataStatus}>
          <input type="hidden" name="submission_id" value={row.id} />
          <button
            name="action_type"
            value="reviewing"
            className="w-full rounded-lg bg-orange-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-300"
          >
            开始审核
          </button>
        </form>
      ) : (
        <div />
      )}

      {canDecide ? (
        <form action={updateMonthlyDataStatus}>
          <input type="hidden" name="submission_id" value={row.id} />
          <button
            name="action_type"
            value="approved"
            className="w-full rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            审核通过
          </button>
        </form>
      ) : (
        <div />
      )}

      {canDecide ? (
        <form action={updateMonthlyDataStatus} className="flex gap-2">
          <input type="hidden" name="submission_id" value={row.id} />
          <input
            name="return_reason"
            placeholder="填写驳回理由"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white"
          />
          <button
            name="action_type"
            value="returned"
            className="rounded-lg bg-rose-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-rose-300"
          >
            驳回补充
          </button>
        </form>
      ) : null}
    </div>
  );
}
