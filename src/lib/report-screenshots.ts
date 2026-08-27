export const REPORT_SCREENSHOT_FILE_CATEGORY = "report_screenshot";
export const MAX_REPORT_SCREENSHOTS_PER_ROW = 2;

export function getReportScreenshotRowNumber(note?: string | null) {
  const match = String(note || "").match(/No\.(\d+)/);
  return match ? Number(match[1]) : null;
}

export function getReportScreenshotOrder(note?: string | null) {
  const match = String(note || "").match(/スクリーンショット\s*(\d+)/);
  return match ? Number(match[1]) : 1;
}

export function createReportScreenshotNote(rowNumber: number, order: number) {
  return `結果報告 No.${rowNumber} スクリーンショット ${order}`;
}
