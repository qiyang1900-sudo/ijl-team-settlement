import { createClient } from "@supabase/supabase-js";

export default async function TeamDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string }>;
}) {
  const { teamId } = await searchParams;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let team: any = null;

  if (teamId && supabaseUrl && supabaseAnonKey) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data } = await supabase
      .from("teams")
      .select("id, name, short_name")
      .eq("id", teamId)
      .maybeSingle();

    team = data;
  }

  if (!teamId) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <h1 className="text-3xl font-bold">战队后台</h1>
          <p className="mt-4 text-red-400">
            没有选择战队，请先从战队登录页进入。
          </p>
          <a
            href="/team/login"
            className="mt-6 inline-block rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950"
          >
            返回战队登录
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <a href="/team/login" className="text-sm text-slate-400 hover:text-white">
          ← 战队登录へ戻る
        </a>

        <h1 className="mt-4 text-3xl font-bold">战队后台</h1>

        <p className="mt-3 text-slate-400">
          当前战队：{team?.name || "读取中"}
          {team?.short_name ? `（${team.short_name}）` : ""}
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <a
            href={`/team/projects?teamId=${teamId}`}
            className="rounded-2xl border border-slate-700 bg-slate-900 p-6 hover:bg-slate-800"
          >
            <h2 className="text-xl font-semibold">我的提交项目</h2>
            <p className="mt-2 text-sm text-slate-400">
              查看需要提交的项目、填写资料、保存草稿、提交审核。
            </p>
          </a>

          <a
            href={`/team/reward?teamId=${teamId}`}
            className="rounded-2xl border border-slate-700 bg-slate-900 p-6 hover:bg-slate-800"
          >
            <h2 className="text-xl font-semibold">我的奖励金</h2>
            <p className="mt-2 text-sm text-slate-400">
              暂未开放，后续显示战队奖励金相关内容。
            </p>
          </a>
        </div>
      </div>
    </main>
  );
}
