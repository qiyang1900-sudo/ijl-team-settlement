import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { formatDateTime } from "@/lib/date-format";
import {
  getAdminStatusLabel,
  getStatusTone,
  isApprovedLike,
} from "@/lib/status-labels";

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
    name: string | null;
    short_name: string | null;
  } | null;
};

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

export default async function AdminReviewsPage() {
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

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: rows, error } = await supabase
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
    .order("created_at", { ascending: false });

  const allRows = (rows || []) as unknown as ReviewRowData[];

  const submitted = allRows.filter((row) => isSubmittedReviewRow(row));
  const resubmitted = allRows.filter((row) =>
    isResubmittedStatus(row.status)
  );
  const returned = allRows.filter((row) => isReturnedStatus(row.status));
  const approved = allRows.filter((row) => isApprovedLike(row.status));
  const notSubmitted = allRows.filter((row) =>
    ["not_submitted", "draft"].includes(row.status) && !row.submitted_at
  );

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link
            href="/admin/dashboard"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 返回管理员后台
          </Link>

          <h1 className="mt-4 text-3xl font-bold">提交审核</h1>
          <p className="mt-2 text-slate-400">
            按审核状态查看所有战队提交资料。
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">读取失败</p>
            <p className="mt-2 text-sm text-red-200">{error.message}</p>
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard label="待审核" count={submitted.length} color="yellow" />
              <StatCard label="待再次提交" count={returned.length} color="red" />
              <StatCard label="再次提交待审核" count={resubmitted.length} color="orange" />
              <StatCard label="审核通过" count={approved.length} color="green" />
              <StatCard label="未提交" count={notSubmitted.length} color="slate" />
            </div>

            <div className="space-y-8">
              <ReviewSection title="待审核" rows={submitted} color="yellow" />
              <ReviewSection title="再次提交待审核" rows={resubmitted} color="orange" />
              <ReviewSection title="待再次提交" rows={returned} color="red" />
              <ReviewSection title="审核通过" rows={approved} color="green" />
              <ReviewSection title="未提交" rows={notSubmitted} color="slate" />
            </div>
          </>
        )}
      </div>
    </main>
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
        <div className="space-y-2 p-3">
          {rows.map((row) => (
            <ReviewRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </details>
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
      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_140px_180px_90px] lg:items-start">
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
            <Link
              href={`/admin/projects/${project.id}/teams/${row.id}`}
              className="text-sm text-slate-300 underline hover:text-white"
            >
              查看提交
            </Link>
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
