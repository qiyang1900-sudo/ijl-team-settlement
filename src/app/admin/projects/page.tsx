import { createClient } from "@supabase/supabase-js";

export default async function AdminProjectsPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">项目进度</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, title, description, template_type, deadline_at, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <a
            href="/admin/dashboard"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 管理员后台へ戻る
          </a>

          <div className="mt-4 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">项目进度</h1>
              <p className="mt-2 text-slate-400">
                按项目查看各战队的提交状态、审核状态和导出状态。
              </p>
            </div>

            <a
              href="/admin/projects/new"
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
            >
              新建项目
            </a>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">读取失败</p>
            <p className="mt-2 text-sm text-red-200">{error.message}</p>
          </div>
        ) : !projects || projects.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
            <p className="text-slate-300">暂无项目。</p>
            <p className="mt-2 text-sm text-slate-500">
              点击右上角「新建项目」开始创建。
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-700">
            <table className="w-full border-collapse bg-slate-900 text-left text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="px-4 py-3">项目名</th>
                  <th className="px-4 py-3">模板类型</th>
                  <th className="px-4 py-3">截止时间</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>

              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="border-t border-slate-700">
                    <td className="px-4 py-3">
                      <div className="font-medium">{project.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {project.description || "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-300">
                      {project.template_type}
                    </td>

                    <td className="px-4 py-3 text-slate-300">
                      {project.deadline_at
                        ? new Date(project.deadline_at).toLocaleString("ja-JP")
                        : "-"}
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">
                        {project.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <a
                        href={`/admin/projects/${project.id}`}
                        className="text-slate-300 underline hover:text-white"
                      >
                        查看进度
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
