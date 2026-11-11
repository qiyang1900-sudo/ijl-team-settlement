import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getAdminSession } from "@/lib/admin-auth";
import { BACKUP_FOLDER_ID, backupDatabase, backupMissingConfig, backupOAuth, backupAccessToken, sealBackupSecret, verifyBackupFolder, runMonthlyDriveBackup } from "@/lib/monthly-drive-backup";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await getAdminSession())) return Response.json({ error: "请重新登录管理员账号。" }, { status: 401 });
  try {
    const db = backupDatabase();
    const config = await db.from("monthly_drive_backup_config").select("enabled,connected_at,last_error,last_attempt_at").eq("id", true).maybeSingle();
    const runs = await db.from("monthly_drive_backup_runs").select("run_key,status,file_id,file_name,error,created_at,completed_at").order("created_at", { ascending: false }).limit(12);
    if (config.error || runs.error) throw new Error("备份数据库尚未安装或读取失败。");
    return Response.json({ missing: backupMissingConfig(), config: config.data, runs: runs.data, folderId: BACKUP_FOLDER_ID }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "备份状态读取失败。" }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!(await getAdminSession())) return Response.json({ error: "请重新登录管理员账号。" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "不允许跨站请求。" }, { status: 403 });
  try {
    const { action } = await request.json();
    const db = backupDatabase();
    if (action === "connect") {
      const oauth = backupOAuth();
      const state = randomBytes(32).toString("base64url");
      const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();
      (await cookies()).set("backup_oauth", sealBackupSecret(JSON.stringify({ state, codeVerifier, expires: Date.now() + 600000 })), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/admin/backups/oauth" });
      const url = oauth.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: ["https://www.googleapis.com/auth/drive.file"], state, code_challenge: codeChallenge, code_challenge_method: "S256" as import("google-auth-library").CodeChallengeMethod });
      return Response.json({ url });
    }
    if (action === "folder-token") return Response.json({ token: await backupAccessToken(false), config: { clientId: process.env.GOOGLE_DRIVE_CLIENT_ID, apiKey: process.env.GOOGLE_PICKER_API_KEY, appId: process.env.GOOGLE_CLOUD_PROJECT_NUMBER } }, { headers: { "Cache-Control": "no-store" } });
    if (action === "enable") {
      await verifyBackupFolder(await backupAccessToken(false));
      const { error } = await db.from("monthly_drive_backup_config").update({ enabled: true, last_error: null }).eq("id", true);
      if (error) throw new Error("启用状态保存失败。");
      return Response.json({ message: "已启用：日本时间每月 1 日凌晨自动备份。" });
    }
    if (action === "pause") {
      const { error } = await db.from("monthly_drive_backup_config").update({ enabled: false }).eq("id", true);
      if (error) throw new Error("暂停状态保存失败。");
      return Response.json({ message: "已暂停自动备份，既有备份不受影响。" });
    }
    if (action === "run") return Response.json({ ...await runMonthlyDriveBackup(false), message: "备份已上传，文件完整性校验通过。" });
    return Response.json({ error: "未知操作。" }, { status: 400 });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "备份操作失败。" }, { status: 500 }); }
}
