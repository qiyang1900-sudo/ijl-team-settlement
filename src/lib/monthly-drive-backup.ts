import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { OAuth2Client } from "google-auth-library";
import { createSupabaseServerClient } from "./supabase-server";
import { driveRequest } from "./google-drive-report";
import { loadTiktokDataset } from "./tiktok-dataset";

export const BACKUP_FOLDER_ID = "1ZMnCooqyGDerJ0uwdCkj47GMChU13odx";
export const BACKUP_REDIRECT = "https://team-settlement-system.vercel.app/api/admin/backups/oauth";
export const BACKUP_TABLES = [
  "teams", "league_players", "monthly_player_assignments", "monthly_data_settings",
  "monthly_data_submissions", "team_monthly_scores", "team_incentive_reviews",
  "monthly_incentive_results", "team_incentive_designated_sources", "team_operating_reviews",
  "team_operating_review_history", "submission_change_history",
] as const;

export function encodeMonthlyBackup(snapshot: Record<string, unknown>) {
  const tiktok = snapshot.tiktok as { rows?: unknown[] } | undefined;
  if (snapshot.format !== "ijl-monthly-backup-v2" || !snapshot.captured_at ||
      BACKUP_TABLES.some(table => !Array.isArray(snapshot[table])) || !Array.isArray(tiktok?.rows)) {
    throw new Error("备份范围不完整，请先安装 monthly-drive-backup-v2.sql；本次未生成不完整备份。");
  }
  const counts = Object.fromEntries(BACKUP_TABLES.map(table => [table, (snapshot[table] as unknown[]).length]));
  const manifest = { table_counts: counts, tiktok_rows: tiktok.rows.length, original_images_included: false };
  const bytes = gzipSync(Buffer.from(JSON.stringify({ ...snapshot, manifest })), { level: 9 });
  return { bytes, manifest, md5: createHash("md5").update(bytes).digest("hex") };
}

