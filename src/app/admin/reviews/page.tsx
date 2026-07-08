import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/lib/date-format";
import {
  getAdminStatusLabel,
  getStatusTone,
  isApprovedLike,
} from "@/lib/status-labels";
import {
  buildMonthlyReminderSettings,
  formatMonthLabel,
  getMonthlyAdminStatusLabel,
  getMonthlyStatusTone,
  isMonthlyDataReminderWindowOpen,
  isMonthlyReminderEligibleMonth,
  isSalaryScreenshotReminderWindowOpen,
  getSalaryScreenshotSummary,
  normalizeMonthlyStatus,
  parseMonthlyPlayerRows,
  splitMonthlyRows,
} from "@/lib/monthly-data";
import ReminderButton from "./ReminderButton";

export const dynamic = "force-dynamic";

type ReviewRowData = {
  id: string;
  status: string;
  submitted_at: string | null;
  return_reason: string | null;
  projects: {
    id: string;
    title: string | null;
    description: string | null;
    deadline_at: string | null;
  } | null;
  teams: {
    id: string;
    name: string | null;
    short_name: string | null;
  } | null;
};

type MonthlySubmissionReviewRow = {
  id: string;
  team_id: string;
  target_month: string;
  status: string;
  salary_status?: string | null;
  player_rows?: unknown;
  return_reason?: string | null;
  salary_return_reason?: string | null;
  submitted_at: string | null;
  salary_submitted_at?: string | null;
  reviewing_at?: string | null;
  returned_at?: string | null;
  approved_at?: string | null;
  salary_reviewing_at?: string | null;
  salary_returned_at?: string | null;
  salary_approved_at?: string | null;
  updated_at?: string | null;
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

type MonthlySettingRow = {
  target_month: string;
  deadline_at: string | null;
  salary_screenshot_deadline_at?: string | null;
};

type TeamRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  is_active: boolean | null;
};

type ReviewKind = "monthly" | "salary";

type ReviewGroups<T> = {
  notSubmitted: T[];
  draft: T[];
  submitted: T[];
  reviewing: T[];
  returned: T[];
  approved: T[];
};

async function updateMonthlyDataReviewStatus(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功。");
  }

  const submissionId = String(formData.get("submission_id") || "");
  const actionType = String(formData.get("action_type") || "");
  const reviewKind = String(formData.get("review_kind") || "monthly");
  const returnReason = String(formData.get("return_reason") || "").trim();
  const redirectMonth = normalizeReviewMonthParam(formData.get("redirect_month"));

  if (!submissionId) {
    throw new Error("未找到月数据提交记录。");
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    updated_at: now,
  };

  if (reviewKind === "salary") {
    if (actionType === "reviewing") {
      patch.salary_status = "reviewing";
      patch.salary_reviewing_at = now;
    } else if (actionType === "approved") {
      patch.salary_status = "approved";
      patch.salary_approved_at = now;
      patch.salary_return_reason = null;
    } else if (actionType === "returned") {
      patch.salary_status = "returned";
      patch.salary_returned_at = now;
      patch.salary_return_reason = returnReason || "请补充工资截图后重新提交。";
    }
  } else if (actionType === "reviewing") {
    patch.status = "reviewing";
    patch.reviewing_at = now;
  } else if (actionType === "approved") {
    patch.status = "approved";
    patch.approved_at = now;
    patch.return_reason = null;
  } else if (actionType === "returned") {
    patch.status = "returned";
    patch.returned_at = now;
    patch.return_reason = returnReason || "请补充月数据内容后重新提交。";
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
  const { error } = await supabase
    .from("monthly_data_submissions")
    .update(patch)
    .eq("id", submissionId);

  if (error) {
    throw new Error(error.message);
  }

  redirect(redirectMonth ? `/admin/reviews?month=${redirectMonth}` : "/admin/reviews");
}

function isResubmittedStatus(status: string) {
  return status === "resubmitted";
}

function isReturnedStatus(status: string) {
  return status === "returned";
}

