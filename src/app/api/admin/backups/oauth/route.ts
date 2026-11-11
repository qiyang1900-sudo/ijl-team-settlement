import { cookies } from "next/headers";
import { getAdminSession } from "@/lib/admin-auth";
import { BACKUP_FOLDER_ID, BACKUP_REDIRECT, backupDatabase, backupOAuth, openBackupSecret, sealBackupSecret } from "@/lib/monthly-drive-backup";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!(await getAdminSession())) return Response.json({ error: "请重新登录管理员账号。" }, { status: 401 });
  const jar = await cookies();
  const cookie = jar.get("backup_oauth")?.value;
  jar.set("backup_oauth", "", { maxAge: 0, path: "/api/admin/backups/oauth", secure: true, httpOnly: true, sameSite: "lax" });
  let result = "failed";
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (!cookie || !code || url.searchParams.has("error")) throw new Error("Cancelled");
    const pending = JSON.parse(openBackupSecret(cookie));
    if (pending.state !== url.searchParams.get("state") || pending.expires < Date.now()) throw new Error("Invalid state");
    const { tokens } = await backupOAuth().getToken({ code, codeVerifier: pending.codeVerifier, redirect_uri: BACKUP_REDIRECT });
    if (!tokens.refresh_token) throw new Error("No offline grant");
    const { error } = await backupDatabase().from("monthly_drive_backup_config").upsert({ id: true, folder_id: BACKUP_FOLDER_ID, refresh_token_encrypted: sealBackupSecret(tokens.refresh_token), enabled: false, connected_at: new Date().toISOString(), last_error: null });
    if (error) throw new Error("Could not persist grant");
    result = "connected";
  } catch { /* Never expose provider responses, codes or tokens in the browser. */ }
  return Response.redirect(`https://team-settlement-system.vercel.app/admin/backups?authorization=${result}`, 303);
}
