import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";

function normalizeDeadlineDate(value: string) {
  const normalized = value.trim().replace(/[/.]/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    return "";
  }

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeDeadlineTime(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return "23:59";
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return "23:59";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function createProject(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const title = String(formData.get("title") || "");
  const description = String(formData.get("description") || "");
  const templateType = String(formData.get("template_type") || "subsidy_report");
  const deadlineDate = normalizeDeadlineDate(
    String(formData.get("deadline_date") || "")
  );
  const deadlineTime = normalizeDeadlineTime(
    String(formData.get("deadline_time") || "")
  );
  const deadlineAt = deadlineDate
    ? `${deadlineDate}T${deadlineTime}`
    : "";
  const teamIds = formData.getAll("team_ids").map(String);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      title,
      description,
      template_type: templateType,
      deadline_at: deadlineAt || null,
      edit_deadline_at: deadlineAt || null,
      status: "active",
    })
    .select("id")
    .single();

  if (projectError) {
    throw new Error(projectError.message);
  }

  if (teamIds.length > 0) {
    const projectTeams = teamIds.map((teamId) => ({
      project_id: project.id,
      team_id: teamId,
      status: "not_submitted",
    }));

    const { error: projectTeamsError } = await supabase
      .from("project_teams")
      .insert(projectTeams);

    if (projectTeamsError) {
      throw new Error(projectTeamsError.message);
    }
  }

  redirect("/admin/projects");
}

export default async function NewProjectPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">新建项目</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: teams, error } = await supabase
    .from("teams")
    .select("id, name, short_name")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <Link href="/admin/projects" className="text-sm text-slate-400 hover:text-white">
            ← 返回项目管理
          </Link>
          <h1 className="mt-4 text-3xl font-bold">新建项目</h1>
          <p className="mt-2 text-slate-400">
            创建结算/结案报告项目，并选择需要参与的战队。
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">读取战队失败</p>
            <p className="mt-2 text-sm text-red-200">{error.message}</p>
          </div>
        ) : (
          <form
            action={createProject}
            className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-6"
          >
            <div>
              <label className="block text-sm font-medium text-slate-300">
                项目名称
              </label>
              <input
                name="title"
                required
                placeholder="例：2025年秋季联赛补助金"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300">
                项目说明
              </label>
              <textarea
                name="description"
                rows={4}
                placeholder="例：9-12月联赛补助金结案报告"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300">
                模板类型
              </label>
              <select
                name="template_type"
                defaultValue="subsidy_report"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
              >
                <option value="subsidy_report">补助金结案报告</option>
                <option value="transportation_report">交通费精算</option>
                <option value="invoice_report">请款/发票相关</option>
                <option value="prize_report">奖金相关</option>
                <option value="other">其他</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300">
                截止时间
              </label>
              <p className="mt-1 text-xs text-slate-500">
                提交和修改共用同一个截止时间。日期可输入 2026-05-31 或 2026/05/31。
              </p>

              <div className="mt-2 grid gap-3 md:grid-cols-[1fr_180px]">
                <input
                  name="deadline_date"
                  type="text"
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD"
                  pattern="\d{4}[-/.]\d{1,2}[-/.]\d{1,2}"
                  title="请输入日期，例如 2026-05-31 或 2026/05/31"
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
                />

                <input
                  name="deadline_time"
                  type="text"
                  inputMode="numeric"
                  defaultValue="23:59"
                  placeholder="23:59"
                  pattern="\d{1,2}:\d{2}"
                  title="请输入时间，例如 23:59"
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300">
                参与战队
              </label>

              {!teams || teams.length === 0 ? (
                <div className="mt-2 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
                  暂无战队资料。请先到战队管理创建战队。
                </div>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {teams.map((team) => (
                    <label
                      key={team.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 hover:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        name="team_ids"
                        value={team.id}
                        className="h-4 w-4"
                      />
                      <span>
                        {team.name}
                        {team.short_name ? (
                          <span className="ml-2 text-sm text-slate-500">
                            {team.short_name}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Link
                href="/admin/projects"
                className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                取消
              </Link>
              <button
                type="submit"
                className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
              >
                保存项目
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
