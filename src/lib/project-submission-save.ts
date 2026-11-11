import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSettlementDetailNote, normalizeTaxRate } from "./tax-rate";
import { getInvoiceUploadUrl } from "./invoice-upload-links";
import { createReportScreenshotNote, getReportScreenshotOrder, getReportScreenshotRowNumber, REPORT_SCREENSHOT_FILE_CATEGORY } from "./report-screenshots";

type DataRow = Record<string, unknown>;
export type ProjectSubmissionState = {
  project: DataRow & { id: string; team_id: string; status: string };
  company: DataRow | null;
  summary: DataRow[];
  details: DataRow[];
  reports: DataRow[];
  files: Array<DataRow & { id: string; note: string | null; file_category: string }>;
};
export type ProjectSaveResult = { status: "success" | "error"; message: string; redirectTo?: string };

export function projectSubmissionRevision(state: ProjectSubmissionState) {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
  return createHash("sha256").update(JSON.stringify(stable(state))).digest("hex");
}

export async function loadProjectSubmissionState(supabase: SupabaseClient, projectTeamId: string) {
  const { data, error } = await supabase.rpc("project_submission_state", { p_id: projectTeamId });
  if (error || !data?.project) throw new Error(`提出内容の読み込みに失敗しました。${error?.message || "対象が見つかりません。"}`);
  return data as ProjectSubmissionState;
}

function amount(value: FormDataEntryValue | null, label: string, fallback?: number) {
  const text = String(value ?? "").trim().replaceAll(",", "");
  if (!text && fallback !== undefined) return fallback;
  const number = Number(text);
  if (!text || !Number.isFinite(number) || number < 0 || number > Number.MAX_SAFE_INTEGER) throw new Error(`${label}を正しい数値で入力してください。`);
  return number;
}

export async function saveProjectSubmission({ supabase, storageClient, formData, teamId, projectTeamId }: {
  supabase: SupabaseClient; storageClient: SupabaseClient; formData: FormData; teamId: string; projectTeamId: string;
}) {
  const before = await loadProjectSubmissionState(supabase, projectTeamId);
  if (before.project.team_id !== teamId) throw new Error("この提出対象へのアクセス権限がありません。");
  if (["submitted", "resubmitted", "reviewing", "approved", "exported"].includes(before.project.status)) throw new Error("提出済み・審査中・承認済みの内容は変更できません。");
  if (!formData.get("base_revision") || formData.get("base_revision") !== projectSubmissionRevision(before)) throw new Error("他の画面で内容が更新されたか、入力画面が旧バージョンです。入力を控えてページを開き直してください。保存済みデータは変更していません。");
  const action = String(formData.get("action_type") || "draft");
  if (!["draft", "submit"].includes(action)) throw new Error("保存操作が不正です。");
  const summaryCount = amount(formData.get("summary_count"), "項目数");
  const detailCount = amount(formData.get("detail_count"), "明細数");
  if (!Number.isInteger(summaryCount) || summaryCount < 1 || summaryCount > 3 || !Number.isInteger(detailCount) || detailCount < 1 || detailCount > 7) throw new Error("明細の項目数が不正です。保存内容は変更していません。");
  const text = (key: string) => String(formData.get(key) || "");
  const date = (key: string) => {
    const value = text(key);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) throw new Error("日付を正しく入力してください。");
    return value;
  };
  const summary = Array.from({ length: summaryCount }, (_, index) => ({ payment_content: text(`payment_content_${index}`), delivery_due_date: date(`delivery_due_date_${index}`) }));
  const reportTotal = text("report_total_amount").trim() ? amount(formData.get("report_total_amount"), "合計金額") : null;
  const details = Array.from({ length: detailCount }, (_, index) => ({
    service_item: text(`service_item_${index}`), quantity: amount(formData.get(`quantity_${index}`), "数量", 1), unit_price: amount(formData.get(`unit_price_${index}`), "単価", 0),
    note: index === 0 ? createSettlementDetailNote({ taxRate: normalizeTaxRate(formData.get("tax_rate")), reportTotalAmount: reportTotal }) : "",
  }));
  const reports = details.map((row, index) => {
    const total = row.quantity * row.unit_price;
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) throw new Error("明細金額が大きすぎます。");
    return { item_content: row.service_item, category_type: text(`category_type_${index}`), amount: total, link_url: text(`link_url_${index}`), implementation_date: date(`implementation_date_${index}`) };
  });
  const uploads = Array.from({ length: detailCount }, (_, index) => formData.getAll(`report_screenshot_${index}`).filter((file): file is File => file instanceof File && file.size > 0));
  // Validate the entire request before uploading or changing any saved row.
  for (const file of uploads.flat()) {
    if (!file.type.startsWith("image/")) throw new Error("スクリーンショットは画像のみアップロードできます。");
    if (file.size > 300 * 1024) throw new Error("スクリーンショットは1枚300KB以内にしてください。");
  }
  const screenshots = before.files.filter((file) => file.file_category === REPORT_SCREENSHOT_FILE_CATEGORY);
  const removeIds = screenshots.filter((file) => {
    const row = getReportScreenshotRowNumber(file.note);
    return row !== null && (row > detailCount || text(`delete_screenshot_${row-1}`) === "true");
  }).map((file) => file.id);
  const newFiles = [];
  for (const [index, files] of uploads.entries()) {
    const rowNumber = index + 1;
    const kept = screenshots.filter((file) => getReportScreenshotRowNumber(file.note) === rowNumber && !removeIds.includes(file.id));
    const order = kept.reduce((max, file) => Math.max(max, getReportScreenshotOrder(file.note)), 0);
    for (const [fileIndex, file] of files.entries()) {
      const storagePath = `${projectTeamId}/${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const { error } = await storageClient.storage.from("screenshots").upload(storagePath, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(`画像の保存に失敗しました。${error.message}`);
      const { data } = storageClient.storage.from("screenshots").getPublicUrl(storagePath);
      newFiles.push({ file_name: file.name, file_url: data.publicUrl, storage_path: storagePath, mime_type: file.type, note: createReportScreenshotNote(rowNumber, order + fileIndex + 1) });
    }
  }
  let invoiceUrl = null;
  if (formData.get("invoice_uploaded") === "on") {
    const { data, error } = await supabase.from("teams").select("name, short_name").eq("id", teamId).single();
    if (error) throw new Error(`請求書フォルダを確認できません。${error.message}`);
    invoiceUrl = getInvoiceUploadUrl(data.short_name || data.name);
    if (!invoiceUrl) throw new Error("請求書フォルダが設定されていません。");
  }
  const { data, error } = await supabase.rpc("save_project_submission_atomic", {
    p_id: projectTeamId, p_team_id: teamId, p_before: before,
    p_payload: { action, summary, details, reports, remove_file_ids: removeIds, new_files: newFiles, invoice_url: invoiceUrl,
      company: { company_name: text("company_name"), bank_name: text("bank_name"), bank_account_number: text("bank_account_number"), swift_code: text("swift_code"), used_saved_profile: formData.get("save_profile") === "on" } },
  });
  if (error) throw new Error(`保存を完了できませんでした。${error.message}`);
  if (!data?.project || data.details?.length !== detailCount || data.reports?.length !== detailCount) throw new Error("保存結果を確認できませんでした。入力を保持したまま、別のタブで保存状況を確認してください。");
  return { status: "success" as const, message: action === "submit" ? "審査へ提出しました。" : "下書きを保存しました。", redirectTo: `/team/projects/${encodeURIComponent(projectTeamId)}?result=${action}&teamId=${encodeURIComponent(teamId)}` };
}
