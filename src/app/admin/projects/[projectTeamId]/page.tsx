import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

async function saveSubmission(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const projectTeamId = String(formData.get("project_team_id") || "");
  const teamId = String(formData.get("team_id") || "");
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
  const publishChannel = String(formData.get("publish_channel") || "");
  const reportNote = String(formData.get("report_note") || "");

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
    publish_channel: publishChannel,
    note: reportNote,
  });

  await supabase
    .from("project_teams")
    .update({
      status: actionType === "submit" ? "submitted" : "draft",
      submitted_at: actionType === "submit" ? new Date().toISOString() : null,
    })
    .eq("id", projectTeamId);

  redirect(`/team/projects/${projectTeamId}?saved=1`);
}

export default async function TeamSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectTeamId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { projectTeamId } = await params;
  const { saved } = await searchParams;

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

  const defaultCompanyName =
    companyInfo?.company_name || profile?.company_name || "";
  const defaultBankName = companyInfo?.bank_name || profile?.bank_name || "";
  const defaultBankAccountNumber =
    companyInfo?.bank_account_number || profile?.bank_account_number || "";
  const defaultSwiftCode = companyInfo?.swift_code || profile?.swift_code || "";

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <a href="/team" className="text-sm text-slate-400 hover:text-white">
            ← 战队入口へ戻る
          </a>

          <h1 className="mt-4 text-3xl font-bold">{project?.title || "-"}</h1>
          <p className="mt-2 text-slate-400">
            {team?.name || "-"} / 当前状态：{projectTeam.status}
          </p>

          {saved === "1" ? (
            <div className="mt-5 rounded-xl border border-green-500 bg-green-950 p-4 text-green-200">
              保存成功。
            </div>
          ) : null}
        </div>

        <form action={saveSubmission} className="space-y-8">
          <input type="hidden" name="project_team_id" value={projectTeamId} />
          <input type="hidden" name="team_id" value={projectTeam.team_id} />

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">① 契約・口座情報</h2>
            <p className="mt-2 text-sm text-slate-400">
              今後も同じ情報を使用する場合は、「次回以降も使用する」を選択してください。
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field
                label="契約会社名"
                name="company_name"
                defaultValue={defaultCompanyName}
                placeholder="例：株式会社Fennel"
              />
              <Field
                label="銀行名"
                name="bank_name"
                defaultValue={defaultBankName}
                placeholder="例：RAKUTEN BANK, LTD"
              />
              <Field
                label="口座番号"
                name="bank_account_number"
                defaultValue={defaultBankAccountNumber}
                placeholder="例：1234567"
              />
              <Field
                label="Swift code"
                name="swift_code"
                defaultValue={defaultSwiftCode}
                placeholder="例：RAKTJPJT"
              />
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
                type="date"
                defaultValue={summaryRow?.delivery_due_date || ""}
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
                placeholder="例：2025年秋季リーグ補助金（9-12月）"
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

              <Field
                label="備考"
                name="detail_note"
                defaultValue={detailRow?.note || ""}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">④ 結案報告</h2>

            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300">
              <p>
                ※出演費関連の場合は、必ず出演当日の配信リンク・投稿リンクをご記入ください。
              </p>
              <p className="mt-2">
                ※スクリーンショットには、対象選手の顔または出演状況が確認できる画面を含めてください。
              </p>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field
                label="項目内容"
                name="item_content"
                defaultValue={reportRow?.item_content || ""}
                placeholder="例：2025年秋季リーグ補助金（9-12月）"
              />
              <Field
                label="種別"
                name="category_type"
                defaultValue={reportRow?.category_type || ""}
                placeholder="例：1"
              />
              <Field
                label="金額"
                name="report_amount"
                type="number"
                defaultValue={String(reportRow?.amount || 0)}
              />
              <Field
                label="リンク"
                name="link_url"
                defaultValue={reportRow?.link_url || ""}
                placeholder="https://..."
              />
              <Field
                label="実施日"
                name="implementation_date"
                type="date"
                defaultValue={reportRow?.implementation_date || ""}
              />
              <Field
                label="掲載チャネル"
                name="publish_channel"
                defaultValue={reportRow?.publish_channel || ""}
                placeholder="YouTube / X / TikTok / その他"
              />
              <Field
                label="備考"
                name="report_note"
                defaultValue={reportRow?.note || ""}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">⑤ 証憑・資料提出</h2>
            <p className="mt-4 text-slate-400">
              ファイルアップロード、Google Driveリンク、フォルダ内截图证明は次のステップで追加します。
            </p>
          </section>

          <div className="flex justify-end gap-3">
            <button
              type="submit"
              name="action_type"
              value="draft"
              className="rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              保存草稿
            </button>

            <button
              type="submit"
              name="action_type"
              value="submit"
              className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
            >
              提交审核
            </button>
          </div>
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