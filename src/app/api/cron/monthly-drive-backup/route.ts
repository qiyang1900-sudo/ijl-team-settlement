import { timingSafeEqual } from "node:crypto";
import { backupDatabase, runMonthlyDriveBackup } from "@/lib/monthly-drive-backup";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json(await runMonthlyDriveBackup(true)); }
  catch (error) {
    const message = error instanceof Error ? error.message : "备份失败";
    try { await backupDatabase().from("monthly_drive_backup_config").update({ last_error: message, last_attempt_at: new Date().toISOString() }).eq("id", true); } catch { /* Keep a failure response so the scheduler also records it. */ }
    return Response.json({ error: message }, { status: 500 });
  }
}
