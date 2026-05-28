import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TeamEditDialog } from "./TeamEditDialog";

async function updateTeam(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

  redirect("/admin/teams");
}

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
    .select(
      "id, name, short_name, contact_name, contact_email, discord_webhook_url, discord_mention_text, is_active"
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

          <div className="mt-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">战队管理</h1>
              <p className="mt-2 text-slate-400">
                管理战队账号、联系人、Webhook 和常用资料。
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
                  <th className="px-4 py-3">操作</th>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
