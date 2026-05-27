import { createClient } from "@supabase/supabase-js";
import { SETTLEMENT_REPORT_TEMPLATE_BASE64 } from "@/lib/settlement-report-template";
import { getTaxRateFromRows } from "@/lib/tax-rate";
import {
  fillXlsxTemplate,
  trimWorksheetToMaxColumn,
  type XlsxCellValue,
  type XlsxTemplateImage,
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

  const template = Buffer.from(SETTLEMENT_REPORT_TEMPLATE_BASE64, "base64");
  const reportSheetImages = await buildReportSheetImages(files || []);
  const filledWorkbook = fillXlsxTemplate(
    template,
    {
      "xl/worksheets/sheet1.xml": buildSummarySheetUpdates({
        companyInfo,
        summaryRows: summaryRows || [],
        detailRows: detailRows || [],
      }),
      "xl/worksheets/sheet2.xml": buildReportSheetUpdates({
        reportRows: reportRows || [],
        detailRows: detailRows || [],
      }),
    },
    reportSheetImages
  );
  const workbook = trimWorksheetToMaxColumn(
    filledWorkbook,
    "xl/worksheets/sheet1.xml",
    "G"
  );

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

function buildSummarySheetUpdates({
  companyInfo,
  summaryRows,
  detailRows,
}: {
  companyInfo: Row | null;
  summaryRows: Row[];
  detailRows: Row[];
}): SheetUpdates {
  const totalAmount = detailRows.reduce((sum, row) => sum + subtotal(row), 0);
  const taxRate = getTaxRateFromRows(detailRows);
  const taxAmount = Math.round(totalAmount * taxRate);
  const updates: SheetUpdates = {
    B9: companyInfo?.company_name || "",
    B10: companyInfo?.bank_name || "",
    B11: companyInfo?.bank_account_number || "",
    B12: companyInfo?.swift_code || "",
    E30: taxAmount,
    E31: totalAmount + taxAmount,
  };

  for (let index = 0; index < 3; index++) {
    const row = summaryRows[index];
    const sheetRow = 16 + index;

    updates[`B${sheetRow}`] = row?.payment_content || "";
    updates[`C${sheetRow}`] = formatDate(row?.delivery_due_date);
  }

  for (let index = 0; index < 7; index++) {
    const row = detailRows[index];
    const sheetRow = 22 + index;

    updates[`B${sheetRow}`] = row?.service_item || "";
    updates[`C${sheetRow}`] = row ? toNumber(row.quantity) : "";
    updates[`D${sheetRow}`] = row ? toNumber(row.unit_price) : "";
    updates[`E${sheetRow}`] = row ? subtotal(row) : "";
  }

  return updates;
}

function buildReportSheetUpdates({
  reportRows,
  detailRows,
}: {
  reportRows: Row[];
  detailRows: Row[];
}): SheetUpdates {
  const updates: SheetUpdates = {};

  for (let index = 0; index < 21; index++) {
    const row = reportRows[index];
    const detail = detailRows[index];
    const sheetRow = 9 + index;

    updates[`B${sheetRow}`] = row?.item_content || detail?.service_item || "";
    updates[`C${sheetRow}`] = row?.category_type || "";
    updates[`D${sheetRow}`] = row ? toNumber(row.amount) : "";
    updates[`E${sheetRow}`] = row?.link_url || "";
    updates[`F${sheetRow}`] = "";
    updates[`G${sheetRow}`] = formatDate(row?.implementation_date);
  }

  return updates;
}

async function buildReportSheetImages(files: Row[]): Promise<XlsxTemplateImage[]> {
  const images: XlsxTemplateImage[] = [];

  for (let index = 0; index < 21; index++) {
    const rowNumber = index + 1;
    const screenshot = findScreenshot(files, rowNumber);
    const image = await fetchScreenshotImage(screenshot);

    if (!image) {
      continue;
    }

    images.push({
      worksheet: "xl/worksheets/sheet2.xml",
      cell: `F${9 + index}`,
      data: image.data,
      extension: image.extension,
      contentType: image.contentType,
      altText: screenshot?.file_name || `結果報告 No.${rowNumber}`,
    });
  }

  return images;
}

async function fetchScreenshotImage(file?: Row) {
  const fileUrl = file?.file_url ? String(file.file_url) : "";

  if (!fileUrl) {
    return null;
  }

  try {
    const response = await fetch(fileUrl);

    if (!response.ok) {
      return null;
    }

    const responseContentType = String(
      response.headers.get("content-type") || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();
    const contentType = String(file?.mime_type || responseContentType)
      .split(";")[0]
      .trim()
      .toLowerCase();
    const extension =
      imageExtensionFromContentType(contentType) ||
      imageExtensionFromFileName(String(file?.file_name || fileUrl));

    if (!extension) {
      return null;
    }

    return {
      data: Buffer.from(await response.arrayBuffer()),
      extension,
      contentType: extension === "png" ? "image/png" : "image/jpeg",
    };
  } catch {
    return null;
  }
}

function findScreenshot(files: Row[], rowNumber: number) {
  return files.find((file) => {
    return (
      file.file_category === "report_screenshot" &&
      String(file.note || "").includes(`No.${rowNumber}`)
    );
  });
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

function imageExtensionFromContentType(contentType: string) {
  if (contentType === "image/png") {
    return "png";
  }

  if (contentType === "image/jpeg" || contentType === "image/jpg") {
    return "jpg";
  }

  return "";
}

function imageExtensionFromFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "png") {
    return "png";
  }

  if (extension === "jpg" || extension === "jpeg") {
    return "jpg";
  }

  return "";
}
