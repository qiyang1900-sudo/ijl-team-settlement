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
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <div className="mx-auto max-w-md px-6 py-16">
        <a href="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">
          ← ホームへ戻る
        </a>

        <h1 className="mt-6 text-3xl font-bold">戦隊ログイン</h1>
        <p className="mt-3 text-slate-600">
          戦隊を選択し、パスワードを入力して提出ページへ進みます。
        </p>

        <form
          action="/team/dashboard"
          method="GET"
          className="mt-8 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700">戦隊</label>
            <select
              name="teamId"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-emerald-500"
            >
              {teams.length === 0 ? (
                <option value="">登録済みの戦隊がありません</option>
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
            <label className="block text-sm font-medium text-slate-700">
              パスワード
            </label>
            <input
              name="password"
              type="password"
              placeholder="password"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            className="block w-full rounded-lg bg-emerald-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-500"
          >
            ログイン
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          ※現在は仮ログインです。正式な戦隊パスワード認証は後続で接続します。
        </p>
      </div>
    </main>
  );
}
