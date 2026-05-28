import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { formatDateTime } from "@/lib/date-format";
import { getStatusTone, getTeamStatusLabel } from "@/lib/status-labels";
import { requireTeamAccess } from "@/lib/team-auth";

export const dynamic = "force-dynamic";

type TeamProjectRow = {
  id: string;
  status: string;
  return_reason: string | null;
  projects: {
    id: string | null;
    title: string | null;
    description: string | null;
    deadline_at: string | null;
  } | null;
};

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
        <h1 className="text-3xl font-bold">請求書と結案報告書提出</h1>
        <p className="mt-4 text-rose-600">Supabase環境変数が設定されていません。</p>
      </main>
    );
  }

  if (!teamId) {
    return (
      <main className="min-h-screen bg-[#f6f7fb] p-10 text-slate-950">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-bold">請求書と結案報告書提出</h1>
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

  await requireTeamAccess(teamId);

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

          <h1 className="mt-4 text-3xl font-bold">請求書と結案報告書提出</h1>
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
            {((projectTeams || []) as unknown as TeamProjectRow[]).map((row) => (
              <article
                key={row.id}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-950">
                      {row.projects?.title || "-"}
                    </h2>
                    <p className="mt-2 line-clamp-5 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">
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

                    <div className="sm:col-span-2">
                      <ReasonBlock reason={row.return_reason || ""} />
                    </div>

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

function ReasonBlock({ reason }: { reason: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-500">差し戻し理由</p>
      {reason ? (
        <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-rose-100 bg-rose-50 p-3 pr-2 text-sm leading-6 text-slate-700">
          {reason}
        </p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-slate-700">-</p>
      )}
    </div>
  );
}
