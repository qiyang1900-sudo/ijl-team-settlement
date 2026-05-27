import { createClient } from "@supabase/supabase-js";
import { formatDateTime } from "@/lib/date-format";
import { getAdminStatusLabel, getStatusTone } from "@/lib/status-labels";

export default async function TeamProgressDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">战队进度详情</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, name, short_name, contact_name, contact_email")
    .eq("id", teamId)
    .single();

  const { data: projectTeams, error: projectTeamsError } = await supabase
    .from("project_teams")
    .select(
      `
      id,
      status,
      submitted_at,
      returned_at,
      approved_at,
      exported_at,
      return_reason,
      projects (
        id,
        title,
        description,
        template_type,
        deadline_at,
        edit_deadline_at,
        status
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
            href="/admin/team-progress"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 返回战队进度
          </a>

          {teamError || !team ? (
            <div className="mt-6 rounded-xl border border-red-500 bg-red-950 p-5">
              <p className="font-bold text-red-300">战队读取失败</p>
              <p className="mt-2 text-sm text-red-200">
                {teamError?.message || "战队不存在"}
              </p>
            </div>
          ) : (
            <>
              <h1 className="mt-4 text-3xl font-bold">{team.name}</h1>
              <p className="mt-2 text-slate-400">
                {team.short_name || "-"} / {team.contact_name || "负责人未设置"} /{" "}
                {team.contact_email || "邮箱未设置"}
              </p>
            </>
          )}
        </div>

        {projectTeamsError ? (
          <div className="rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">项目进度读取失败</p>
            <p className="mt-2 text-sm text-red-200">
              {projectTeamsError.message}
            </p>
          </div>
        ) : !projectTeams || projectTeams.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
            <p className="text-slate-300">这个战队暂无关联项目。</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-700">
            <table className="w-full border-collapse bg-slate-900 text-left text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="px-4 py-3">项目名</th>
                  <th className="px-4 py-3">截止时间</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">提交时间</th>
                  <th className="px-4 py-3">退回理由</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>

              <tbody>
                {projectTeams.map((row: any) => {
                  const project = row.projects;

                  return (
                    <tr key={row.id} className="border-t border-slate-700">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {project?.title || "-"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {project?.description || "-"}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-slate-300">
                        {project?.deadline_at
                          ? formatDateTime(project.deadline_at)
                          : "-"}
                      </td>

                      <td className="px-4 py-3">
                        <StatusPill status={row.status} />
                      </td>

                      <td className="px-4 py-3 text-slate-300">
                        {row.submitted_at
                          ? formatDateTime(row.submitted_at)
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
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs ring-1 ${getStatusTone(status)}`}>
      {getAdminStatusLabel(status)}
    </span>
  );
}
