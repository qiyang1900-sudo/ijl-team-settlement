import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";

async function createTeam(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const name = String(formData.get("name") || "");
  const shortName = String(formData.get("short_name") || "");
  const contactName = String(formData.get("contact_name") || "");
  const contactEmail = String(formData.get("contact_email") || "");
  const discordWebhookUrl = String(formData.get("discord_webhook_url") || "");
  const discordMentionText = String(formData.get("discord_mention_text") || "");

  const { error } = await supabase.from("teams").insert({
    name,
    short_name: shortName,
    contact_name: contactName,
    contact_email: contactEmail,
    discord_webhook_url: discordWebhookUrl,
    discord_mention_text: discordMentionText,
    is_active: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  redirect("/admin/teams");
}

export default function NewTeamPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link href="/admin/teams" className="text-sm text-slate-400 hover:text-white">
            ← 返回战队管理
          </Link>
          <h1 className="mt-4 text-3xl font-bold">新增战队</h1>
          <p className="mt-2 text-slate-400">
            创建战队基础资料。Webhook 可以之后再补。
          </p>
        </div>

        <form action={createTeam} className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <div>
            <label className="block text-sm font-medium text-slate-300">
              战队名
            </label>
            <input
              name="name"
              required
              placeholder="例：FENNEL"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              简称
            </label>
            <input
              name="short_name"
              placeholder="例：FL"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              负责人姓名
            </label>
            <input
              name="contact_name"
              placeholder="例：山田太郎"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              负责人邮箱
            </label>
            <input
              name="contact_email"
              type="email"
              placeholder="example@example.com"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              Discord Webhook URL
            </label>
            <input
              name="discord_webhook_url"
              placeholder="https://discord.com/api/webhooks/..."
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              负责人 Discord 用户ID / mention
            </label>
            <input
              name="discord_mention_text"
              placeholder="复制用户 ID，或填写 <@用户ID> / <@&角色ID>"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
            <p className="mt-2 text-xs text-slate-500">
              只填数字也可以，系统会自动转成 Discord mention 来通知负责人。
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href="/admin/teams"
              className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              取消
            </Link>
            <button
              type="submit"
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
