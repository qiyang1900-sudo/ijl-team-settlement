import { createClient } from "@supabase/supabase-js";

export default async function TeamProjectsPage() {
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

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: projectTeams, error } = await supabase
    .from("project_teams")
    .select(
      `
      id,
      status,
      submitted_at,
      returned_at,
      approved_at,
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
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <a href="/team" className="text-sm text-slate-400 hover:text-white">
            ← 战队入口へ戻る
          </a>

          <h1 className="mt-4 text-3xl font-bold">我的提交项目</h1>
          <p className="mt-2 text-slate-400">
            战队可以在这里查看需要提交的项目、填写资料、确认审核状态。
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
                  <th className="px-4 py-3">战队</th>
                  <th className="px-4 py-3">项目名</th>
                  <th className="px-4 py-3">截止时间</th>
                  <th className="px-4 py-3">审核状态</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>

              <tbody>
                {projectTeams.map((row: any) => (
                  <tr key={row.id} className="border-t border-slate-700">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {row.teams?.name || "-"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {row.teams?.short_name || "-"}
                      </div>
                    </td>

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
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">
                        {row.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <a
                        href={`/team/projects/${row.id}`}
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
