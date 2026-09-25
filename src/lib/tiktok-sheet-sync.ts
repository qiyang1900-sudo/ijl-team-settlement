import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentMonthValue } from "./month-options";
import { loadTiktokDataset, tiktokBucket, tiktokSnapshotPath } from "./tiktok-dataset";
import { mergeTiktokImport, parseTiktokWorkbook, tiktokSpreadsheetId } from "./tiktok-sheet-import";
import { tiktokSyncStatus, type TiktokSnapshot } from "./tiktok-sync-status";

export class TiktokSyncError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

export async function fetchTiktokWorkbook(fetcher: typeof fetch = fetch): Promise<Buffer> {
  const response = await fetcher(`https://docs.google.com/spreadsheets/d/${tiktokSpreadsheetId}/export?format=xlsx`, {
    cache: "no-store", signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("spreadsheetml.sheet") || !response.body) {
    throw new TiktokSyncError("Google 表格读取失败或链接读取权限已关闭。已有数据保留；请检查表格权限后重试。", 502);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new TiktokSyncError("源表超过 5 MB，本次未更新数据。", 413); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function syncTiktokSheet(supabase: SupabaseClient, fetcher: typeof fetch = fetch) {
  const { data: bucket, error: bucketError } = await supabase.storage.getBucket(tiktokBucket);
  if (!bucket) {
    if (bucketError && !/not found/i.test(bucketError.message)) throw new TiktokSyncError("无法读取 TT 保存空间，已有数据未改变。");
    const { error } = await supabase.storage.createBucket(tiktokBucket, { public: false, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ["application/json"] });
    if (error && !/already exists/i.test(error.message)) throw new TiktokSyncError("无法创建 TT 私有保存空间，请检查网站数据库权限。");
  } else if (bucket.public) {
    throw new TiktokSyncError("TT 保存空间不是私有状态，本次未同步。请联系管理员。");
  }
  const storage = supabase.storage.from(tiktokBucket);
  const runId = randomUUID();
  // Storage INSERT is exclusive across server instances. Never auto-break an active lock.
  const { error: lockError } = await storage.upload("sync-lock.json", JSON.stringify({ runId, startedAt: new Date().toISOString() }), { contentType: "application/json", upsert: false, cacheControl: "0" });
  if (lockError) throw new TiktokSyncError("已有同步正在进行，请稍后查看同步结果。若持续显示此消息，请联系管理员检查上一次同步。", 409);
  try {
    const previous = await loadTiktokDataset(supabase);
    const imported = await parseTiktokWorkbook(await fetchTiktokWorkbook(fetcher), getCurrentMonthValue());
    const merged = mergeTiktokImport(previous.rows, imported);
    const snapshot: TiktokSnapshot = {
      version: 1, spreadsheetId: tiktokSpreadsheetId,
      syncedAt: new Date().toISOString(), months: imported.months,
      emptyMonths: imported.emptyMonths, issues: imported.issues, ...merged,
    };
    const options = { contentType: "application/json", cacheControl: "0" };
    const { error: backupError } = await storage.upload(`history/${runId}-before.json`, JSON.stringify(previous.snapshot ?? { version: 1, spreadsheetId: tiktokSpreadsheetId, rows: previous.rows }), options);
    if (backupError) throw new TiktokSyncError("同步前备份失败，本次未更新数据。");
    const { error: archiveError } = await storage.upload(`history/${runId}.json`, JSON.stringify(snapshot), options);
    if (archiveError) throw new TiktokSyncError("同步记录保存失败，本次未更新数据。");
    // Only this final atomic object replacement changes the live dataset.
    const { error } = await storage.upload(tiktokSnapshotPath, JSON.stringify(snapshot), { ...options, upsert: true });
    if (error) throw new TiktokSyncError("同步结果尚未确认，请刷新同步状态后再试；不会重复累计数据。");
    return tiktokSyncStatus(snapshot);
  } finally {
    await storage.remove(["sync-lock.json"]);
  }
}
