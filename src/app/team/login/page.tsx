import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { setTeamSession, verifyTeamPassword } from "@/lib/team-auth";

type TeamOption = {
  id: string;
  name: string;
  short_name: string | null;
};

async function loginTeam(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const teamId = String(formData.get("teamId") || "");
  const password = String(formData.get("password") || "");

  if (!supabaseUrl || !supabaseAnonKey || !teamId || !password) {
    redirect("/team/login?error=missing");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: team } = await supabase
    .from("teams")
    .select("id, short_name, is_active")
    .eq("id", teamId)
    .maybeSingle();

  if (
    !team ||
    team.is_active === false ||
    !verifyTeamPassword(team.short_name, password)
  ) {
    redirect(
      `/team/login?teamId=${encodeURIComponent(teamId)}&error=invalid`
    );
  }

  await setTeamSession({
    teamId: team.id,
    teamShortName: team.short_name || "",
  });

  redirect(`/team/dashboard?teamId=${encodeURIComponent(team.id)}`);
}

export default async function TeamLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string; error?: string }>;
}) {
  const { teamId: selectedTeamId, error } = await searchParams;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let teams: TeamOption[] = [];

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data } = await supabase
      .from("teams")
      .select("id, name, short_name")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    teams = (data || []) as TeamOption[];
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <div className="mx-auto max-w-md px-6 py-16">
        <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">
          ← ホームへ戻る
        </Link>

        <h1 className="mt-6 text-3xl font-bold">戦隊ログイン</h1>
        <p className="mt-3 text-slate-600">
          戦隊を選択し、パスワードを入力して提出ページへ進みます。
        </p>

        <form
          action={loginTeam}
          className="mt-8 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700">戦隊</label>
            <select
              name="teamId"
              required
              defaultValue={selectedTeamId || ""}
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
              required
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-emerald-500"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {getLoginErrorMessage(error)}
            </div>
          ) : null}

          <button
            type="submit"
            className="block w-full rounded-lg bg-emerald-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-500"
          >
            ログイン
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          ※パスワードが不明な場合は管理者へご連絡ください。
        </p>
      </div>
    </main>
  );
}

function getLoginErrorMessage(error: string) {
  if (error === "login_required") {
    return "ログイン後にアクセスしてください。";
  }

  if (error === "missing") {
    return "戦隊とパスワードを入力してください。";
  }

  return "戦隊またはパスワードが正しくありません。";
}
