import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

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
  const deadlineAt = String(formData.get("deadline_at") || "");
  const editDeadlineAt = String(formData.get("edit_deadline_at") || "");
  const teamIds = formData.getAll("team_ids").map(String);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      title,
      description,
      template_type: templateType,
      deadline_at: deadlineAt || null,
      edit_deadline_at: editDeadlineAt || null,
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
          <a href="/admin/projects" className="text-sm text-slate-400 hover:text-white">
            ← 返回项目管理
          </a>
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

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  提交截止时间
                </label>
                <input
                  name="deadline_at"
                  type="datetime-local"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">
                  修改截止时间
                </label>
                <input
                  name="edit_deadline_at"
                  type="datetime-local"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
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
              <a
                href="/admin/projects"
                className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                取消
              </a>
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
