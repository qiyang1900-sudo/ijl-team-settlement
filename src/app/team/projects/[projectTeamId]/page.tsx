import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getInvoiceUploadUrl } from "@/lib/invoice-upload-links";
import { getStatusTone, getTeamStatusLabel } from "@/lib/status-labels";
import { loadProjectSubmissionState, projectSubmissionRevision, saveProjectSubmission, type ProjectSaveResult } from "@/lib/project-submission-save";
import { requireTeamAccess } from "@/lib/team-auth";
import { REPORT_SCREENSHOT_FILE_CATEGORY } from "@/lib/report-screenshots";
import SubmissionForm from "./SubmissionForm";

type TeamRecord = {
  id?: string | null;
  name?: string | null;
  short_name?: string | null;
};
type ProjectRecord = {
  id?: string | null;
  title?: string | null;
  description?: string | null;
  template_type?: string | null;
  deadline_at?: string | null;
  edit_deadline_at?: string | null;
};

async function saveSubmission(formData: FormData): Promise<ProjectSaveResult> {
  "use server";
  const teamId = String(formData.get("team_id") || "");
  const projectTeamId = String(formData.get("project_team_id") || "");
  try {
    if (!teamId || !projectTeamId) throw new Error("提出対象が確認できません。");
    await requireTeamAccess(teamId);
    const supabase = createSupabaseServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    return await saveProjectSubmission({ supabase, storageClient: supabase, formData, teamId, projectTeamId });
  } catch (error) {
    return { status: "error", message: `保存できませんでした：${error instanceof Error ? error.message : "接続を確認してください。"} 入力内容はこの画面に保持されています。` };
  }
}

export default async function TeamSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectTeamId: string }>;
  searchParams: Promise<{ result?: string; teamId?: string }>;
}) {
  const { projectTeamId } = await params;
  const { result, teamId } = await searchParams;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-[#f6f7fb] p-8 text-slate-950">
        <h1 className="text-2xl font-bold">提出ページ</h1>
        <p className="mt-4 text-rose-600">
          Supabase環境変数が設定されていません。
        </p>
      </main>
    );
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);

  const { data: projectTeam, error } = await supabase
    .from("project_teams")
    .select(
      `
      id,
      status,
      project_id,
      team_id,
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
    .eq("id", projectTeamId)
    .single();

  if (error || !projectTeam) {
    return (
      <main className="min-h-screen bg-[#f6f7fb] p-8 text-slate-950">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-bold">提出ページ</h1>
          <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5">
            <p className="font-bold text-rose-700">読み込みに失敗しました</p>
            <p className="mt-2 text-sm text-rose-600">
              {error?.message || "データが存在しません。"}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const project = projectTeam.projects as ProjectRecord | null;
  const team = projectTeam.teams as TeamRecord | null;

  await requireTeamAccess(projectTeam.team_id);

  const savedState = await loadProjectSubmissionState(supabase, projectTeamId);
  Object.assign(projectTeam, savedState.project);
  const { data: profile, error: profileError } = await supabase.from("team_profiles").select("*").eq("team_id", projectTeam.team_id).maybeSingle();
  if (profileError) throw new Error("口座情報を読み込めません。保存内容は変更していません。");
  const companyInfo = savedState.company;
  const summaryRows = savedState.summary;
  const detailRows = savedState.details;
  const reportRows = savedState.reports;
  const screenshotFiles = savedState.files.filter((file) => file.file_category === REPORT_SCREENSHOT_FILE_CATEGORY);
  const invoiceFiles = savedState.files.filter((file) => file.file_category === "invoice_confirmation");

  const invoiceUploadUrl = getInvoiceUploadUrl(
    team?.short_name || team?.name || ""
  );
  const invoiceConfirmed = Boolean(invoiceFiles?.length);

  const backTeamId = teamId || projectTeam.team_id;
  const backHref = backTeamId
    ? `/team/projects?teamId=${backTeamId}`
    : "/team/projects";

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-6 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">
          <a href={backHref} className="text-xs font-medium text-slate-500 hover:text-slate-900">
            ← 請求書と結案報告書提出一覧へ戻る
          </a>

          <h1 className="mt-3 text-2xl font-bold">{project?.title || "-"}</h1>

          <p className="mt-1 text-sm text-slate-600">
            {team?.name || "-"} / 現在のステータス：
            {getTeamStatusLabel(projectTeam.status)}
          </p>

          {result === "draft" ? (
            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">
              下書きを保存しました。
            </div>
          ) : null}

          {result === "submit" ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              提出しました。管理者の確認をお待ちください。
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <p className="text-xs text-slate-500">審査ステータス</p>
            <p className="mt-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusTone(
                  projectTeam.status
                )}`}
              >
                {getTeamStatusLabel(projectTeam.status)}
              </span>
            </p>

            {projectTeam.submitted_at ? (
              <p className="mt-1 text-xs text-slate-400">
                提出日時：
                {new Date(projectTeam.submitted_at).toLocaleString("ja-JP")}
              </p>
            ) : null}

            {projectTeam.returned_at ? (
              <p className="mt-1 text-xs text-amber-700">
                差し戻し日時：
                {new Date(projectTeam.returned_at).toLocaleString("ja-JP")}
              </p>
            ) : null}

            {projectTeam.approved_at ? (
              <p className="mt-1 text-xs text-emerald-700">
                承認日時：
                {new Date(projectTeam.approved_at).toLocaleString("ja-JP")}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500">請求書</span>
              <span
                className={
                  invoiceConfirmed
                    ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
                    : "rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200"
                }
              >
                {invoiceConfirmed ? "アップロード済み" : "未確認"}
              </span>
            </div>
          </div>

          {projectTeam.status === "returned" && projectTeam.return_reason ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-bold">差し戻し理由</p>
              <p className="mt-2 whitespace-pre-wrap text-xs">
                {projectTeam.return_reason}
              </p>
              <p className="mt-2 text-xs">
                上記内容をご確認のうえ、修正後に再提出してください。
              </p>
            </div>
          ) : null}
        </div>

        <SubmissionForm
          action={saveSubmission}
          projectTeamId={projectTeamId}
          teamId={projectTeam.team_id}
          currentStatus={projectTeam.status}
          baseRevision={projectSubmissionRevision(savedState)}
          companyInfo={companyInfo}
          profile={profile}
          summaryRows={summaryRows || []}
          detailRows={detailRows || []}
          reportRows={reportRows || []}
          screenshotFiles={screenshotFiles || []}
          invoiceUploadUrl={invoiceUploadUrl}
          invoiceConfirmed={invoiceConfirmed}
        />
      </div>
    </main>
  );
}
