import { createClient } from "@supabase/supabase-js";

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

  const waiting =
    rows?.filter((row) => row.status === "submitted" || row.status === "resubmitted") || [];
  const returned = rows?.filter((row) => row.status === "returned") || [];
  const approved = rows?.filter((row) => row.status === "approved") || [];
  const notSubmitted =
    rows?.filter((row) => row.status === "not_submitted" || row.status === "draft") || [];

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <a
            href="/admin/dashboard"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 管理员后台へ戻る
          </a>

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
          <div className="space-y-8">
            <ReviewSection title="待审核" rows={waiting} color="yellow" />
            <ReviewSection title="退回修改" rows={returned} color="red" />
            <ReviewSection title="审核通过" rows={approved} color="green" />
            <ReviewSection title="未提交 / 草稿" rows={notSubmitted} color="slate" />
          </div>
        )}
      </div>
    </main>
  );
}

function ReviewSection({
  title,
  rows,
  color,
}: {
  title: string;
  rows: any[];
  color: "yellow" | "red" | "green" | "slate";
}) {
  const colorClass = {
    yellow: "border-yellow-500 bg-yellow-950 text-yellow-200",
    red: "border-red-500 bg-red-950 text-red-200",
    green: "border-green-500 bg-green-950 text-green-200",
    slate: "border-slate-700 bg-slate-900 text-slate-200",
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
                        ? new Date(row.submitted_at).toLocaleString("ja-JP")
                        : "-"}
                    </td>

                    <td className="max-w-xs px-4 py-3 text-slate-300">
                      <div className="line-clamp-2">
                        {row.return_reason || "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <a
                        href={`/admin/projects/${project?.id}/teams/${row.id}`}
                        className="text-slate-300 underline hover:text-white"
                      >
                        查看提交
                      </a>
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
  const map: Record<string, { label: string; className: string }> = {
    not_submitted: {
      label: "未提交",
      className: "bg-slate-800 text-slate-300",
    },
    draft: {
      label: "草稿中",
      className: "bg-blue-950 text-blue-300",
    },
    submitted: {
      label: "待审核",
      className: "bg-yellow-950 text-yellow-300",
    },
    resubmitted: {
      label: "重新提交",
      className: "bg-orange-950 text-orange-300",
    },
    returned: {
      label: "退回修改",
      className: "bg-red-950 text-red-300",
    },
    approved: {
      label: "审核通过",
      className: "bg-green-950 text-green-300",
    },
    exported: {
      label: "已导出",
      className: "bg-purple-950 text-purple-300",
    },
  };

  const item = map[status] || {
    label: status,
    className: "bg-slate-800 text-slate-300",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs ${item.className}`}>
      {item.label}
    </span>
  );
}
