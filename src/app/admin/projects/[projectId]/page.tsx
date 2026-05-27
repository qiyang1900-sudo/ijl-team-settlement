import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { formatDateTime } from "@/lib/date-format";
import {
  getProjectStatusLabel,
  getTemplateTypeLabel,
} from "@/lib/project-labels";
import { getAdminStatusLabel, getStatusTone } from "@/lib/status-labels";

type ProjectTeamRow = {
  id: string;
  status: string;
  submitted_at: string | null;
  teams: {
    name: string | null;
    short_name: string | null;
  } | null;
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">项目详情</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, title, description, template_type, deadline_at, edit_deadline_at, status"
    )
    .eq("id", projectId)
    .single();

  const { data: projectTeams, error: teamsError } = await supabase
    .from("project_teams")
    .select(
      `
      id,
      status,
      submitted_at,
      returned_at,
      approved_at,
      exported_at,
      teams (
        id,
        name,
        short_name
      )
    `
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link
            href="/admin/projects"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 返回项目管理
          </Link>

          {projectError || !project ? (
            <div className="mt-6 rounded-xl border border-red-500 bg-red-950 p-5">
              <p className="font-bold text-red-300">项目读取失败</p>
              <p className="mt-2 text-sm text-red-200">
                {projectError?.message || "项目不存在"}
              </p>
            </div>
          ) : (
            <>
              <h1 className="mt-4 text-3xl font-bold">{project.title}</h1>
              <p className="mt-2 text-slate-400">
                {project.description || "-"}
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                  <p className="text-sm text-slate-500">模板类型</p>
                  <p className="mt-2 font-semibold">
                    {getTemplateTypeLabel(project.template_type)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                  <p className="text-sm text-slate-500">截止时间</p>
                  <p className="mt-2 font-semibold">
                    {project.deadline_at || project.edit_deadline_at
                      ? formatDateTime(
                          project.deadline_at || project.edit_deadline_at
                        )
                      : "-"}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                  <p className="text-sm text-slate-500">状态</p>
                  <p className="mt-2 font-semibold">
                    {getProjectStatusLabel(project.status)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-10">
          <h2 className="text-2xl font-bold">参与战队</h2>

          {teamsError ? (
            <div className="mt-4 rounded-xl border border-red-500 bg-red-950 p-5">
              <p className="font-bold text-red-300">战队读取失败</p>
              <p className="mt-2 text-sm text-red-200">
                {teamsError.message}
              </p>
            </div>
          ) : !projectTeams || projectTeams.length === 0 ? (
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
              <p className="text-slate-300">这个项目还没有参与战队。</p>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-700">
              <table className="w-full border-collapse bg-slate-900 text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">战队名</th>
                    <th className="px-4 py-3">简称</th>
                    <th className="px-4 py-3">提交状态</th>
                    <th className="px-4 py-3">提交时间</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>

                <tbody>
                  {((projectTeams || []) as unknown as ProjectTeamRow[]).map((row) => (
                    <tr key={row.id} className="border-t border-slate-700">
                      <td className="px-4 py-3 font-medium">
                        {row.teams?.name || "-"}
                      </td>

                      <td className="px-4 py-3 text-slate-300">
                        {row.teams?.short_name || "-"}
                      </td>

                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs ring-1 ${getStatusTone(row.status)}`}>
                          {getAdminStatusLabel(row.status)}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-300">
                        {row.submitted_at
                          ? formatDateTime(row.submitted_at)
                          : "-"}
                      </td>

                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/projects/${projectId}/teams/${row.id}`}
                          className="text-slate-300 underline hover:text-white"
                        >
                          查看提交
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
