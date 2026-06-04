import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/lib/date-format";
import {
  getProjectStatusLabel,
  getTemplateTypeLabel,
} from "@/lib/project-labels";
import DeleteProjectButton from "./DeleteProjectButton";

export const dynamic = "force-dynamic";

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

async function deleteProject(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error("Supabase 环境变量没有设置成功");
  }

  const supabase = createSupabaseServerClient(supabaseUrl, undefined, serviceRoleKey);

  const projectId = String(formData.get("project_id") || "");

  if (!projectId) {
    throw new Error("项目 ID 为空，无法删除。");
  }

  const { data: projectTeams, error: projectTeamsError } = await supabase
    .from("project_teams")
    .select("id")
    .eq("project_id", projectId);

  throwIfError(projectTeamsError);

  const projectTeamIds =
    projectTeams?.map((row) => row.id).filter(Boolean) || [];

  if (projectTeamIds.length > 0) {
    const { data: files, error: filesError } = await supabase
      .from("submission_files")
      .select("id, storage_path")
      .in("project_team_id", projectTeamIds);

    throwIfError(filesError);

    const storagePaths =
      files?.map((file) => file.storage_path).filter(Boolean) || [];

    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("screenshots")
        .remove(storagePaths);

      throwIfError(storageError);
    }

    const tablesWithProjectTeamId = [
      "review_logs",
      "submission_files",
      "report_rows",
      "settlement_detail_rows",
      "settlement_summary_rows",
      "submission_company_info",
    ];

    for (const table of tablesWithProjectTeamId) {
      const { error } = await supabase
        .from(table)
        .delete()
        .in("project_team_id", projectTeamIds);

      throwIfError(error);
    }

    const { error: deleteProjectTeamsError } = await supabase
      .from("project_teams")
      .delete()
      .eq("project_id", projectId);

    throwIfError(deleteProjectTeamsError);
  }

  const { error: deleteProjectError } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);

  throwIfError(deleteProjectError);

  redirect("/admin/projects?deleted=1");
}

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
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

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);

  const { data: projects, error } = await supabase
    .from("projects")
    .select(
      "id, title, description, template_type, deadline_at, status, created_at"
    )
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link
            href="/admin/dashboard"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 返回管理员后台
          </Link>

          <div className="mt-4 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">项目进度</h1>
              <p className="mt-2 text-slate-400">
                按项目查看各战队的提交状态、审核状态和导出状态。
              </p>
            </div>

            <Link
              href="/admin/projects/new"
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
            >
              新建项目
            </Link>
          </div>
        </div>

        {deleted === "1" ? (
          <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-950/70 p-4 text-sm text-emerald-100">
            项目已删除，相关提交资料和截图文件也已清理。
          </div>
        ) : null}

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
          <div className="space-y-3">
            {projects.map((project) => (
              <article
                key={project.id}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-4"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_150px_180px_110px_120px] lg:items-center">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">
                      {project.title}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                      {project.description || "-"}
                    </p>
                  </div>

                  <CompactMeta
                    label="模板类型"
                    value={getTemplateTypeLabel(project.template_type)}
                  />

                  <CompactMeta
                    label="截止时间"
                    value={
                      project.deadline_at
                        ? formatDateTime(project.deadline_at)
                        : "-"
                    }
                    noWrap
                  />

                  <div>
                    <p className="text-xs text-slate-500">状态</p>
                    <span className="mt-1 inline-flex rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                      {getProjectStatusLabel(project.status)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="text-sm text-slate-300 underline hover:text-white"
                    >
                      查看进度
                    </Link>
                    <DeleteProjectButton
                      projectId={project.id}
                      projectTitle={project.title}
                      deleteProjectAction={deleteProject}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function CompactMeta({
  label,
  value,
  noWrap = false,
}: {
  label: string;
  value: string;
  noWrap?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-1 text-sm text-slate-300 ${
          noWrap ? "whitespace-nowrap" : "break-words"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
