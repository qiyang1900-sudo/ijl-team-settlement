import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { formatDateTime } from "@/lib/date-format";
import {
  getAdminStatusLabel,
  getStatusTone,
  isApprovedLike,
} from "@/lib/status-labels";

export const dynamic = "force-dynamic";

function isResubmittedStatus(status: string) {
  return status === "resubmitted";
}

function isReturnedStatus(status: string) {
  return status === "returned";
}

function isSubmittedReviewRow(row: any) {
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

  const allRows = rows || [];

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
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
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
            <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
    <div className={`rounded-xl border p-4 ${colorClass}`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="mt-2 text-3xl font-bold">{count}</p>
    </div>
  );
}

function ReviewSection({
  title,
  rows,
  color,
}: {
  title: string;
  rows: any[];
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
    <section>
      <div className={`mb-4 rounded-xl border px-5 py-4 ${colorClass}`}>
        <h2 className="text-xl font-bold">
          {title} <span className="text-sm font-normal">({rows.length})</span>
        </h2>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-400">
          暂无数据。
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700">
          <table className="w-full border-collapse bg-slate-900 text-left text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="px-4 py-3">战队</th>
                <th className="px-4 py-3">项目</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">提交时间</th>
                <th className="px-4 py-3">截止时间</th>
                <th className="px-4 py-3">退回理由</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row: any) => {
                const project = row.projects;
                const team = row.teams;

                return (
                  <tr key={row.id} className="border-t border-slate-700">
                    <td className="px-4 py-3">
                      <div className="font-medium">{team?.name || "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {team?.short_name || "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium">{project?.title || "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {project?.description || "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>

                    <td className="px-4 py-3 text-slate-300">
                      {row.submitted_at
                        ? formatDateTime(row.submitted_at)
                        : "-"}
                    </td>

                    <td className="px-4 py-3 text-slate-300">
                      {project?.deadline_at
                        ? formatDateTime(project.deadline_at)
                        : "-"}
                    </td>

                    <td className="max-w-xs px-4 py-3 text-slate-300">
                      <div className="line-clamp-2">
                        {row.return_reason || "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {project?.id ? (
                        <Link
                          href={`/admin/projects/${project.id}/teams/${row.id}`}
                          className="text-slate-300 underline hover:text-white"
                        >
                          查看提交
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs ring-1 ${getStatusTone(status)}`}>
      {getAdminStatusLabel(status)}
    </span>
  );
}
