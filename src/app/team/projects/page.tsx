import { createClient } from "@supabase/supabase-js";
import { getStatusTone, getTeamStatusLabel } from "@/lib/status-labels";

export default async function TeamProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string }>;
}) {
  const { teamId } = await searchParams;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-[#f6f7fb] p-10 text-slate-950">
        <h1 className="text-3xl font-bold">提出プロジェクト</h1>
        <p className="mt-4 text-rose-600">Supabase環境変数が設定されていません。</p>
      </main>
    );
  }

  if (!teamId) {
    return (
      <main className="min-h-screen bg-[#f6f7fb] p-10 text-slate-950">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-bold">提出プロジェクト</h1>
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

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, short_name")
    .eq("id", teamId)
    .maybeSingle();

  const { data: projectTeams, error } = await supabase
    .from("project_teams")
    .select(
      `
      id,
      status,
      submitted_at,
      returned_at,
      approved_at,
      return_reason,
      projects (
        id,
        title,
        description,
        template_type,
        deadline_at,
        edit_deadline_at
      ),
      teams (
        id,
        name,
        short_name
      )
    `
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-10 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <a
            href={`/team/dashboard?teamId=${teamId}`}
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← 戦隊ダッシュボードへ戻る
          </a>

          <h1 className="mt-4 text-3xl font-bold">提出プロジェクト</h1>
          <p className="mt-2 text-slate-600">
            現在の戦隊：{team?.name || "-"}
            {team?.short_name ? `（${team.short_name}）` : ""}
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
            <p className="font-bold text-rose-700">読み込みに失敗しました</p>
            <p className="mt-2 text-sm text-rose-600">{error.message}</p>
          </div>
        ) : !projectTeams || projectTeams.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-slate-600">現在、提出が必要なプロジェクトはありません。</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3">プロジェクト名</th>
                  <th className="px-4 py-3">締切</th>
                  <th className="px-4 py-3">審査ステータス</th>
                  <th className="px-4 py-3">差し戻し理由</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>

              <tbody>
                {projectTeams.map((row: any) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {row.projects?.title || "-"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {row.projects?.description || "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {row.projects?.deadline_at
                        ? new Date(row.projects.deadline_at).toLocaleString(
                            "ja-JP"
                          )
                        : "-"}
                    </td>

                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>

                    <td className="max-w-xs px-4 py-3 text-slate-600">
                      <div className="line-clamp-2 text-slate-600">
                        {row.return_reason || "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <a
                        href={`/team/projects/${row.id}?teamId=${teamId}`}
                        className="font-medium text-emerald-700 underline hover:text-emerald-600"
                      >
                        入力 / 確認
                      </a>
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

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs ring-1 ${getStatusTone(status)}`}>
      {getTeamStatusLabel(status)}
    </span>
  );
}
