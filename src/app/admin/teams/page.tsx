import { createClient } from "@supabase/supabase-js";

export default async function AdminTeamsPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">战队管理</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: teams, error } = await supabase
    .from("teams")
    .select("id, name, short_name, contact_name, contact_email, is_active")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">战队管理</h1>
            <p className="mt-2 text-slate-400">
              管理战队账号、联系人、Webhook 和常用资料。
            </p>
          </div>

          <a
            href="/admin/teams/new"
            className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
          >
            新增战队
          </a>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">读取失败</p>
            <p className="mt-2 text-sm text-red-200">{error.message}</p>
          </div>
        ) : !teams || teams.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
            <p className="text-slate-300">暂无战队资料。</p>
            <p className="mt-2 text-sm text-slate-500">
              点击右上角「新增战队」开始创建。
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-700">
            <table className="w-full border-collapse bg-slate-900 text-left text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="px-4 py-3">战队名</th>
                  <th className="px-4 py-3">简称</th>
                  <th className="px-4 py-3">负责人</th>
                  <th className="px-4 py-3">邮箱</th>
                  <th className="px-4 py-3">状态</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.id} className="border-t border-slate-700">
                    <td className="px-4 py-3 font-medium">{team.name}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {team.short_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {team.contact_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {team.contact_email || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {team.is_active ? (
                        <span className="rounded-full bg-green-950 px-3 py-1 text-green-300">
                          启用
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-700 px-3 py-1 text-slate-300">
                          停用
                        </span>
                      )}
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