export async function createMonthlyBackup() {
  const db = backupDatabase();
  const tiktok = await loadTiktokDataset(db);
  const { data, error } = await db.rpc("monthly_backup_snapshot");
  if (error || !data) throw new Error("备份快照读取失败，请检查备份数据库安装情况。");
  return encodeMonthlyBackup({ ...data, tiktok: { captured_at: new Date().toISOString(), ...tiktok } });
}
export function backupDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("网站数据库尚未配置。");
  return createSupabaseServerClient(url, undefined, key);
}
export function backupMissingConfig() {
  return ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_BACKUP_TOKEN_KEY", "GOOGLE_PICKER_API_KEY", "GOOGLE_CLOUD_PROJECT_NUMBER", "CRON_SECRET"].filter(name => !process.env[name]);
}
export function backupOAuth() {
  if (backupMissingConfig().length) throw new Error("备份授权配置尚未完成。");
  return new OAuth2Client(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET, BACKUP_REDIRECT);
}
function tokenKey() {
  const key = Buffer.from(process.env.GOOGLE_BACKUP_TOKEN_KEY || "", "base64");
  if (key.length !== 32) throw new Error("备份授权加密配置无效。");
  return key;
}
export function sealBackupSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(item => item.toString("base64url")).join(".");
}
export function openBackupSecret(value: string) {
  const parts = value.split(".").map(item => Buffer.from(item, "base64url"));
  if (parts.length !== 3) throw new Error("备份授权已失效，请重新连接。");
  const cipher = createDecipheriv("aes-256-gcm", tokenKey(), parts[0]);
  cipher.setAuthTag(parts[1]);
  return Buffer.concat([cipher.update(parts[2]), cipher.final()]).toString("utf8");
}
export async function backupAccessToken(requireEnabled = true) {
  const { data, error } = await backupDatabase().from("monthly_drive_backup_config").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error("备份设置读取失败，请检查数据库安装情况。");
  if (!data || (requireEnabled && !data.enabled)) throw new Error("自动备份尚未启用，请先完成 Google 授权。");
  const client = backupOAuth();
  client.setCredentials({ refresh_token: openBackupSecret(data.refresh_token_encrypted) });
  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("No token");
    return token;
  } catch { throw new Error("Google 长期授权已失效，请重新连接 Google 后重试。"); }
}
export async function verifyBackupFolder(token: string) {
  const response = await driveRequest(token, `https://www.googleapis.com/drive/v3/files/${BACKUP_FOLDER_ID}?fields=id,mimeType,trashed,capabilities(canAddChildren),permissions(type,role)`);
  if (!response.ok) throw new Error("请先选择并授权“战队备份数据”文件夹。");
  const data = await response.json();
  if (data.trashed || data.mimeType !== "application/vnd.google-apps.folder" || !data.capabilities?.canAddChildren) throw new Error("备份文件夹不可写入。");
  if (!data.permissions?.length || data.permissions.some((p: {type: string; role: string}) => p.type !== "user" || p.role !== "owner")) throw new Error("备份包含工资与审核资料，目标文件夹必须仅所有者可访问。请移除额外共享后重试。");
}
export function tokyoBackupDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export async function runMonthlyDriveBackup(scheduled: boolean) {
  const date = tokyoBackupDate();
  const db = backupDatabase();
  if (scheduled) {
    const config = await db.from("monthly_drive_backup_config").select("enabled").eq("id", true).maybeSingle();
    if (config.error) throw new Error("备份设置读取失败。");
    if (!config.data?.enabled) return { skipped: true, reason: "not_enabled" };
    const previous = await db.from("monthly_drive_backup_runs").select("status,file_id").eq("run_key", `monthly-${date.slice(0,7)}`).maybeSingle();
    if (previous.error) throw new Error("备份记录读取失败。");
    if (previous.data?.status === "completed") return { alreadyCompleted: true, fileId: previous.data.file_id };
  }
  const token = await backupAccessToken(scheduled);
  await verifyBackupFolder(token);
  const runKey = scheduled ? `monthly-${date.slice(0,7)}` : `manual-${randomUUID()}`;
  const ids = await driveRequest(token, "https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files");
  const fileId = (await ids.json()).ids?.[0];
  if (typeof fileId !== "string" || !/^[\w-]+$/.test(fileId)) throw new Error("网盘未返回有效的文件编号。");
  const tiktok = await loadTiktokDataset(db);
  const { data: run, error } = await db.rpc("claim_monthly_drive_backup", { p_key: runKey, p_file_id: fileId, p_file_name: `IJL-monthly-${date}-${runKey}.json.gz`, p_tiktok: { captured_at: new Date().toISOString(), ...tiktok } });
  if (error || !run) throw new Error(error?.message || "备份快照创建失败。");
  if (run.status === "completed") return { alreadyCompleted: true, fileId: run.file_id };
  try {
    const { bytes, md5 } = encodeMonthlyBackup(run.snapshot);
    const fileUrl = `https://www.googleapis.com/drive/v3/files/${run.file_id}?fields=id,parents,trashed,md5Checksum,appProperties`;
    let result = await driveRequest(token, fileUrl);
    if (result.status === 404) {
      const start = await driveRequest(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Type": "application/gzip", "X-Upload-Content-Length": String(bytes.length) },
        body: JSON.stringify({ id: run.file_id, name: run.file_name, parents: [BACKUP_FOLDER_ID], mimeType: "application/gzip", appProperties: { ijlBackupKey: runKey } }),
      });
      if (start.status !== 409) {
        const location = start.headers.get("location");
        const upload = location ? new URL(location) : null;
        if (!start.ok || !upload || upload.protocol !== "https:" || upload.hostname !== "www.googleapis.com" || !upload.pathname.startsWith("/upload/drive/v3/files")) throw new Error("网盘未返回有效的上传地址。");
        const sent = await driveRequest(token, upload.toString(), { method: "PUT", headers: { "Content-Type": "application/gzip" }, body: new Uint8Array(bytes) });
        if (!sent.ok && sent.status !== 409) throw new Error("备份上传未完成。");
      }
      result = await driveRequest(token, fileUrl);
    }
    const file = result.ok ? await result.json() : null;
    if (!file || file.trashed || file.md5Checksum !== md5 || !file.parents?.includes(BACKUP_FOLDER_ID) || file.appProperties?.ijlBackupKey !== runKey) throw new Error("网盘备份完整性校验未通过；未覆盖任何旧文件。");
    const cleared = await db.from("monthly_drive_backup_config").update({ last_error: null, last_attempt_at: new Date().toISOString() }).eq("id", true);
    if (cleared.error) throw new Error("备份已完成，但后台状态更新失败。请刷新后核对备份记录。");
    const saved = await db.from("monthly_drive_backup_runs").update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), error: null }).eq("run_key", runKey);
    if (saved.error) throw new Error("文件已上传，备份完成记录保存失败。请检查记录后重试。");
    return { fileId: run.file_id, fileName: run.file_name };
  } catch (error) {
    await db.from("monthly_drive_backup_runs").update({ status: "failed", error: error instanceof Error ? error.message : "备份失败", updated_at: new Date().toISOString() }).eq("run_key", runKey);
    throw error;
  }
}
