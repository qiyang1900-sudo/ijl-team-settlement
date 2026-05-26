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

  redirect(`/team/projects/${projectTeamId}?result=${actionType}`);
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
    .maybeSingle();

  const { data: uploadedFiles } = await supabase
    .from("submission_files")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .neq("file_category", "google_drive")
    .order("created_at", { ascending: false });

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
            </div>
          ) : null}

          {result === "submit" ? (
            <div className="mt-5 rounded-xl border border-green-500 bg-green-950 p-4 text-green-200">
              已提交审核，请等待管理员确认。
            </div>
          ) : null}

          <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-sm text-slate-500">审核状态</p>
            <p className="mt-2 text-lg font-semibold">
              {projectTeam.status === "not_submitted" && "未提交"}
              {projectTeam.status === "draft" && "草稿中"}
              {projectTeam.status === "submitted" && "已提交，等待审核"}
              {projectTeam.status === "returned" && "退回修改"}
              {projectTeam.status === "resubmitted" && "重新提交，等待审核"}
              {projectTeam.status === "approved" && "审核通过"}
              {projectTeam.status === "exported" && "已导出"}
            </p>

            {projectTeam.submitted_at ? (
              <p className="mt-2 text-sm text-slate-400">
                提交时间：
                {new Date(projectTeam.submitted_at).toLocaleString("ja-JP")}
              </p>
            ) : null}

            {projectTeam.returned_at ? (
              <p className="mt-2 text-sm text-yellow-300">
                退回时间：
                {new Date(projectTeam.returned_at).toLocaleString("ja-JP")}
              </p>
            ) : null}

            {projectTeam.approved_at ? (
              <p className="mt-2 text-sm text-green-300">
                审核通过时间：
                {new Date(projectTeam.approved_at).toLocaleString("ja-JP")}
              </p>
            ) : null}
          </div>

          {projectTeam.return_reason ? (
            <div className="mt-5 rounded-xl border border-yellow-500 bg-yellow-950 p-5 text-yellow-100">
              <p className="font-bold">退回理由</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {projectTeam.return_reason}
              </p>
              <p className="mt-3 text-sm">
                请根据以上内容修改后，重新提交审核。
              </p>
            </div>
          ) : null}
        </div>

        <form action={saveSubmission} encType="multipart/form-data" className="space-y-8">
          <input type="hidden" name="project_team_id" value={projectTeamId} />
          <input type="hidden" name="team_id" value={projectTeam.team_id} />
          <input type="hidden" name="current_status" value={projectTeam.status} />

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">① 契約・口座情報</h2>
            <p className="mt-2 text-sm text-slate-400">
              今後も同じ情報を使用する場合は、「次回以降も使用する」を選択してください。
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field label="契約会社名" name="company_name" defaultValue={defaultCompanyName} />
              <Field label="銀行名" name="bank_name" defaultValue={defaultBankName} />
              <Field label="口座番号" name="bank_account_number" defaultValue={defaultBankAccountNumber} />
              <Field label="Swift code" name="swift_code" defaultValue={defaultSwiftCode} />
            </div>

            <label className="mt-5 flex items-center gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                name="save_profile"
                className="h-4 w-4"
                defaultChecked={companyInfo?.used_saved_profile || false}
              />
              この情報を次回以降も使用する
            </label>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">② 検収総表</h2>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field
                label="今回の支払内容"
                name="payment_content"
                defaultValue={summaryRow?.payment_content || ""}
                placeholder="例：2025年秋季リーグ補助金（9-12月）"
              />
              <Field
                label="契約上の納品期日"
                name="delivery_due_date"
                defaultValue={summaryRow?.delivery_due_date || ""}
                placeholder="例：2025-12-31"
              />
              <Field
                label="契約支払基準"
                name="contract_payment_standard"
                defaultValue={summaryRow?.contract_payment_standard || "時間通り"}
              />
              <Field
                label="業務完了基準"
                name="completion_standard"
                defaultValue={summaryRow?.completion_standard || "時間通り"}
              />
              <Field
                label="プロジェクトチーム確認"
                name="project_team_confirmation"
                defaultValue={summaryRow?.project_team_confirmation || "確認"}
              />
              <Field
                label="備考"
                name="summary_note"
                defaultValue={summaryRow?.note || "全額支払い"}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">③ 精算明細</h2>
            <p className="mt-2 text-sm text-slate-400">
              小計は「数量 × 単価」で自動計算され、管理画面で確認できます。
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field
                label="サービス / 内容項目"
                name="service_item"
                defaultValue={detailRow?.service_item || ""}
              />
              <Field
                label="数量"
                name="quantity"
                type="number"
                defaultValue={String(detailRow?.quantity || 1)}
              />
              <Field
                label="単価"
                name="unit_price"
                type="number"
                defaultValue={String(detailRow?.unit_price || 0)}
              />

              <div>
                <label className="block text-sm font-medium text-slate-300">
                  報告金額と一致
                </label>
                <select
                  name="amount_match"
                  defaultValue={detailRow?.amount_match === false ? "false" : "true"}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
                >
                  <option value="true">はい</option>
                  <option value="false">いいえ</option>
                </select>
              </div>

              <Field label="備考" name="detail_note" defaultValue={detailRow?.note || ""} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">④ 結案報告</h2>

            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300">
              ※出演費関連の場合は、必ず出演当日の配信リンク・投稿リンクをご記入ください。
              出演費ではない場合、リンク欄は空欄でも問題ありません。
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field label="項目内容" name="item_content" defaultValue={reportRow?.item_content || ""} />
              <Field label="種別" name="category_type" defaultValue={reportRow?.category_type || ""} />
              <Field label="金額" name="report_amount" type="number" defaultValue={String(reportRow?.amount || 0)} />
              <Field
                label="リンク"
                name="link_url"
                defaultValue={reportRow?.link_url || ""}
                placeholder="出演費関連の場合のみ、出演当日のリンクを記入"
              />
              <Field
                label="実施日"
                name="implementation_date"
                defaultValue={reportRow?.implementation_date || ""}
                placeholder="例：2025-12-31"
              />
              <Field label="備考" name="report_note" defaultValue={reportRow?.note || ""} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">⑤ 証憑・資料提出</h2>

            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300">
              <p>
                ※スクリーンショットには、対象選手の顔または出演状況が確認できる画面を含めてください。
              </p>
              <p className="mt-2">
                ※交通費などスクリーンショットが多い場合は、Google Driveリンクを記入し、リンク先フォルダ内の資料が確認できるスクリーンショットをアップロードしてください。
              </p>
              <p className="mt-2">
                ※Google Driveリンクの閲覧権限が「リンクを知っている全員が閲覧可能」になっているか確認してください。
              </p>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  提出方法
                </label>
                <select
                  name="evidence_method"
                  defaultValue={evidenceFile?.submit_method === "link" ? "drive" : "upload"}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
                >
                  <option value="upload">直接アップロード</option>
                  <option value="drive">Google Driveリンク</option>
                </select>
              </div>

              <Field
                label="Google Driveリンク"
                name="evidence_drive_url"
                defaultValue={evidenceFile?.external_url || ""}
                placeholder="截图较多时填写"
              />

              <Field
                label="提出資料に関する備考"
                name="evidence_note"
                defaultValue={evidenceFile?.note || ""}
                placeholder="例：交通費領収書はGoogle Driveに格納済み"
              />

              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Google Drive内の確認用スクリーンショット
                </label>
                <input
                  type="file"
                  name="proof_screenshot"
                  accept="image/*"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Google Driveリンクで提出する場合、フォルダ内の資料一覧が分かる截图をアップロードしてください。
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">
                  証憑・提出資料アップロード
                </label>
                <input
                  type="file"
                  name="evidence_files"
                  multiple
                  accept="image/*,.pdf,.xlsx,.xls,.csv"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
                />
                <p className="mt-2 text-xs text-slate-500">
                  截图较少时可以直接上传。支持图片、PDF、Excel。
                </p>
              </div>
            </div>

            {uploadedFiles && uploadedFiles.length > 0 ? (
              <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-4">
                <h3 className="font-semibold">已上传文件</h3>
                <div className="mt-3 space-y-2">
                  {uploadedFiles.map((file: any) => (
                    <div key={file.id} className="text-sm text-slate-300">
                      {file.file_url ? (
                        <a href={file.file_url} target="_blank" className="underline">
                          {file.file_name || "文件"}
                        </a>
                      ) : (
                        file.file_name || "文件"
                      )}
                      <span className="ml-2 text-slate-500">
                        {file.note || ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <SubmitButtons />
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
      />
    </div>
  );
}
