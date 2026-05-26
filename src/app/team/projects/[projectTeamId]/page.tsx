import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import SubmissionForm from "./SubmissionForm";

function createStoragePath(projectTeamId: string, fileName: string) {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${projectTeamId}/${Date.now()}-${safeFileName}`;
}

function getScreenshotRowNumber(note?: string | null) {
  const match = String(note || "").match(/No\.(\d+)/);
  return match ? Number(match[1]) : null;
}

async function saveSubmission(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase環境変数が設定されていません。");
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
  const detailCount = Number(formData.get("detail_count") || 1);

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

  await supabase
    .from("report_rows")
    .delete()
    .eq("project_team_id", projectTeamId);

  const { data: oldScreenshotFiles } = await supabase
    .from("submission_files")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .eq("file_category", "report_screenshot");

  const screenshotsToRemove =
    oldScreenshotFiles?.filter((file: any) => {
      const rowNumber = getScreenshotRowNumber(file.note);
      return rowNumber !== null && rowNumber > detailCount;
    }) || [];

  if (screenshotsToRemove.length > 0) {
    const storagePaths = screenshotsToRemove
      .map((file: any) => file.storage_path)
      .filter(Boolean);

    if (storagePaths.length > 0) {
      await adminSupabase.storage.from("screenshots").remove(storagePaths);
    }

    await supabase
      .from("submission_files")
      .delete()
      .in(
        "id",
        screenshotsToRemove.map((file: any) => file.id)
      );
  }

  for (let index = 0; index < detailCount; index++) {
    const rowNumber = index + 1;

    const serviceItem = String(formData.get(`service_item_${index}`) || "");
    const quantity = Number(formData.get(`quantity_${index}`) || 1);
    const unitPrice = Number(formData.get(`unit_price_${index}`) || 0);
    const subtotal = quantity * unitPrice;
    const amountMatch =
      String(formData.get(`amount_match_${index}`) || "true") === "true";
    const detailNote = String(formData.get(`detail_note_${index}`) || "");

    const categoryType = String(formData.get(`category_type_${index}`) || "");
    const linkUrl = String(formData.get(`link_url_${index}`) || "");
    const implementationDate = String(
      formData.get(`implementation_date_${index}`) || ""
    );
    const reportNote = String(formData.get(`report_note_${index}`) || "");

    await supabase.from("settlement_detail_rows").insert({
      project_team_id: projectTeamId,
      row_number: rowNumber,
      service_item: serviceItem,
      quantity,
      unit_price: unitPrice,
      amount_match: amountMatch,
      note: detailNote,
    });

    await supabase.from("report_rows").insert({
      project_team_id: projectTeamId,
      row_number: rowNumber,
      item_content: serviceItem,
      category_type: categoryType,
      amount: subtotal,
      link_url: linkUrl || null,
      implementation_date: implementationDate || null,
      publish_channel: "",
      note: reportNote,
    });

    const reportScreenshot = formData.get(
      `report_screenshot_${index}`
    ) as File | null;

    if (reportScreenshot && reportScreenshot.size > 0) {
      if (!reportScreenshot.type.startsWith("image/")) {
        throw new Error("スクリーンショットは画像のみアップロードできます。");
      }

      if (reportScreenshot.size > 300 * 1024) {
        throw new Error(
          "スクリーンショットは1枚300KB以内にしてください。大きい場合はリンク欄にGoogle Driveリンクをご記入ください。"
        );
      }

      const oldFilesForThisRow =
        oldScreenshotFiles?.filter((file: any) => {
          return getScreenshotRowNumber(file.note) === rowNumber;
        }) || [];

      if (oldFilesForThisRow.length > 0) {
        const oldStoragePaths = oldFilesForThisRow
          .map((file: any) => file.storage_path)
          .filter(Boolean);

        if (oldStoragePaths.length > 0) {
          await adminSupabase.storage
            .from("screenshots")
            .remove(oldStoragePaths);
        }

        await supabase
          .from("submission_files")
          .delete()
          .in(
            "id",
            oldFilesForThisRow.map((file: any) => file.id)
          );
      }

      const storagePath = createStoragePath(
        projectTeamId,
        reportScreenshot.name || `report-screenshot-${rowNumber}`
      );

      const { error: uploadError } = await adminSupabase.storage
        .from("screenshots")
        .upload(storagePath, reportScreenshot, {
          contentType: reportScreenshot.type || "application/octet-stream",
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
        file_category: "report_screenshot",
        submit_method: "upload",
        file_name: reportScreenshot.name,
        file_url: publicUrlData.publicUrl,
        storage_path: storagePath,
        mime_type: reportScreenshot.type,
        note: `結案報告 No.${rowNumber} スクリーンショット`,
      });
    }
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
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <h1 className="text-2xl font-bold">提出ページ</h1>
        <p className="mt-4 text-red-400">Supabase環境変数が設定されていません。</p>
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
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-bold">提出ページ</h1>
          <div className="mt-6 rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">読み込みに失敗しました</p>
            <p className="mt-2 text-sm text-red-200">
              {error?.message || "データが存在しません。"}
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

  const { data: detailRows } = await supabase
    .from("settlement_detail_rows")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("row_number", { ascending: true });

  const { data: reportRows } = await supabase
    .from("report_rows")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("row_number", { ascending: true });

  const { data: screenshotFiles } = await supabase
    .from("submission_files")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .eq("file_category", "report_screenshot")
    .order("created_at", { ascending: false });

  const backHref = teamId
    ? `/team/projects?teamId=${teamId}`
    : "/team/projects";

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">
          <a href={backHref} className="text-xs text-slate-400 hover:text-white">
            ← 提出プロジェクト一覧へ戻る
          </a>

          <h1 className="mt-3 text-2xl font-bold">{project?.title || "-"}</h1>

          <p className="mt-1 text-sm text-slate-400">
            {team?.name || "-"} / 現在のステータス：{projectTeam.status}
          </p>

          {result === "draft" ? (
            <div className="mt-4 rounded-lg border border-blue-500 bg-blue-950 p-3 text-sm text-blue-200">
              下書きを保存しました。
            </div>
          ) : null}

          {result === "submit" ? (
            <div className="mt-4 rounded-lg border border-green-500 bg-green-950 p-3 text-sm text-green-200">
              提出しました。管理者の確認をお待ちください。
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm">
            <p className="text-xs text-slate-500">審査ステータス</p>
            <p className="mt-1 font-semibold">
              {projectTeam.status === "not_submitted" && "未提出"}
              {projectTeam.status === "draft" && "下書き"}
              {projectTeam.status === "submitted" && "提出済み・審査待ち"}
              {projectTeam.status === "returned" && "差し戻し"}
              {projectTeam.status === "resubmitted" && "再提出済み・審査待ち"}
              {projectTeam.status === "approved" && "承認済み"}
              {projectTeam.status === "exported" && "出力済み"}
            </p>

            {projectTeam.submitted_at ? (
              <p className="mt-1 text-xs text-slate-400">
                提出日時：
                {new Date(projectTeam.submitted_at).toLocaleString("ja-JP")}
              </p>
            ) : null}

            {projectTeam.returned_at ? (
              <p className="mt-1 text-xs text-yellow-300">
                差し戻し日時：
                {new Date(projectTeam.returned_at).toLocaleString("ja-JP")}
              </p>
            ) : null}

            {projectTeam.approved_at ? (
              <p className="mt-1 text-xs text-green-300">
                承認日時：
                {new Date(projectTeam.approved_at).toLocaleString("ja-JP")}
              </p>
            ) : null}
          </div>

          {projectTeam.return_reason ? (
            <div className="mt-4 rounded-lg border border-yellow-500 bg-yellow-950 p-4 text-sm text-yellow-100">
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
          companyInfo={companyInfo}
          profile={profile}
          summaryRow={summaryRow}
          detailRows={detailRows || []}
          reportRows={reportRows || []}
          screenshotFiles={screenshotFiles || []}
        />
      </div>
    </main>
  );
}
