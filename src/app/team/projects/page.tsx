import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { formatDateTime } from "@/lib/date-format";
import { getStatusTone, getTeamStatusLabel } from "@/lib/status-labels";

export const dynamic = "force-dynamic";

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
          <Link
            href="/team/login"
            className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"
          >
            戦隊ログインへ戻る
          </Link>
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
          <Link
            href={`/team/dashboard?teamId=${teamId}`}
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← 戦隊ダッシュボードへ戻る
          </Link>

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
          <div className="space-y-4">
            {projectTeams.map((row: any) => (
              <article
                key={row.id}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)] lg:items-center">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-950">
                      {row.projects?.title || "-"}
                    </h2>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">
                      {row.projects?.description || "-"}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoBlock
                      label="締切"
                      value={formatDateTime(row.projects?.deadline_at)}
                    />

                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        審査ステータス
                      </p>
                      <div className="mt-2">
                        <StatusPill status={row.status} />
                      </div>
                    </div>

                    <InfoBlock
                      label="差し戻し理由"
                      value={row.return_reason || "-"}
                    />

                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        操作
                      </p>
                      <Link
                        href={`/team/projects/${row.id}?teamId=${teamId}`}
                        className="mt-2 inline-flex whitespace-nowrap font-medium text-emerald-700 underline hover:text-emerald-600"
                      >
                        入力 / 確認
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs ring-1 ${getStatusTone(
        status
      )}`}
    >
      {getTeamStatusLabel(status)}
    </span>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm leading-6 text-slate-700">
        {value}
      </p>
    </div>
  );
}
