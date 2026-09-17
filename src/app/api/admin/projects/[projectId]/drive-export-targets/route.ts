import { getAdminSession } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getInvoiceUploadFolderId } from "@/lib/invoice-upload-links";
import { isApprovedLike } from "@/lib/status-labels";
import type { DriveExportTarget } from "@/lib/project-drive-batch";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!(await getAdminSession())) return reply({ error: "管理员登录已过期，请重新登录。" }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return reply({ error: "网站数据库尚未配置。" }, 503);
  try {
    const { projectId } = await params;
    const supabase = createSupabaseServerClient(url, undefined, key);
    const { data: project, error: projectError } = await supabase.from("projects").select("id").eq("id", projectId).single();
    if (projectError || !project) return reply({ error: "项目读取失败，请刷新页面后重试。" }, 404);
    const { data, error } = await supabase.from("project_teams")
      .select("id,status,teams(name,short_name)").eq("project_id", projectId).order("created_at", { ascending: true });
    if (error || !data) return reply({ error: "参与战队读取失败，本次未开始导出。" }, 503);
    const targets: DriveExportTarget[] = data.map((row) => {
      const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
      return {
        projectTeamId: row.id, teamName: team?.short_name || team?.name || "未知战队",
        status: String(row.status || ""), eligible: isApprovedLike(row.status),
        folderId: getInvoiceUploadFolderId(team?.short_name || team?.name),
      };
    });
    return reply({ targets });
  } catch { return reply({ error: "项目导出列表读取失败，请稍后重试。" }, 503); }
}
