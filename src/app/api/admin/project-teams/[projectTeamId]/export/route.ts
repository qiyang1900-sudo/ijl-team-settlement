import { createClient } from "@supabase/supabase-js";
import { SETTLEMENT_REPORT_TEMPLATE_BASE64 } from "@/lib/settlement-report-template";
import {
  fillXlsxTemplate,
  type XlsxCellValue,
} from "@/lib/xlsx-template";

type Row = Record<string, any>;
type SheetUpdates = Record<string, XlsxCellValue>;

export async function GET(
  _request: Request,
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
      exported_at,
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

  if (!["approved", "exported"].includes(projectTeam.status)) {
    return new Response("承認済みの提出のみExcel出力できます。", {
      status: 409,
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

  const template = Buffer.from(getTemplateBase64(), "base64");
  const workbook = fillXlsxTemplate(template, {
    "xl/worksheets/sheet1.xml": buildSummarySheetUpdates({
      projectTeam,
      companyInfo,
      summaryRows: summaryRows || [],
      detailRows: detailRows || [],
    }),
    "xl/worksheets/sheet2.xml": buildReportSheetUpdates({
      reportRows: reportRows || [],
      detailRows: detailRows || [],
      files: files || [],
    }),
  });

  if (projectTeam.status === "approved") {
    await supabase
      .from("project_teams")
      .update({
        status: "exported",
        exported_at: new Date().toISOString(),
      })
      .eq("id", projectTeamId);
  }

  const project = projectTeam.projects as Row | null;
  const team = projectTeam.teams as Row | null;
  const fileName = `${safeFilePart(team?.short_name || team?.name || "team")}_${safeFilePart(
    project?.title || "project"
  )}_export.xlsx`;

  return new Response(new Uint8Array(workbook), {
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

function getTemplateBase64() {
  const chars = SETTLEMENT_REPORT_TEMPLATE_BASE64.split("");
  // Repair the PR branch's text-uploaded template if the known bad bytes appear.
  const corrections = [
    { index: 7359, bad: "K", fixed: "S" },
    { index: 7710, bad: "G", fixed: "F" },
    { index: 7711, bad: "f", fixed: "v" },
  ];

  for (const correction of corrections) {
    if (chars[correction.index] === correction.bad) {
      chars[correction.index] = correction.fixed;
    }
  }

  return chars.join("");
}

function buildSummarySheetUpdates({
  projectTeam,
  companyInfo,
  summaryRows,
  detailRows,
}: {
  projectTeam: Row;
  companyInfo: Row | null;
  summaryRows: Row[];
  detailRows: Row[];
}): SheetUpdates {
  const project = projectTeam.projects as Row | null;
  const totalAmount = detailRows.reduce((sum, row) => sum + subtotal(row), 0);
  const allAmountsMatch = detailRows.every((row) => row.amount_match !== false);
  const updates: SheetUpdates = {
    B5: project?.title || "",
    E5: projectTeam.id || "",
    B8: project?.id || "",
    B9: companyInfo?.company_name || "",
    B10: companyInfo?.bank_name || "",
    B11: companyInfo?.bank_account_number || "",
    B12: companyInfo?.swift_code || "",
    E10:
      project?.description ||
      summaryRows[0]?.payment_content ||
      project?.title ||
      "",
    E12: totalAmount || "",
    E31: totalAmount || "",
    E32: totalAmount || "",
    F32: yesNo(allAmountsMatch),
    E36: `精算日：${formatDate(projectTeam.approved_at || new Date())}`,
  };

  for (let index = 0; index < 3; index++) {
    const row = summaryRows[index];
    const sheetRow = 16 + index;

    updates[`A${sheetRow}`] = index + 1;
    updates[`B${sheetRow}`] = row?.payment_content || "";
    updates[`C${sheetRow}`] = formatDate(row?.delivery_due_date);
    updates[`D${sheetRow}`] = row?.contract_payment_standard || "";
    updates[`E${sheetRow}`] = row?.completion_standard || "";
    updates[`F${sheetRow}`] = row?.project_team_confirmation || "";
    updates[`G${sheetRow}`] = row?.note || "";
  }

  for (let index = 0; index < 7; index++) {
    const row = detailRows[index];
    const sheetRow = 22 + index;

    updates[`A${sheetRow}`] = index + 1;
    updates[`B${sheetRow}`] = row?.service_item || "";
    updates[`C${sheetRow}`] = row ? toNumber(row.quantity) : "";
    updates[`D${sheetRow}`] = row ? toNumber(row.unit_price) : "";
    updates[`E${sheetRow}`] = row ? subtotal(row) : "";
    updates[`F${sheetRow}`] = row ? yesNo(row.amount_match !== false) : "";
    updates[`G${sheetRow}`] = row?.note || "";
  }

  return updates;
}

function buildReportSheetUpdates({
  reportRows,
  detailRows,
  files,
}: {
  reportRows: Row[];
  detailRows: Row[];
  files: Row[];
}): SheetUpdates {
  const updates: SheetUpdates = {};

  for (let index = 0; index < 21; index++) {
    const row = reportRows[index];
    const detail = detailRows[index];
    const rowNumber = index + 1;
    const sheetRow = 9 + index;
    const screenshot = findScreenshot(files, rowNumber);

    updates[`A${sheetRow}`] = row ? rowNumber : "";
    updates[`B${sheetRow}`] = row?.item_content || detail?.service_item || "";
    updates[`C${sheetRow}`] = row?.category_type || "";
    updates[`D${sheetRow}`] = row ? toNumber(row.amount) : "";
    updates[`E${sheetRow}`] = row?.link_url || "";
    updates[`F${sheetRow}`] = formatFileCell(screenshot);
    updates[`G${sheetRow}`] = formatDate(row?.implementation_date);
    updates[`H${sheetRow}`] = row?.publish_channel || "";
    updates[`I${sheetRow}`] = row ? "可" : "";
    updates[`J${sheetRow}`] = row?.note || "";
  }

  return updates;
}

function findScreenshot(files: Row[], rowNumber: number) {
  return files.find((file) => {
    return (
      file.file_category === "report_screenshot" &&
      String(file.note || "").includes(`No.${rowNumber}`)
    );
  });
}

function formatFileCell(file?: Row) {
  if (!file) {
    return "";
  }

  const name = file.file_name ? String(file.file_name) : "";
  const url = file.file_url ? String(file.file_url) : "";

  if (name && url) {
    return `${name}\n${url}`;
  }

  return url || name;
}

function subtotal(row: Row) {
  const storedSubtotal = toNumber(row.subtotal);

  if (storedSubtotal) {
    return storedSubtotal;
  }

  return toNumber(row.quantity) * toNumber(row.unit_price);
}

function toNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function yesNo(value: boolean) {
  return value ? "はい" : "いいえ";
}

function formatDate(value: unknown) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}/${month}/${day}`;
}

function safeFilePart(value: string) {
  return String(value || "file").replace(
    /[^a-zA-Z0-9ぁ-んァ-ヶ一-龠_-]/g,
    "_"
  );
}
