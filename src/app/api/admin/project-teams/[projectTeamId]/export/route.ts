import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

function addRowsSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  columns: { header: string; key: string; width?: number }[],
  rows: any[]
) {
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width || 20,
  }));

  sheet.getRow(1).font = { bold: true };

  rows.forEach((row) => {
    sheet.addRow(row);
  });

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = {
        vertical: "top",
        wrapText: true,
      };
    });
  });
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

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Team Settlement System";
  workbook.created = new Date();

  const project: any = projectTeam.projects;
  const team: any = projectTeam.teams;

  addRowsSheet(
    workbook,
    "基本情報",
    [
      { header: "項目", key: "label", width: 28 },
      { header: "内容", key: "value", width: 60 },
    ],
    [
      { label: "プロジェクト名", value: project?.title || "" },
      { label: "プロジェクト説明", value: project?.description || "" },
      { label: "テンプレート種別", value: project?.template_type || "" },
      { label: "提出期限", value: project?.deadline_at || "" },
      { label: "修正期限", value: project?.edit_deadline_at || "" },
      { label: "戦隊名", value: team?.name || "" },
      { label: "戦隊略称", value: team?.short_name || "" },
      { label: "担当者", value: team?.contact_name || "" },
      { label: "担当者メール", value: team?.contact_email || "" },
      { label: "提出ステータス", value: projectTeam.status || "" },
      { label: "提出日時", value: projectTeam.submitted_at || "" },
      { label: "承認日時", value: projectTeam.approved_at || "" },
      { label: "差し戻し理由", value: projectTeam.return_reason || "" },
    ]
  );

  addRowsSheet(
    workbook,
    "契約・口座情報",
    [
      { header: "項目", key: "label", width: 28 },
      { header: "内容", key: "value", width: 60 },
    ],
    [
      { label: "契約会社名", value: companyInfo?.company_name || "" },
      { label: "銀行名", value: companyInfo?.bank_name || "" },
      { label: "口座番号", value: companyInfo?.bank_account_number || "" },
      { label: "Swift code", value: companyInfo?.swift_code || "" },
    ]
  );

  addRowsSheet(
    workbook,
    "検収総表",
    [
      { header: "No.", key: "row_number", width: 8 },
      { header: "今回の支払内容", key: "payment_content", width: 40 },
      { header: "納品期日", key: "delivery_due_date", width: 18 },
      { header: "契約支払基準", key: "contract_payment_standard", width: 24 },
      { header: "業務完了基準", key: "completion_standard", width: 24 },
      { header: "確認", key: "project_team_confirmation", width: 18 },
      { header: "備考", key: "note", width: 40 },
    ],
    summaryRows || []
  );

  addRowsSheet(
    workbook,
    "精算明細",
    [
      { header: "No.", key: "row_number", width: 8 },
      { header: "サービス / 内容項目", key: "service_item", width: 40 },
      { header: "数量", key: "quantity", width: 12 },
      { header: "単価", key: "unit_price", width: 16 },
      { header: "小計", key: "subtotal", width: 16 },
      { header: "金額一致", key: "amount_match", width: 14 },
      { header: "備考", key: "note", width: 40 },
    ],
    (detailRows || []).map((row: any) => ({
      ...row,
      amount_match: row.amount_match ? "はい" : "いいえ",
    }))
  );

  addRowsSheet(
    workbook,
    "結案報告",
    [
      { header: "No.", key: "row_number", width: 8 },
      { header: "項目内容", key: "item_content", width: 40 },
      { header: "種別", key: "category_type", width: 16 },
      { header: "金額", key: "amount", width: 16 },
      { header: "リンク", key: "link_url", width: 60 },
      { header: "実施日", key: "implementation_date", width: 18 },
      { header: "備考", key: "note", width: 40 },
    ],
    reportRows || []
  );

  addRowsSheet(
    workbook,
    "提出ファイル",
    [
      { header: "カテゴリ", key: "file_category", width: 24 },
      { header: "提出方法", key: "submit_method", width: 18 },
      { header: "ファイル名", key: "file_name", width: 40 },
      { header: "URL", key: "file_url", width: 70 },
      { header: "外部URL", key: "external_url", width: 70 },
      { header: "備考", key: "note", width: 40 },
    ],
    files || []
  );

  const buffer = await workbook.xlsx.writeBuffer();

  const safeTeamName = String(team?.short_name || team?.name || "team").replace(
    /[^a-zA-Z0-9ぁ-んァ-ヶ一-龠_-]/g,
    "_"
  );

  const safeProjectTitle = String(project?.title || "project").replace(
    /[^a-zA-Z0-9ぁ-んァ-ヶ一-龠_-]/g,
    "_"
  );

  const fileName = `${safeTeamName}_${safeProjectTitle}_export.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        fileName
      )}`,
    },
  });
}
