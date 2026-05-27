import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { isApprovedLike } from "@/lib/status-labels";

export const dynamic = "force-dynamic";

export default async function TeamProgressPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">战队进度</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: teams, error } = await supabase
    .from("teams")
    .select("id, name, short_name, contact_name, contact_email, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const { data: projectTeams } = await supabase
    .from("project_teams")
    .select("id, team_id, status");

  function getTeamCount(teamId: string, status?: string) {
    const rows = projectTeams?.filter((row) => row.team_id === teamId) || [];

    if (!status) {
      return rows.length;
    }

    if (status === "approved") {
      return rows.filter((row) => isApprovedLike(row.status)).length;
    }

    return rows.filter((row) => row.status === status).length;
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <Link
            href="/admin/dashboard"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 返回管理员后台
          </Link>

          <h1 className="mt-4 text-3xl font-bold">战队进度</h1>
          <p className="mt-2 text-slate-400">
            按战队查看各项目的提交进度、审核状态和退回情况。
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">读取失败</p>
            <p className="mt-2 text-sm text-red-200">{error.message}</p>
          </div>
        ) : !teams || teams.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
            <p className="text-slate-300">暂无战队资料。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {teams.map((team) => {
              const total = getTeamCount(team.id);
              const notSubmitted = getTeamCount(team.id, "not_submitted");
              const draft = getTeamCount(team.id, "draft");
              const submitted = getTeamCount(team.id, "submitted");
              const returned = getTeamCount(team.id, "returned");
              const resubmitted = getTeamCount(team.id, "resubmitted");
              const approved = getTeamCount(team.id, "approved");

              return (
                <Link
                  key={team.id}
                  href={`/admin/team-progress/${team.id}`}
                  className="block rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 transition hover:border-slate-500 hover:bg-slate-800"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold">
                          {team.name}
                        </h2>
                        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                          {total} 件
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {team.short_name || "-"}
                      </p>
                    </div>

                    <div className="grid gap-2 text-xs sm:grid-cols-5 lg:w-[620px]">
                      <StatusBadge label="未提交" count={notSubmitted} color="slate" />
                      <StatusBadge label="草稿" count={draft} color="blue" />
                      <StatusBadge label="待审核" count={submitted + resubmitted} color="yellow" />
                      <StatusBadge label="待再次提交" count={returned} color="red" />
                      <StatusBadge label="审核通过" count={approved} color="green" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function StatusBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "slate" | "blue" | "yellow" | "red" | "green";
}) {
  const colorClass = {
    slate: "bg-slate-800 text-slate-300",
    blue: "bg-blue-950 text-blue-300",
    yellow: "bg-yellow-950 text-yellow-300",
    red: "bg-red-950 text-red-300",
    green: "bg-green-950 text-green-300",
  }[color];

  return (
    <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${colorClass}`}>
      <span className="whitespace-nowrap">{label}</span>
      <span className="ml-2 font-semibold">{count}</span>
    </div>
  );
}
