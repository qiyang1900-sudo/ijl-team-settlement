import { createClient } from "@supabase/supabase-js";
import { requireTeamAccess } from "@/lib/team-auth";

type TeamRecord = {
  id: string;
  name: string | null;
  short_name: string | null;
};

export default async function TeamDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string }>;
}) {
  const { teamId } = await searchParams;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let team: TeamRecord | null = null;

  if (teamId && supabaseUrl && supabaseAnonKey) {
    await requireTeamAccess(teamId);

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data } = await supabase
      .from("teams")
      .select("id, name, short_name")
      .eq("id", teamId)
      .maybeSingle();

    team = data as TeamRecord | null;
  }

  if (!teamId) {
    return (
      <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <h1 className="text-3xl font-bold">戦隊ダッシュボード</h1>
          <p className="mt-4 text-rose-600">
            戦隊が選択されていません。ログインページから入り直してください。
          </p>
          <a
            href="/team/login"
            className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"
          >
            戦隊ログインへ戻る
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <a href="/team/login" className="text-sm font-medium text-slate-500 hover:text-slate-900">
          ← 戦隊ログインへ戻る
        </a>

        <h1 className="mt-4 text-3xl font-bold">戦隊ダッシュボード</h1>

        <p className="mt-3 text-slate-600">
          現在の戦隊：{team?.name || "読み込み中"}
          {team?.short_name ? `（${team.short_name}）` : ""}
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <a
            href={`/team/projects?teamId=${teamId}`}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">請求書と結案報告書提出</h2>
            <p className="mt-2 text-sm text-slate-600">
              提出対象の確認、資料入力、下書き保存、審査提出ができます。
            </p>
          </a>

          <a
            href={`/team/reward?teamId=${teamId}`}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">月データ提出</h2>
            <p className="mt-2 text-sm text-slate-600">
              選手給与、X、YouTube、クラブ活動の月次データを提出できます。
            </p>
          </a>
        </div>
      </div>
    </main>
  );
}
