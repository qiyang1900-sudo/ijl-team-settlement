import { createClient } from "@supabase/supabase-js";

export default async function TeamLoginPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let teams: any[] = [];

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await supabase
      .from("teams")
      .select("id, name, short_name")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    teams = data || [];
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-md px-6 py-16">
        <a href="/" className="text-sm text-slate-400 hover:text-white">
          ← 首页へ戻る
        </a>

        <h1 className="mt-6 text-3xl font-bold">战队登录</h1>
        <p className="mt-3 text-slate-400">
          选择战队并输入密码，进入自己的提交页面。
        </p>

        <form className="mt-8 space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <div>
            <label className="block text-sm text-slate-300">战队</label>
            <select className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white">
              {teams.length === 0 ? (
                <option>暂无战队</option>
              ) : (
                teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                    {team.short_name ? `（${team.short_name}）` : ""}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-300">密码</label>
            <input
              type="password"
              placeholder="password"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </div>

          <a
            href="/team/dashboard"
            className="block rounded-xl bg-white px-5 py-3 text-center text-sm font-semibold text-slate-950 hover:bg-slate-200"
          >
            登录
          </a>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          ※现在是框架版，后续会接入真实战队密码，并只显示该战队项目。
        </p>
      </div>
    </main>
  );
}
