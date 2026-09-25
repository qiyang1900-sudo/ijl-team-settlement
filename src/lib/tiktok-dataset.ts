import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tiktokMonthlyRows } from "./tiktok-monthly-data";
import type { TiktokSnapshot } from "./tiktok-sync-status";

export const tiktokBucket = "tiktok-sync";
export const tiktokSnapshotPath = "current.json";

function missing(error: { message?: string; statusCode?: string } | null) {
  return error?.statusCode === "404" || /^(?:Object|Bucket) not found$/i.test(error?.message || "");
}

export async function readTiktokSnapshot(supabase: SupabaseClient): Promise<TiktokSnapshot | null> {
  const { data, error } = await supabase.storage.from(tiktokBucket).download(tiktokSnapshotPath);
  if (error) {
    if (missing(error)) return null;
    throw new Error("TT 同步数据暂时无法读取，请稍后重试。未改动数据。");
  }
  const value = JSON.parse(await data.text()) as TiktokSnapshot;
  if (value.version !== 1 || !Array.isArray(value.rows) || !value.syncedAt) throw new Error("TT 同步记录格式异常，请联系管理员。");
  return value;
}

export async function loadTiktokDataset(supabase: SupabaseClient) {
  const snapshot = await readTiktokSnapshot(supabase);
  return { rows: snapshot?.rows ?? tiktokMonthlyRows, snapshot };
}
