import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMonthlyAdminStatusLabel } from "@/lib/monthly-data";
import { isApprovedLike, isWaitingReview } from "@/lib/status-labels";
import { TeamEditDialog } from "./TeamEditDialog";

export const dynamic = "force-dynamic";

type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  discord_webhook_url: string | null;
  discord_mention_text: string | null;
  is_active: boolean | null;
};

type ProjectTeamRow = {
  team_id: string | null;
  status: string | null;
  submitted_at?: string | null;
};

type MonthlySubmissionRow = {
  team_id: string | null;
  target_month: string | null;
  status: string | null;
};

async function updateTeam(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功");
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);

  const teamId = String(formData.get("team_id") || "");
  const name = String(formData.get("name") || "").trim();
  const shortName = String(formData.get("short_name") || "").trim();
  const contactName = String(formData.get("contact_name") || "").trim();
  const contactEmail = String(formData.get("contact_email") || "").trim();
  const discordWebhookUrl = String(
    formData.get("discord_webhook_url") || ""
  ).trim();
  const discordMentionText = String(
    formData.get("discord_mention_text") || ""
  ).trim();

  if (!teamId || !name) {
    throw new Error("战队名不能为空");
  }

  const { error } = await supabase
    .from("teams")
    .update({
      name,
      short_name: shortName || null,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      discord_webhook_url: discordWebhookUrl || null,
      discord_mention_text: discordMentionText || null,
      is_active: formData.get("is_active") === "on",
    })
    .eq("id", teamId);

  if (error) {
    throw new Error(error.message);
  }

  redirect("/admin/teams?saved=1");
}

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
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

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select(
      "id, name, short_name, contact_name, contact_email, discord_webhook_url, discord_mention_text, is_active"
    )
    .order("created_at", { ascending: false });
  const { data: projectTeams, error: projectTeamsError } = await supabase
    .from("project_teams")
    .select("team_id, status, submitted_at");
  const { data: monthlySubmissions, error: monthlySubmissionsError } = await supabase
    .from("monthly_data_submissions")
    .select("team_id, target_month, status")
    .order("target_month", { ascending: false });
  const error = teamsError || projectTeamsError || monthlySubmissionsError;

  const safeTeams = (teams || []) as TeamRow[];
  const safeProjectTeams = (projectTeams || []) as ProjectTeamRow[];
  const safeMonthlySubmissions = (monthlySubmissions || []) as MonthlySubmissionRow[];
  const currentMonth = new Date().toISOString().slice(0, 7);

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

          <div className="mt-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">战队管理</h1>
              <p className="mt-2 text-slate-400">
                管理战队资料，并统一查看项目提交与月数据提交进度。
              </p>
            </div>

            <Link
              href="/admin/teams/new"
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
            >
              新增战队
            </Link>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">读取失败</p>
            <p className="mt-2 text-sm text-red-200">{error.message}</p>
          </div>
        ) : safeTeams.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
            <p className="text-slate-300">暂无战队资料。</p>
            <p className="mt-2 text-sm text-slate-500">
              点击右上角「新增战队」开始创建。
            </p>
          </div>
        ) : (
          <>
            {saved === "1" ? (
              <div className="mb-5 rounded-xl border border-emerald-400/50 bg-emerald-950/40 px-4 py-3 text-sm font-semibold text-emerald-100">
                战队信息已保存。
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-slate-700">
              <table className="w-full min-w-[1040px] border-collapse bg-slate-900 text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">战队名</th>
                    <th className="px-4 py-3">简称</th>
                    <th className="px-4 py-3">负责人</th>
                    <th className="px-4 py-3">项目提交</th>
                    <th className="px-4 py-3">月数据</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {safeTeams.map((team) => {
                    const projectSummary = summarizeProjectProgress(
                      safeProjectTeams.filter((row) => row.team_id === team.id)
                    );
                    const monthlySummary = summarizeMonthlyProgress(
                      safeMonthlySubmissions.filter((row) => row.team_id === team.id),
                      currentMonth
                    );

                    return (
                      <tr key={team.id} className="border-t border-slate-700">
                        <td className="px-4 py-3 font-medium">
                          <Link
                            href={`/admin/teams/${team.id}`}
                            className="hover:text-sky-300 hover:underline"
                          >
                            {team.name}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {team.contact_email || "-"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {team.short_name || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {team.contact_name || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <ProgressChip label="总数" value={projectSummary.total} />
                            <ProgressChip label="待审" value={projectSummary.waiting} tone="amber" />
                            <ProgressChip label="退回" value={projectSummary.returned} tone="rose" />
                            <ProgressChip label="通过" value={projectSummary.approved} tone="emerald" />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-slate-500">本月</p>
                          <p className="mt-1 font-semibold text-slate-200">
                            {monthlySummary.currentStatus}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            已有 {monthlySummary.total} 个月数据 / 通过 {monthlySummary.approved} 月
                          </p>
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
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/admin/teams/${team.id}`}
                              className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                            >
                              查看详情
                            </Link>
                            <TeamEditDialog
                              team={team}
                              updateTeamAction={updateTeam}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function summarizeProjectProgress(rows: ProjectTeamRow[]) {
  return rows.reduce(
    (summary, row) => {
      const status = String(row.status || "");

      if (isApprovedLike(status)) {
        summary.approved += 1;
      } else if (isWaitingReview(status)) {
        summary.waiting += 1;
      } else if (status === "returned") {
        summary.returned += 1;
      } else if (
        row.submitted_at &&
        status !== "draft" &&
        status !== "not_submitted"
      ) {
        summary.waiting += 1;
      }

      summary.total += 1;
      return summary;
    },
    { total: 0, waiting: 0, returned: 0, approved: 0 }
  );
}

function summarizeMonthlyProgress(rows: MonthlySubmissionRow[], currentMonth: string) {
  const current = rows.find((row) => row.target_month === currentMonth);
  const approved = rows.filter((row) => row.status === "approved").length;

  return {
    total: rows.length,
    approved,
    currentStatus: current
      ? getMonthlyAdminStatusLabel(current.status)
      : "未提交",
  };
}

function ProgressChip({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "amber" | "rose" | "emerald";
}) {
  const toneClass = {
    slate: "bg-slate-800 text-slate-300",
    amber: "bg-amber-950 text-amber-200",
    rose: "bg-rose-950 text-rose-200",
    emerald: "bg-emerald-950 text-emerald-200",
  }[tone];

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs ${toneClass}`}>
      {label} {value}
    </span>
  );
}
