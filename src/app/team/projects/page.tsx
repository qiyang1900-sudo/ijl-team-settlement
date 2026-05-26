import { createClient } from "@supabase/supabase-js";

export default async function TeamProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string }>;
}) {
  const { teamId } = await searchParams;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">我的提交项目</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  if (!teamId) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-bold">我的提交项目</h1>
          <p className="mt-4 text-red-400">
            没有选择战队，请先从战队登录页进入。
          </p>
          <a
            href="/team/login"
            className="mt-6 inline-block rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950"
          >
            返回战队登录
          </a>
        </div>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, short_name")
    .eq("id", teamId)
    .maybeSingle();

  const { data: projectTeams, error } = await supabase
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
        template_type,
        deadline_at,
        edit_deadline_at
      ),
      teams (
        id,
        name,
        short_name
      )
    `
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <a
            href={`/team/dashboard?teamId=${teamId}`}
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 战队后台へ戻る
          </a>

          <h1 className="mt-4 text-3xl font-bold">我的提交项目</h1>
          <p className="mt-2 text-slate-400">
            当前战队：{team?.name || "-"}
            {team?.short_name ? `（${team.short_name}）` : ""}
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">读取失败</p>
            <p className="mt-2 text-sm text-red-200">{error.message}</p>
          </div>
        ) : !projectTeams || projectTeams.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
            <p className="text-slate-300">暂无需要提交的项目。</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-700">
            <table className="w-full border-collapse bg-slate-900 text-left text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="px-4 py-3">项目名</th>
                  <th className="px-4 py-3">截止时间</th>
                  <th className="px-4 py-3">审核状态</th>
                  <th className="px-4 py-3">退回理由</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>

              <tbody>
                {projectTeams.map((row: any) => (
                  <tr key={row.id} className="border-t border-slate-700">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {row.projects?.title || "-"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {row.projects?.description || "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-300">
                      {row.projects?.deadline_at
                        ? new Date(row.projects.deadline_at).toLocaleString(
                            "ja-JP"
                          )
                        : "-"}
                    </td>

                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>

                    <td className="max-w-xs px-4 py-3 text-slate-300">
                      <div className="line-clamp-2">
                        {row.return_reason || "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <a
                        href={`/team/projects/${row.id}?teamId=${teamId}`}
                        className="text-slate-300 underline hover:text-white"
                      >
                        填写 / 查看
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
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
