import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SETTLEMENT_REPORT_TEMPLATE_BASE64 } from "@/lib/settlement-report-template";
import {
  getReportTotalAmountFromRows,
  getTaxRateFromRows,
} from "@/lib/tax-rate";
import {
  extendWorksheetToMaxColumn,
  fillXlsxTemplate,
  trimWorksheetToMaxColumn,
  type XlsxCellValue,
  type XlsxTemplateImage,
} from "@/lib/xlsx-template";
import {
  getReportScreenshotOrder,
  getReportScreenshotRowNumber,
  MAX_REPORT_SCREENSHOTS_PER_ROW,
  REPORT_SCREENSHOT_FILE_CATEGORY,
} from "@/lib/report-screenshots";

type Row = Record<string, XlsxCellValue>;
type SheetUpdates = Record<string, XlsxCellValue>;

const REPORT_ROW_COUNT = 21;
const REPORT_START_ROW = 9;
const REPORT_HEADER_ROW = 8;
const REPORT_SCREENSHOT_START_COLUMN_INDEX = 5;
const REPORT_SHIFTED_HEADERS = ["実施日", "掲載チャネル", "検収可否", "備考"];

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

  const supabase = createSupabaseServerClient(supabaseUrl, undefined, supabaseServiceRoleKey);

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

  const safeCompanyInfo = companyInfo as Row | null;
  const safeSummaryRows = (summaryRows || []) as Row[];
  const safeDetailRows = (detailRows || []) as Row[];
  const safeReportRows = (reportRows || []) as Row[];
  const safeFiles = (files || []) as Row[];
  const template = Buffer.from(SETTLEMENT_REPORT_TEMPLATE_BASE64, "base64");
  const reportScreenshotMap = buildReportScreenshotMap(safeFiles);
  const reportScreenshotColumnCount =
    getReportScreenshotColumnCount(reportScreenshotMap);
  const reportSheetImages = await buildReportSheetImages(
    reportScreenshotMap,
    reportScreenshotColumnCount
  );
  const filledWorkbook = fillXlsxTemplate(
    template,
    {
      "xl/worksheets/sheet1.xml": buildSummarySheetUpdates({
        companyInfo: safeCompanyInfo,
        summaryRows: safeSummaryRows,
        detailRows: safeDetailRows,
      }),
      "xl/worksheets/sheet2.xml": buildReportSheetUpdates({
        reportRows: safeReportRows,
        detailRows: safeDetailRows,
        screenshotColumnCount: reportScreenshotColumnCount,
      }),
    },
    reportSheetImages
  );
  const extendedWorkbook = extendWorksheetToMaxColumn(
    filledWorkbook,
    "xl/worksheets/sheet2.xml",
    getReportLastColumnName(reportScreenshotColumnCount)
  );
  const workbook = trimWorksheetToMaxColumn(
    extendedWorkbook,
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

  const project = normalizeRelation(projectTeam.projects as unknown as Row | Row[] | null);
  const team = normalizeRelation(projectTeam.teams as unknown as Row | Row[] | null);
  const fileName = `${safeFilePart(String(team?.short_name || team?.name || "team"))}_${safeFilePart(
    String(project?.title || "project")
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
  const reportTotalAmount =
    getReportTotalAmountFromRows(detailRows) ?? totalAmount + taxAmount;
  const updates: SheetUpdates = {
    B9: companyInfo?.company_name || "",
    B10: companyInfo?.bank_name || "",
    B11: companyInfo?.bank_account_number || "",
    B12: companyInfo?.swift_code || "",
    E30: taxAmount,
    E31: reportTotalAmount,
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
  screenshotColumnCount,
}: {
  reportRows: Row[];
  detailRows: Row[];
  screenshotColumnCount: number;
}): SheetUpdates {
  const updates: SheetUpdates = {};

  for (let index = 0; index < screenshotColumnCount; index++) {
    updates[`${getReportScreenshotColumnName(index)}${REPORT_HEADER_ROW}`] =
      "スクリーンショット";
  }

  for (const [index, header] of REPORT_SHIFTED_HEADERS.entries()) {
    updates[`${getReportShiftedColumnName(screenshotColumnCount, index)}${REPORT_HEADER_ROW}`] =
      header;
  }

  for (let index = 0; index < REPORT_ROW_COUNT; index++) {
    const row = reportRows[index];
    const detail = detailRows[index];
    const sheetRow = REPORT_START_ROW + index;

    updates[`B${sheetRow}`] = row?.item_content || detail?.service_item || "";
    updates[`C${sheetRow}`] = row?.category_type || "";
    updates[`D${sheetRow}`] = row ? toNumber(row.amount) : "";
    updates[`E${sheetRow}`] = row?.link_url || "";

    for (let screenshotIndex = 0; screenshotIndex < screenshotColumnCount; screenshotIndex++) {
      updates[`${getReportScreenshotColumnName(screenshotIndex)}${sheetRow}`] =
        "";
    }

    updates[`${getReportShiftedColumnName(screenshotColumnCount, 0)}${sheetRow}`] =
      formatDate(row?.implementation_date);
    updates[`${getReportShiftedColumnName(screenshotColumnCount, 1)}${sheetRow}`] =
      row?.publish_channel || "";
    updates[`${getReportShiftedColumnName(screenshotColumnCount, 2)}${sheetRow}`] =
      row?.inspection_result || "";
    updates[`${getReportShiftedColumnName(screenshotColumnCount, 3)}${sheetRow}`] =
      row?.note || "";
  }

  return updates;
}

async function buildReportSheetImages(
  reportScreenshotMap: Map<number, Row[]>,
  screenshotColumnCount: number
): Promise<XlsxTemplateImage[]> {
  const images: XlsxTemplateImage[] = [];

  for (let index = 0; index < REPORT_ROW_COUNT; index++) {
    const rowNumber = index + 1;
    const screenshots = reportScreenshotMap.get(rowNumber) || [];

    for (let screenshotIndex = 0; screenshotIndex < screenshotColumnCount; screenshotIndex++) {
      const screenshot = screenshots[screenshotIndex];
      const image = await fetchScreenshotImage(screenshot);

      if (!image) {
        continue;
      }

      images.push({
        worksheet: "xl/worksheets/sheet2.xml",
        cell: `${getReportScreenshotColumnName(screenshotIndex)}${
          REPORT_START_ROW + index
        }`,
        data: image.data,
        extension: image.extension,
        contentType: image.contentType,
        altText: String(
          screenshot?.file_name ||
            `結果報告 No.${rowNumber} スクリーンショット ${screenshotIndex + 1}`
        ),
      });
    }
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

function buildReportScreenshotMap(files: Row[]) {
  const screenshotMap = new Map<number, Row[]>();

  for (const file of files) {
    if (file.file_category !== REPORT_SCREENSHOT_FILE_CATEGORY) {
      continue;
    }

    const rowNumber = getReportScreenshotRowNumber(String(file.note || ""));

    if (!rowNumber) {
      continue;
    }

    const existing = screenshotMap.get(rowNumber) || [];
    existing.push(file);
    screenshotMap.set(rowNumber, existing);
  }

  for (const [rowNumber, rowFiles] of screenshotMap.entries()) {
    screenshotMap.set(
      rowNumber,
      rowFiles
        .sort(
          (a, b) =>
            getReportScreenshotOrder(String(a.note || "")) -
            getReportScreenshotOrder(String(b.note || ""))
        )
        .slice(0, MAX_REPORT_SCREENSHOTS_PER_ROW)
    );
  }

  return screenshotMap;
}

function getReportScreenshotColumnCount(reportScreenshotMap: Map<number, Row[]>) {
  let maxCount = 1;

  for (const screenshots of reportScreenshotMap.values()) {
    maxCount = Math.max(maxCount, screenshots.length);
  }

  return Math.min(maxCount, MAX_REPORT_SCREENSHOTS_PER_ROW);
}

function getReportScreenshotColumnName(index: number) {
  return indexToColumnName(REPORT_SCREENSHOT_START_COLUMN_INDEX + index);
}

function getReportShiftedColumnName(
  screenshotColumnCount: number,
  shiftedColumnIndex: number
) {
  return indexToColumnName(
    REPORT_SCREENSHOT_START_COLUMN_INDEX +
      screenshotColumnCount +
      shiftedColumnIndex
  );
}

function getReportLastColumnName(screenshotColumnCount: number) {
  return getReportShiftedColumnName(
    screenshotColumnCount,
    REPORT_SHIFTED_HEADERS.length - 1
  );
}

function indexToColumnName(index: number) {
  let value = Math.max(index, 0) + 1;
  let columnName = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    value = Math.floor((value - 1) / 26);
  }

  return columnName || "A";
}

function subtotal(row: Row) {
  const storedSubtotal = toNumber(row.subtotal);

  if (storedSubtotal) {
    return storedSubtotal;
  }

  return toNumber(row.quantity) * toNumber(row.unit_price);
}

function normalizeRelation<T>(relation: T | T[] | null | undefined) {
  return Array.isArray(relation) ? relation[0] : relation;
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
