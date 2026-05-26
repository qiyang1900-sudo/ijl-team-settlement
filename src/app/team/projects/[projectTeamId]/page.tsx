import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import SubmitButtons from "./SubmitButtons";

function createStoragePath(projectTeamId: string, fileName: string) {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${projectTeamId}/${Date.now()}-${safeFileName}`;
}

async function saveSubmission(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const adminSupabase =
    serviceRoleKey && supabaseUrl
      ? createClient(supabaseUrl, serviceRoleKey)
      : supabase;

  const projectTeamId = String(formData.get("project_team_id") || "");
  const teamId = String(formData.get("team_id") || "");
  const currentStatus = String(formData.get("current_status") || "");
  const actionType = String(formData.get("action_type") || "draft");

  const companyName = String(formData.get("company_name") || "");
  const bankName = String(formData.get("bank_name") || "");
  const bankAccountNumber = String(formData.get("bank_account_number") || "");
  const swiftCode = String(formData.get("swift_code") || "");
  const saveProfile = formData.get("save_profile") === "on";

  const paymentContent = String(formData.get("payment_content") || "");
  const deliveryDueDate = String(formData.get("delivery_due_date") || "");
  const contractPaymentStandard = String(
    formData.get("contract_payment_standard") || "時間通り"
  );
  const completionStandard = String(
    formData.get("completion_standard") || "時間通り"
  );
  const projectTeamConfirmation = String(
    formData.get("project_team_confirmation") || "確認"
  );
  const summaryNote = String(formData.get("summary_note") || "全額支払い");

  const serviceItem = String(formData.get("service_item") || "");
  const quantity = Number(formData.get("quantity") || 1);
  const unitPrice = Number(formData.get("unit_price") || 0);
  const amountMatch = String(formData.get("amount_match") || "true") === "true";
  const detailNote = String(formData.get("detail_note") || "");

  const itemContent = String(formData.get("item_content") || "");
  const categoryType = String(formData.get("category_type") || "");
  const reportAmount = Number(formData.get("report_amount") || 0);
  const linkUrl = String(formData.get("link_url") || "");
  const implementationDate = String(formData.get("implementation_date") || "");
  const reportNote = String(formData.get("report_note") || "");

  const evidenceMethod = String(formData.get("evidence_method") || "upload");
  const evidenceDriveUrl = String(formData.get("evidence_drive_url") || "");
  const evidenceNote = String(formData.get("evidence_note") || "");

  const proofScreenshot = formData.get("proof_screenshot") as File | null;
  const evidenceFiles = formData.getAll("evidence_files") as File[];

  await supabase.from("submission_company_info").upsert(
    {
      project_team_id: projectTeamId,
      company_name: companyName,
      bank_name: bankName,
      bank_account_number: bankAccountNumber,
      swift_code: swiftCode,
      used_saved_profile: saveProfile,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "project_team_id",
    }
  );

  if (saveProfile && teamId) {
    await supabase.from("team_profiles").upsert(
      {
        team_id: teamId,
        company_name: companyName,
        bank_name: bankName,
        bank_account_number: bankAccountNumber,
        swift_code: swiftCode,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "team_id",
      }
    );
  }

  await supabase
    .from("settlement_summary_rows")
    .delete()
    .eq("project_team_id", projectTeamId);

  await supabase.from("settlement_summary_rows").insert({
    project_team_id: projectTeamId,
    row_number: 1,
    payment_content: paymentContent,
    delivery_due_date: deliveryDueDate || null,
    contract_payment_standard: contractPaymentStandard,
    completion_standard: completionStandard,
    project_team_confirmation: projectTeamConfirmation,
    note: summaryNote,
  });

  await supabase
    .from("settlement_detail_rows")
    .delete()
    .eq("project_team_id", projectTeamId);

  await supabase.from("settlement_detail_rows").insert({
    project_team_id: projectTeamId,
    row_number: 1,
    service_item: serviceItem,
    quantity,
    unit_price: unitPrice,
    amount_match: amountMatch,
    note: detailNote,
  });

  await supabase
    .from("report_rows")
    .delete()
    .eq("project_team_id", projectTeamId);

  await supabase.from("report_rows").insert({
    project_team_id: projectTeamId,
    row_number: 1,
    item_content: itemContent,
    category_type: categoryType,
    amount: reportAmount,
    link_url: linkUrl,
    implementation_date: implementationDate || null,
    publish_channel: "",
    note: reportNote,
  });

  await supabase
    .from("submission_files")
    .delete()
    .eq("project_team_id", projectTeamId)
    .eq("file_category", "google_drive");

  if (evidenceDriveUrl || evidenceNote) {
    await supabase.from("submission_files").insert({
      project_team_id: projectTeamId,
      file_category: "google_drive",
      submit_method: evidenceMethod === "drive" ? "link" : "upload",
      external_url: evidenceDriveUrl || null,
      note: evidenceNote || null,
    });
  }

  if (proofScreenshot && proofScreenshot.size > 0) {
    const storagePath = createStoragePath(
      projectTeamId,
      proofScreenshot.name || "proof-screenshot"
    );

    const { error: uploadError } = await adminSupabase.storage
      .from("screenshots")
      .upload(storagePath, proofScreenshot, {
        contentType: proofScreenshot.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicUrlData } = adminSupabase.storage
      .from("screenshots")
      .getPublicUrl(storagePath);

    await supabase.from("submission_files").insert({
      project_team_id: projectTeamId,
      file_category: "screenshot",
      submit_method: "upload",
      file_name: proofScreenshot.name,
      file_url: publicUrlData.publicUrl,
      storage_path: storagePath,
      mime_type: proofScreenshot.type,
      note: "Google Driveフォルダ内確認用スクリーンショット",
    });
  }

  for (const file of evidenceFiles) {
    if (!file || file.size === 0) continue;

    const storagePath = createStoragePath(projectTeamId, file.name || "file");

    const { error: uploadError } = await adminSupabase.storage
      .from("reports")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicUrlData } = adminSupabase.storage
      .from("reports")
      .getPublicUrl(storagePath);

    await supabase.from("submission_files").insert({
      project_team_id: projectTeamId,
      file_category: "other",
      submit_method: "upload",
      file_name: file.name,
      file_url: publicUrlData.publicUrl,
      storage_path: storagePath,
      mime_type: file.type,
      note: "証憑・提出資料",
    });
  }

  let nextStatus = "draft";
  let submittedAt = null;

  if (actionType === "submit") {
    nextStatus = currentStatus === "returned" ? "resubmitted" : "submitted";
    submittedAt = new Date().toISOString();
  }

  await supabase
    .from("project_teams")
    .update({
      status: nextStatus,
      submitted_at: submittedAt,
    })
    .eq("id", projectTeamId);

  redirect(`/team/projects/${projectTeamId}?teamId=${teamId}&result=${actionType}`);
}

export default async function TeamSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectTeamId: string }>;
  searchParams: Promise<{ teamId?: string; result?: string }>;
}) {
  const { projectTeamId } = await params;
  const { teamId, result } = await searchParams;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">战队提交页面</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-bold">战队提交页面</h1>
          <div className="mt-6 rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">读取失败</p>
            <p className="mt-2 text-sm text-red-200">
              {error?.message || "数据不存在"}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const project: any = projectTeam.projects;
  const team: any = projectTeam.teams;

  const { data: profile } = await supabase
    .from("team_profiles")
    .select("*")
    .eq("team_id", projectTeam.team_id)
    .maybeSingle();

  const { data: companyInfo } = await supabase
    .from("submission_company_info")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .maybeSingle();

  const { data: summaryRow } = await supabase
    .from("settlement_summary_rows")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("row_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: detailRow } = await supabase
    .from("settlement_detail_rows")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("row_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: reportRow } = await supabase
    .from("report_rows")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("row_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: evidenceFile } = await supabase
    .from("submission_files")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .eq("file_category", "google_drive")
    .limit(1)
    .maybeSingle();

  const defaultCompanyName =
    companyInfo?.company_name || profile?.company_name || "";
  const defaultBankName = companyInfo?.bank_name || profile?.bank_name || "";
  const defaultBankAccountNumber =
    companyInfo?.bank_account_number || profile?.bank_account_number || "";
  const defaultSwiftCode = companyInfo?.swift_code || profile?.swift_code || "";

  const backHref = teamId
    ? `/team/projects?teamId=${teamId}`
    : "/team/projects";

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <a href={backHref} className="text-sm text-slate-400 hover:text-white">
            ← 我的提交项目へ戻る
          </a>

          <h1 className="mt-4 text-3xl font-bold">{project?.title || "-"}</h1>

          <p className="mt-2 text-slate-400">
            {team?.name || "-"} / 当前状态：{projectTeam.status}
          </p>

          {result === "draft" ? (
            <div className="mt-5 rounded-xl border border-blue-500 bg-blue-950 p-4 text-blue-200">
              草稿已保存。
            </
