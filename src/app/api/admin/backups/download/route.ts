import { getAdminSession } from "@/lib/admin-auth";
import { createMonthlyBackup, tokyoBackupDate } from "@/lib/monthly-drive-backup";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!(await getAdminSession())) return Response.json({ error: "请重新登录管理员账号。" }, { status: 401, headers });
  try {
    const { bytes, md5 } = await createMonthlyBackup();
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...headers,
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="IJL-monthly-${tokyoBackupDate()}-${Date.now()}.json.gz"`,
        "Content-Length": String(bytes.length),
        "X-Backup-MD5": md5,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "备份下载失败。" }, { status: 503, headers });
  }
}
