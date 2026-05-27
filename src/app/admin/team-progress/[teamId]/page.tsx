import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { formatDateTime } from "@/lib/date-format";
import { getAdminStatusLabel, getStatusTone } from "@/lib/status-labels";

export const dynamic = "force-dynamic";

type TeamProgressProject = {
  id: string | null;
  title: string | null;
  description: string | null;
  deadline_at: string | null;
};

type TeamProgressRow = {
  id: string;
  status: string;
  submitted_at: string | null;
  return_reason: string | null;
  projects: TeamProgressProject | null;
};

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
          <Link
            href="/admin/team-progress"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 返回战队进度
          </Link>

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
          <div className="space-y-3">
            {((projectTeams || []) as unknown as TeamProgressRow[]).map((row) => {
              const project = row.projects;

              return (
                <article
                  key={row.id}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-4"
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_140px_180px_110px] lg:items-center">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold">
                        {project?.title || "-"}
                      </h2>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                        {project?.description || "-"}
                      </p>
                    </div>

                    <CompactMeta
                      label="截止时间"
                      value={
                        project?.deadline_at
                          ? formatDateTime(project.deadline_at)
                          : "-"
                      }
                      noWrap
                    />

                    <div>
                      <p className="text-xs text-slate-500">状态</p>
                      <div className="mt-1">
                        <StatusPill status={row.status} />
                      </div>
                    </div>

                    <CompactMeta
                      label="提交时间"
                      value={
                        row.submitted_at
                          ? formatDateTime(row.submitted_at)
                          : "-"
                      }
                      noWrap
                    />

                    <Link
                      href={`/admin/projects/${project?.id}/teams/${row.id}`}
                      className="text-sm text-slate-300 underline hover:text-white lg:text-right"
                    >
                      查看提交
                    </Link>
                  </div>

                  {row.return_reason ? (
                    <ReasonPreview reason={row.return_reason} />
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs ring-1 ${getStatusTone(status)}`}>
      {getAdminStatusLabel(status)}
    </span>
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