function isSubmittedReviewRow(row: ReviewRowData) {
  const status = String(row.status || "");
  const submittedLikeStatuses = ["submitted", "pending", "pending_review"];

  if (submittedLikeStatuses.includes(status)) {
    return true;
  }

  return Boolean(
    row.submitted_at &&
      !isResubmittedStatus(status) &&
      !isReturnedStatus(status) &&
      !isApprovedLike(status) &&
      !["not_submitted", "draft"].includes(status)
  );
}

function canSendProjectReminder(row: ReviewRowData) {
  return (
    (row.status === "not_submitted" ||
      row.status === "draft" ||
      row.status === "returned") &&
    !isSubmittedReviewRow(row)
  );
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const selectedMonth = normalizeReviewMonthParam(month);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">提交审核</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);

  const [projectResult, monthlyResult, settingsResult, teamsResult] =
    await Promise.all([
      supabase
        .from("project_teams")
        .select(
          `
          id,
          status,
          submitted_at,
          returned_at,
          approved_at,
          return_reason,
          projects (
            id,
            title,
            description,
            deadline_at
          ),
          teams (
            id,
            name,
            short_name
          )
        `
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("monthly_data_submissions")
        .select(
          `
          id,
          team_id,
          target_month,
          status,
          salary_status,
          player_rows,
          return_reason,
          salary_return_reason,
          submitted_at,
          salary_submitted_at,
          reviewing_at,
          returned_at,
          approved_at,
          salary_reviewing_at,
          salary_returned_at,
          salary_approved_at,
          updated_at,
          teams (
            id,
            name,
            short_name,
            is_active
          )
        `
        ),
      supabase.from("monthly_data_settings").select("*"),
      supabase
        .from("teams")
        .select("id, name, short_name, is_active")
        .eq("is_active", true),
    ]);

  const error =
    projectResult.error ||
    monthlyResult.error ||
    settingsResult.error ||
    teamsResult.error;
  const allRows = (projectResult.data || []) as unknown as ReviewRowData[];
  const monthlyRows = buildMonthlySubmissionReviewRows({
    submissions: (monthlyResult.data || []) as unknown as MonthlySubmissionReviewRow[],
    settings: buildMonthlyReminderSettings(
      (settingsResult.data || []) as MonthlySettingRow[]
    ),
    teams: (teamsResult.data || []) as TeamRow[],
  });
  const monthOptions = buildReviewMonthOptions({
    projectRows: allRows,
    monthlyRows,
    selectedMonth,
  });
  const filteredProjectRows = filterProjectRowsByMonth(allRows, selectedMonth);
  const filteredMonthlyRows = filterMonthlyRowsByMonth(monthlyRows, selectedMonth);
  const projectGrouped = groupProjectReviewRows(filteredProjectRows);
  const monthlyGrouped = groupMonthlyReviewRows(filteredMonthlyRows, "monthly");
  const salaryGrouped = groupMonthlyReviewRows(filteredMonthlyRows, "salary");
  const monthlyReminderRows = filteredMonthlyRows.filter(
    (row) =>
      isMonthlyReminderEligibleMonth(row.target_month) &&
      isMonthlyDataReminderWindowOpen(row) &&
      isMonthlyReviewReminderTarget(row.status)
  );
  const salaryReminderRows = filteredMonthlyRows.filter(
    (row) =>
      isMonthlyReminderEligibleMonth(row.target_month) &&
      isSalaryScreenshotReminderWindowOpen(row) &&
      isSalaryReviewReminderTarget(row)
  );

  const submitted =
    projectGrouped.submitted.length +
    projectGrouped.reviewing.length +
    monthlyGrouped.submitted.length +
    monthlyGrouped.reviewing.length +
    salaryGrouped.submitted.length +
    salaryGrouped.reviewing.length;
  const returned =
    projectGrouped.returned.length +
    monthlyGrouped.returned.length +
    salaryGrouped.returned.length;
  const approved =
    projectGrouped.approved.length +
    monthlyGrouped.approved.length +
    salaryGrouped.approved.length;
  const notSubmitted =
    projectGrouped.notSubmitted.length +
    monthlyGrouped.notSubmitted.length +
    salaryGrouped.notSubmitted.length;

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <Link
              href="/admin/dashboard"
              className="text-sm text-slate-400 hover:text-white"
            >
              ← 返回管理员后台
            </Link>

            <h1 className="mt-3 text-3xl font-bold">提交审核</h1>
            <p className="mt-1 text-sm text-slate-400">
              按审核状态和月份查看所有战队提交资料。
            </p>
          </div>
          <MonthFilterControl
            monthOptions={monthOptions}
            selectedMonth={selectedMonth}
          />
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">读取失败</p>
            <p className="mt-2 text-sm text-red-200">{error.message}</p>
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="未提交" count={notSubmitted} color="slate" />
              <StatCard label="已提交 / 待审核" count={submitted} color="yellow" />
              <StatCard label="已驳回需补充" count={returned} color="red" />
              <StatCard label="已通过" count={approved} color="green" />
            </div>

            <div className="mb-4 rounded-xl border border-sky-400/40 bg-sky-950/30 p-3">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-sm font-bold text-sky-100">
                    Discord 立即提醒
                  </h2>
                  <p className="mt-1 text-xs text-slate-300">
                    顶部按钮按类型批量提醒；每条记录也可以单独立即提醒。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ReminderButton
                    scope="monthly_all"
                    label={`提醒月数据 ${monthlyReminderRows.length} 条`}
                    confirmMessage="确定立即提醒所有进入提醒窗口且未完成月数据提交的战队吗？"
                    targetMonth={selectedMonth || undefined}
                    disabled={monthlyReminderRows.length === 0}
                  />
                  <ReminderButton
                    scope="monthly_salary_all"
                    label={`提醒工资截图 ${salaryReminderRows.length} 条`}
                    confirmMessage="确定立即提醒所有进入提醒窗口且未完成工资截图提交的战队吗？"
                    targetMonth={selectedMonth || undefined}
                    disabled={salaryReminderRows.length === 0}
                  />
                  <ReminderButton
                    scope="project_all"
                    label={`提醒项目 ${projectGrouped.notSubmitted.length + projectGrouped.returned.length} 条`}
                    confirmMessage="确定立即提醒所有项目未提交或待再次提交的战队吗？"
                    targetMonth={selectedMonth || undefined}
                    disabled={
                      projectGrouped.notSubmitted.length +
                        projectGrouped.returned.length ===
                      0
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <MonthlyReviewCategory
                title="月数据审核"
                grouped={monthlyGrouped}
                reviewKind="monthly"
                selectedMonth={selectedMonth}
              />
              <MonthlyReviewCategory
                title="工资审核"
                grouped={salaryGrouped}
                reviewKind="salary"
                selectedMonth={selectedMonth}
              />
              <ProjectReviewCategory grouped={projectGrouped} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function ProjectReviewCategory({
  grouped,
}: {
  grouped: ReviewGroups<ReviewRowData>;
}) {
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
      <CategoryHeader
        title="项目审核"
        description="请款书和结案报告提交审核，按项目记录分别处理。"
      />
      <CategoryStats grouped={grouped} />
      <div className="mt-3 space-y-2">
        <ReviewSection title="项目未提交" rows={grouped.notSubmitted} color="slate" />
        <ReviewSection title="项目已提交 / 待审核" rows={grouped.submitted} color="yellow" />
        <ReviewSection title="项目审核中" rows={grouped.reviewing} color="orange" />
        <ReviewSection title="项目已驳回需补充" rows={grouped.returned} color="red" />
        <ReviewSection title="项目已通过" rows={grouped.approved} color="green" />
      </div>
    </section>
  );
}

function MonthFilterControl({
  monthOptions,
  selectedMonth,
}: {
  monthOptions: string[];
  selectedMonth: string;
}) {
  return (
    <form
      action="/admin/reviews"
      className="rounded-xl border border-slate-700 bg-slate-900/70 p-3"
    >
      <label
        htmlFor="review-month"
        className="block text-xs font-semibold text-slate-400"
      >
        查看月份
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <select
          id="review-month"
          name="month"
          defaultValue={selectedMonth}
          className="min-w-44 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-300"
        >
          <option value="">全部月份</option>
          {monthOptions.map((option) => (
            <option key={option} value={option}>
              {formatMonthLabel(option)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-950 hover:bg-slate-200"
        >
          查看
        </button>
        {selectedMonth ? (
          <Link
            href="/admin/reviews"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            清除
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function MonthlyReviewCategory({
  title,
  grouped,
  reviewKind,
  selectedMonth,
}: {
  title: string;
  grouped: ReviewGroups<MonthlySubmissionReviewRow>;
  reviewKind: ReviewKind;
  selectedMonth: string;
}) {
  const description =
    reviewKind === "salary"
      ? "选手工资截图单独提交、单独审核，不影响月数据审核状态。"
      : "X、YouTube 和クラブ活動资料单独提交、单独审核。";

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
      <CategoryHeader title={title} description={description} />
      <CategoryStats grouped={grouped} />
      <div className="mt-3 space-y-2">
        <MonthlyReviewSection
          title={`${title}：未提交`}
          rows={grouped.notSubmitted}
          color="slate"
          reviewKind={reviewKind}
          selectedMonth={selectedMonth}
        />
        <MonthlyReviewSection
          title={`${title}：已提交 / 待审核`}
          rows={grouped.submitted}
          color="yellow"
          reviewKind={reviewKind}
          selectedMonth={selectedMonth}
        />
        <MonthlyReviewSection
          title={`${title}：审核中`}
          rows={grouped.reviewing}
          color="orange"
          reviewKind={reviewKind}
          selectedMonth={selectedMonth}
        />
        <MonthlyReviewSection
          title={`${title}：已驳回需补充`}
          rows={grouped.returned}
          color="red"
          reviewKind={reviewKind}
          selectedMonth={selectedMonth}
        />
        <MonthlyReviewSection
          title={`${title}：已通过`}
          rows={grouped.approved}
          color="green"
          reviewKind={reviewKind}
          selectedMonth={selectedMonth}
        />
      </div>
    </section>
  );
}

function CategoryHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-end">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-xs text-slate-400">{description}</p>
    </div>
  );
}

function CategoryStats<T>({ grouped }: { grouped: ReviewGroups<T> }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard label="未提交" count={grouped.notSubmitted.length} color="slate" />
      <StatCard label="待审核" count={grouped.submitted.length} color="yellow" />
      <StatCard label="审核中" count={grouped.reviewing.length} color="orange" />
      <StatCard label="已驳回" count={grouped.returned.length} color="red" />
      <StatCard label="已通过" count={grouped.approved.length} color="green" />
    </div>
  );
}

function StatCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "yellow" | "orange" | "red" | "green" | "slate" | "blue";
}) {
  const colorClass = {
    yellow: "border-yellow-500 bg-yellow-950 text-yellow-200",
    orange: "border-orange-500 bg-orange-950 text-orange-200",
    red: "border-red-500 bg-red-950 text-red-200",
    green: "border-green-500 bg-green-950 text-green-200",
    slate: "border-slate-700 bg-slate-900 text-slate-200",
    blue: "border-blue-500 bg-blue-950 text-blue-200",
  }[color];

  return (
    <div className={`rounded-lg border px-3 py-2 ${colorClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs opacity-80">{label}</p>
        <p className="text-xl font-bold">{count}</p>
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  rows,
  color,
}: {
  title: string;
  rows: ReviewRowData[];
  color: "yellow" | "orange" | "red" | "green" | "slate" | "blue";
}) {
  const colorClass = {
    yellow: "border-yellow-500 bg-yellow-950 text-yellow-200",
    orange: "border-orange-500 bg-orange-950 text-orange-200",
    red: "border-red-500 bg-red-950 text-red-200",
    green: "border-green-500 bg-green-950 text-green-200",
    slate: "border-slate-700 bg-slate-900 text-slate-200",
    blue: "border-blue-500 bg-blue-950 text-blue-200",
  }[color];

  return (
    <details
      className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900"
    >
      <summary className={`cursor-pointer list-none border-b border-slate-700 px-3 py-2 ${colorClass}`}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-bold">
            {title} <span className="text-sm font-normal">({rows.length})</span>
          </h2>
          <span className="text-xs opacity-75">展开 / 收起</span>
        </div>
      </summary>

      {rows.length === 0 ? (
        <p className="px-3 py-2 text-sm text-slate-400">暂无数据。</p>
      ) : (
        <div className="space-y-2 p-2">
          {rows.map((row) => (
            <ReviewRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </details>
  );
}

function MonthlyReviewSection({
  title,
  rows,
  color,
  reviewKind,
  selectedMonth,
}: {
  title: string;
  rows: MonthlySubmissionReviewRow[];
  color: "yellow" | "orange" | "red" | "green" | "slate" | "blue";
  reviewKind: ReviewKind;
  selectedMonth: string;
}) {
  const colorClass = {
    yellow: "border-yellow-500 bg-yellow-950 text-yellow-200",
    orange: "border-orange-500 bg-orange-950 text-orange-200",
    red: "border-red-500 bg-red-950 text-red-200",
    green: "border-green-500 bg-green-950 text-green-200",
    slate: "border-slate-700 bg-slate-900 text-slate-200",
    blue: "border-blue-500 bg-blue-950 text-blue-200",
  }[color];

  return (
    <details
      className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900"
    >
      <summary className={`cursor-pointer list-none border-b border-slate-700 px-3 py-2 ${colorClass}`}>
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-bold">
            {title} <span className="text-sm font-normal">({rows.length})</span>
          </h3>
          <span className="text-xs opacity-75">展开 / 收起</span>
        </div>
      </summary>

      {rows.length === 0 ? (
        <p className="px-3 py-2 text-sm text-slate-400">暂无数据。</p>
      ) : (
        <div className="grid gap-2 p-2 xl:grid-cols-2">
          {rows.map((row) => (
            <MonthlyReviewRow
              key={`${reviewKind}-${row.id}`}
              row={row}
              reviewKind={reviewKind}
              selectedMonth={selectedMonth}
            />
          ))}
        </div>
      )}
    </details>
  );
}

function MonthlyReviewRow({
  row,
  reviewKind,
  selectedMonth,
}: {
  row: MonthlySubmissionReviewRow;
  reviewKind: ReviewKind;
  selectedMonth: string;
}) {
  const status = getMonthlyReviewStatus(row, reviewKind);
  const submittedAt =
    reviewKind === "salary" ? row.salary_submitted_at : row.submitted_at;
  const returnReason =
    reviewKind === "salary" ? row.salary_return_reason : row.return_reason;
  const deadlineAt =
    reviewKind === "salary"
      ? row.salary_screenshot_deadline_at
      : row.deadline_at;
  const targetLabel =
    reviewKind === "salary"
      ? `${formatMonthLabel(row.target_month)} 工资截图`
      : `${formatMonthLabel(row.target_month)} 月数据`;
  const statusLabel = getMonthlyAdminStatusLabel(status);
  const { officialRow, playerRows } = splitMonthlyRows(
    parseMonthlyPlayerRows(row.player_rows)
  );
  const salarySummary = getSalarySummaryForRow(row);
  const monthlyDataSummary =
    playerRows.length === 0 && !officialRow
      ? "未提交"
      : `${playerRows.length} 名选手 / 公式${officialRow ? "已提交" : "未提交"}`;
  const canSendMonthlyReminder =
    reviewKind === "monthly" &&
    isMonthlyReminderEligibleMonth(row.target_month) &&
    isMonthlyDataReminderWindowOpen(row) &&
    isMonthlyReviewReminderTarget(row.status) &&
    Boolean(row.team_id);
  const canSendSalaryReminder =
    reviewKind === "salary" &&
    isMonthlyReminderEligibleMonth(row.target_month) &&
    isSalaryScreenshotReminderWindowOpen(row) &&
    isSalaryReviewReminderTarget(row) &&
    Boolean(row.team_id);

  return (
    <article className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">
            {reviewKind === "salary" ? "工资审核" : "月数据审核"}
          </p>
          <h4 className="mt-1 truncate text-base font-bold text-slate-100">
            {row.teams?.name || "-"}
            {row.teams?.short_name ? `（${row.teams.short_name}）` : ""}
          </h4>
          <p className="mt-1 text-sm text-slate-400">{targetLabel}</p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getMonthlyStatusTone(status)}`}>
            {statusLabel}
          </span>
          {canSendMonthlyReminder ? (
            <ReminderButton
              scope="monthly_single"
              monthlySubmissionId={row.isSynthetic ? undefined : row.id}
              teamId={row.team_id}
              targetMonth={row.target_month}
              label="DC提醒"
              confirmMessage={`确定立即提醒 ${row.teams?.short_name || row.teams?.name || "该战队"} 提交 ${formatMonthLabel(row.target_month)} 月数据吗？`}
              compact
            />
          ) : null}
          {canSendSalaryReminder ? (
            <ReminderButton
              scope="monthly_salary_single"
              monthlySubmissionId={row.isSynthetic ? undefined : row.id}
              teamId={row.team_id}
              targetMonth={row.target_month}
              label="DC提醒"
              confirmMessage={`确定立即提醒 ${row.teams?.short_name || row.teams?.name || "该战队"} 提交 ${formatMonthLabel(row.target_month)} 工资截图吗？`}
              compact
            />
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <CompactMeta
          label="截止时间"
          value={deadlineAt ? formatDateTime(deadlineAt) : "-"}
        />
        <CompactMeta
          label="提交时间"
          value={submittedAt ? formatDateTime(submittedAt) : "-"}
        />
        <CompactMeta
          label={reviewKind === "salary" ? "工资截图" : "数据明细"}
          value={reviewKind === "salary" ? salarySummary.label : monthlyDataSummary}
        />
      </div>

      {returnReason ? <ReasonPreview reason={returnReason} /> : null}

      {row.isSynthetic ? (
        <p className="mt-4 rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-400">
          该战队还没有生成或提交这条记录。
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
          <Link
            href="/admin/reward"
            className="text-sm font-semibold text-sky-200 underline hover:text-white"
          >
            查看详细数据
          </Link>
          <MonthlyReviewActions
            row={row}
            status={status}
            reviewKind={reviewKind}
            selectedMonth={selectedMonth}
          />
        </div>
      )}
    </article>
  );
}

function MonthlyReviewActions({
  row,
  status,
  reviewKind,
  selectedMonth,
}: {
  row: MonthlySubmissionReviewRow;
  status: ReturnType<typeof normalizeMonthlyStatus>;
  reviewKind: ReviewKind;
  selectedMonth: string;
}) {
  const canReview = status === "submitted";
  const canDecide = status === "submitted" || status === "reviewing";
  const label = reviewKind === "salary" ? "工资截图" : "月数据";

  if (!canReview && !canDecide) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canReview ? (
        <form action={updateMonthlyDataReviewStatus}>
          <input type="hidden" name="submission_id" value={row.id} />
          <input type="hidden" name="review_kind" value={reviewKind} />
          <input type="hidden" name="redirect_month" value={selectedMonth} />
          <button
            name="action_type"
            value="reviewing"
            className="rounded-lg bg-orange-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-orange-300"
          >
            开始审核
          </button>
        </form>
      ) : null}

      {canDecide ? (
        <form action={updateMonthlyDataReviewStatus}>
          <input type="hidden" name="submission_id" value={row.id} />
          <input type="hidden" name="review_kind" value={reviewKind} />
          <input type="hidden" name="redirect_month" value={selectedMonth} />
          <button
            name="action_type"
            value="approved"
            className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-300"
          >
            审核通过
          </button>
        </form>
      ) : null}

      {canDecide ? (
        <form action={updateMonthlyDataReviewStatus} className="flex min-w-[260px] flex-1 gap-2">
          <input type="hidden" name="submission_id" value={row.id} />
          <input type="hidden" name="review_kind" value={reviewKind} />
          <input type="hidden" name="redirect_month" value={selectedMonth} />
          <input
            name="return_reason"
            placeholder={`${label}驳回理由`}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-white"
          />
          <button
            name="action_type"
            value="returned"
            className="rounded-lg bg-rose-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-rose-300"
          >
            驳回
          </button>
        </form>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs ring-1 ${getStatusTone(status)}`}>
      {getAdminStatusLabel(status)}
    </span>
  );
}

function ReviewRow({ row }: { row: ReviewRowData }) {
  const project = row.projects;
  const team = row.teams;

  return (
    <article className="rounded-lg border border-slate-700 bg-slate-950/50 px-4 py-3">
      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_140px_180px_130px] lg:items-start">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">战队</p>
          <p className="mt-1 truncate text-sm font-semibold">
            {team?.name || "-"}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">
            {team?.short_name || "-"}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-xs text-slate-500">项目</p>
          <p className="mt-1 truncate text-sm font-semibold">
            {project?.title || "-"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
            {project?.description || "-"}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-500">状态</p>
          <div className="mt-1">
            <StatusPill status={row.status} />
          </div>
        </div>

        <div className="space-y-2">
          <CompactMeta
            label="提交时间"
            value={row.submitted_at ? formatDateTime(row.submitted_at) : "-"}
          />
          <CompactMeta
            label="截止时间"
            value={
              project?.deadline_at ? formatDateTime(project.deadline_at) : "-"
            }
          />
        </div>

        <div className="lg:text-right">
          {project?.id ? (
            <div className="space-y-2">
              <Link
                href={`/admin/projects/${project.id}/teams/${row.id}`}
                className="block text-sm text-slate-300 underline hover:text-white"
              >
                查看提交
              </Link>
              {canSendProjectReminder(row) ? (
                <ReminderButton
                  scope="project_single"
                  projectTeamId={row.id}
                  label="立即提醒"
                  confirmMessage={`确定立即提醒 ${team?.short_name || team?.name || "该战队"} 提交「${project?.title || "提出物"}」吗？`}
                  compact
                />
              ) : null}
            </div>
          ) : (
            <span className="text-sm text-slate-500">-</span>
          )}
        </div>
      </div>

      {row.return_reason ? <ReasonPreview reason={row.return_reason} /> : null}
    </article>
  );
}

function CompactMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 whitespace-nowrap text-sm text-slate-300">{value}</p>
    </div>
  );
}

function ReasonPreview({ reason }: { reason: string }) {
  return (
    <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3">
      <p className="text-xs font-semibold text-rose-200">退回理由</p>
      <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-words pr-2 text-xs leading-5 text-rose-100">
        {reason}
      </p>
    </div>
  );
}

function normalizeReviewMonthParam(value: unknown) {
  const month = String(Array.isArray(value) ? value[0] || "" : value || "").trim();

  return /^\d{4}-\d{2}$/.test(month) ? month : "";
}

function buildReviewMonthOptions({
  projectRows,
  monthlyRows,
  selectedMonth,
}: {
  projectRows: ReviewRowData[];
  monthlyRows: MonthlySubmissionReviewRow[];
  selectedMonth: string;
}) {
  const months = new Set<string>();

  for (const row of monthlyRows) {
    if (isMonthlyReminderEligibleMonth(row.target_month)) {
      months.add(row.target_month.slice(0, 7));
    }
  }

  for (const row of projectRows) {
    const projectMonth = getProjectReviewMonth(row);

    if (projectMonth) {
      months.add(projectMonth);
    }
  }

  if (selectedMonth) {
    months.add(selectedMonth);
  }

  return Array.from(months).sort((left, right) => right.localeCompare(left));
}

function getProjectReviewMonth(row: ReviewRowData) {
  const month = String(row.projects?.deadline_at || "").slice(0, 7);

  return /^\d{4}-\d{2}$/.test(month) ? month : "";
}

function filterProjectRowsByMonth(rows: ReviewRowData[], selectedMonth: string) {
  if (!selectedMonth) {
    return rows;
  }

  return rows.filter((row) => getProjectReviewMonth(row) === selectedMonth);
}

function filterMonthlyRowsByMonth(
  rows: MonthlySubmissionReviewRow[],
  selectedMonth: string
) {
  if (!selectedMonth) {
    return rows;
  }

  return rows.filter((row) => row.target_month.slice(0, 7) === selectedMonth);
}

function groupProjectReviewRows(
  rows: ReviewRowData[]
): ReviewGroups<ReviewRowData> {
  const isReviewing = (row: ReviewRowData) =>
    ["pending", "pending_review"].includes(String(row.status || ""));
  const isSubmitted = (row: ReviewRowData) => {
    const status = String(row.status || "");

    return (
      status === "submitted" ||
      status === "resubmitted" ||
      Boolean(
        row.submitted_at &&
          !["draft", "not_submitted", "returned", "approved", "exported", "pending", "pending_review"].includes(status)
      )
    );
  };

  return {
    notSubmitted: rows.filter(
      (row) =>
        ["not_submitted", "draft"].includes(String(row.status || "")) &&
        !row.submitted_at
    ),
    draft: [],
    submitted: rows.filter(isSubmitted),
    reviewing: rows.filter(isReviewing),
    returned: rows.filter((row) => isReturnedStatus(String(row.status || ""))),
    approved: rows.filter((row) => isApprovedLike(String(row.status || ""))),
  };
}

function groupMonthlyReviewRows(
  rows: MonthlySubmissionReviewRow[],
  reviewKind: ReviewKind
): ReviewGroups<MonthlySubmissionReviewRow> {
  const eligibleRows = rows.filter((row) =>
    isMonthlyReminderEligibleMonth(row.target_month)
  );

  return {
    notSubmitted: eligibleRows.filter(
      (row) =>
        ["not_submitted", "draft"].includes(
          getMonthlyReviewStatus(row, reviewKind)
        )
    ),
    draft: [],
    submitted: eligibleRows.filter(
      (row) => getMonthlyReviewStatus(row, reviewKind) === "submitted"
    ),
    reviewing: eligibleRows.filter(
      (row) => getMonthlyReviewStatus(row, reviewKind) === "reviewing"
    ),
    returned: eligibleRows.filter(
      (row) => getMonthlyReviewStatus(row, reviewKind) === "returned"
    ),
    approved: eligibleRows.filter(
      (row) => getMonthlyReviewStatus(row, reviewKind) === "approved"
    ),
  };
}

function getMonthlyReviewStatus(
  row: MonthlySubmissionReviewRow,
  reviewKind: ReviewKind
) {
  return normalizeMonthlyStatus(
    reviewKind === "salary" ? row.salary_status : row.status
  );
}

function getSalarySummaryForRow(row: MonthlySubmissionReviewRow) {
  const { playerRows } = splitMonthlyRows(parseMonthlyPlayerRows(row.player_rows));

  return getSalaryScreenshotSummary(playerRows);
}

function isSalaryReviewReminderTarget(row: MonthlySubmissionReviewRow) {
  const status = normalizeMonthlyStatus(row.salary_status);

  return (
    status === "not_submitted" ||
    status === "draft" ||
    status === "returned" ||
    !getSalarySummaryForRow(row).isComplete
  );
}

function buildMonthlySubmissionReviewRows({
  submissions,
  settings,
  teams,
}: {
  submissions: MonthlySubmissionReviewRow[];
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
  const syntheticRows = settings.filter(
    (setting) =>
      isMonthlyDataReminderWindowOpen(setting) ||
      isSalaryScreenshotReminderWindowOpen(setting)
  ).flatMap((setting) =>
    activeTeams
      .filter((team) => !submissionByTeamMonth.has(`${team.id}:${setting.target_month}`))
      .map((team) => ({
        id: `monthly-missing-${setting.target_month}-${team.id}`,
        team_id: team.id,
        target_month: setting.target_month,
        status: "not_submitted",
        salary_status: "not_submitted",
        player_rows: [],
        return_reason: null,
        salary_return_reason: null,
        submitted_at: null,
        salary_submitted_at: null,
        reviewing_at: null,
        returned_at: null,
        approved_at: null,
        salary_reviewing_at: null,
        salary_returned_at: null,
        salary_approved_at: null,
        updated_at: setting.deadline_at || setting.salary_screenshot_deadline_at || null,
        teams: team,
        deadline_at: setting.deadline_at,
        salary_screenshot_deadline_at:
          setting.salary_screenshot_deadline_at || null,
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

function isMonthlyReviewReminderTarget(status: string | null | undefined) {
  const normalized = normalizeMonthlyStatus(status);

  return (
    normalized === "not_submitted" ||
    normalized === "draft" ||
    normalized === "returned"
  );
}
