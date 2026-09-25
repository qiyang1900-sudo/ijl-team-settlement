import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { readTiktokSnapshot } from "@/lib/tiktok-dataset";
import { syncTiktokSheet, TiktokSyncError } from "@/lib/tiktok-sheet-sync";
import { tiktokSyncStatus } from "@/lib/tiktok-sync-status";

export const runtime = "nodejs";
export const maxDuration = 120;
const headers = { "Cache-Control": "no-store" };

async function handle(request: Request, write: boolean) {
  if (!(await getAdminSession())) return Response.json({ error: "管理员登录已过期，请重新登录。" }, { status: 401, headers });
  if (write && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "不允许跨站请求。" }, { status: 403, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "网站数据库尚未配置。" }, { status: 503, headers });
  try {
    const supabase = createSupabaseServerClient(url, undefined, key);
    const status = write ? await syncTiktokSheet(supabase) : tiktokSyncStatus(await readTiktokSnapshot(supabase));
    if (write) {
      for (const path of ["/admin", "/admin/dashboard", "/admin/league-summary", "/admin/team-scores"]) revalidatePath(path);
      revalidatePath("/admin/teams/[teamId]", "page");
    }
    return Response.json(status, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "同步失败，已有数据保留。" }, { status: error instanceof TiktokSyncError ? error.status : 500, headers });
  }
}

export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
