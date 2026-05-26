import { createClient } from "@supabase/supabase-js";

function csvEscape(value: any) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function makeCsv(rows: any[][]) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectTeamId: string }> }
) {
  const { projectTeamId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return new Response("Supabase環境変数が設定されていません。", {
      status: 500,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: projectTeam, error: projectTeamError } = await supabase
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
        edit_deadline_at,
        status
      ),
      teams (
        id,
        name,
        short_name,
        contact_name,
        contact_email
      )
    `
    )
    .eq("id", projectTeamId)
    .single();

  if (projectTeamError || !projectTeam) {
    return new Response("対象データが見つかりません。", {
      status: 404,
    });
  }

  const { data: companyInfo } = await supabase
    .from("submission_company_info")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .maybeSingle();

  const { data: summaryRows } = await supabase
    .from("settlement_summary_rows")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("row_number", { ascending: true });

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

  const { data: files } = await supabase
    .from("submission_files")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("created_at", { ascending: true });

  const project: any = projectTeam.projects;
  const team: any = projectTeam.teams;

  const rows: any[][] = [];

  rows.push(["基本情報"]);
  rows.push(["プロジェクト名", project?.title || ""]);
  rows.push(["プロジェクト説明", project?.description || ""]);
  rows.push(["テンプレート種別", project?.template_type || ""]);
  rows.push(["提出期限", project?.deadline_at || ""]);
  rows.push(["修正期限", project?.edit_deadline_at || ""]);
  rows.push(["戦隊名", team?.name || ""]);
  rows.push(["戦隊略称", team?.short_name || ""]);
  rows.push(["担当者", team?.contact_name || ""]);
  rows.push(["担当者メール", team?.contact_email || ""]);
  rows.push(["提出ステータス", projectTeam.status || ""]);
  rows.push(["提出日時", projectTeam.submitted_at || ""]);
  rows.push(["承認日時", projectTeam.approved_at || ""]);
  rows.push(["差し戻し理由", projectTeam.return_reason || ""]);
  rows.push([]);

  rows.push(["契約・口座情報"]);
  rows.push(["契約会社名", companyInfo?.company_name || ""]);
  rows.push(["銀行名", companyInfo?.bank_name || ""]);
  rows.push(["口座番号", companyInfo?.bank_account_number || ""]);
  rows.push(["Swift code", companyInfo?.swift_code || ""]);
  rows.push([]);

  rows.push(["検収総表"]);
  rows.push([
    "No.",
    "今回の支払内容",
    "納品期日",
    "契約支払基準",
    "業務完了基準",
    "確認",
    "備考",
  ]);

  for (const row of summaryRows || []) {
    rows.push([
      row.row_number,
      row.payment_content,
      row.delivery_due_date,
      row.contract_payment_standard,
      row.completion_standard,
      row.project_team_confirmation,
      row.note,
    ]);
  }

  rows.push([]);

  rows.push(["精算明細"]);
  rows.push([
    "No.",
    "サービス / 内容項目",
    "数量",
    "単価",
    "小計",
    "金額一致",
    "備考",
  ]);

  for (const row of detailRows || []) {
    rows.push([
      row.row_number,
      row.service_item,
      row.quantity,
      row.unit_price,
      row.subtotal,
      row.amount_match ? "はい" : "いいえ",
      row.note,
    ]);
  }

  rows.push([]);

  rows.push(["結案報告"]);
  rows.push([
    "No.",
    "項目内容",
    "種別",
    "金額",
    "リンク",
    "実施日",
    "備考",
  ]);

  for (const row of reportRows || []) {
    rows.push([
      row.row_number,
      row.item_content,
      row.category_type,
      row.amount,
      row.link_url,
      row.implementation_date,
      row.note,
    ]);
  }

  rows.push([]);

  rows.push(["提出ファイル"]);
  rows.push(["カテゴリ", "提出方法", "ファイル名", "URL", "外部URL", "備考"]);

  for (const file of files || []) {
    rows.push([
      file.file_category,
      file.submit_method,
      file.file_name,
      file.file_url,
      file.external_url,
      file.note,
    ]);
  }

  const csv = "\uFEFF" + makeCsv(rows);

  const safeTeamName = String(team?.short_name || team?.name || "team").replace(
    /[^a-zA-Z0-9ぁ-んァ-ヶ一-龠_-]/g,
    "_"
  );

  const safeProjectTitle = String(project?.title || "project").replace(
    /[^a-zA-Z0-9ぁ-んァ-ヶ一-龠_-]/g,
    "_"
  );

  const fileName = `${safeTeamName}_${safeProjectTitle}_export.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        fileName
      )}`,
    },
  });
}
