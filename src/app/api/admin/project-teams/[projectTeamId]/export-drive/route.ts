import { getAdminSession } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { generateProjectReport, getApprovedReportContext, recordProjectReportExport, ReportExportError } from "@/lib/project-report-export";
import { DriveExportError, getReportDriveFolder, reserveReportDriveFile, uploadProjectReportToDrive, verifyReportDriveFolder } from "@/lib/google-drive-report";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ projectTeamId: string }> }) {
  if (!(await getAdminSession())) return Response.json({ error: "管理员登录已过期，请重新登录。", code: "admin_auth_required" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "不允许跨站请求。", code: "invalid_origin" }, { status: 403 });
  }
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~+\/-]+=*)$/)?.[1];
  if (!token || token.length > 4096) {
    return Response.json({ error: "请先连接 Google。", code: "google_auth_expired" }, { status: 401 });
  }
  try {
    const { projectTeamId } = await params;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new DriveExportError("网站数据库尚未配置。", "not_configured", 503);
    const supabase = createSupabaseServerClient(url, undefined, key);
    const context = await getApprovedReportContext(supabase, projectTeamId);
    const expectedProjectId = new URL(request.url).searchParams.get("projectId");
    if (expectedProjectId !== null && context.projectId !== expectedProjectId) {
      throw new DriveExportError("提交已不属于此项目，请刷新项目后重试。", "project_changed", 409);
    }
    const folder = getReportDriveFolder(context.teamCode);
    await verifyReportDriveFolder(token, folder.id);
    const { workbook, fileName } = await generateProjectReport(supabase, context);
    const record = await reserveReportDriveFile(supabase, projectTeamId, folder.id, token);
    const latest = await getApprovedReportContext(supabase, projectTeamId);
    if (expectedProjectId !== null && latest.projectId !== expectedProjectId) {
      throw new DriveExportError("提交所属项目已变更，本次未上传报告。", "project_changed", 409);
    }
    if (getReportDriveFolder(latest.teamCode).id !== folder.id) {
      throw new DriveExportError("提交所属战队已变更，请刷新页面后重试。", "team_changed", 409);
    }
    const result = await uploadProjectReportToDrive({ token, record, projectTeamId, fileName, workbook });
    const { error } = await supabase.from("project_report_drive_exports")
      .update({ uploaded_at: new Date().toISOString(), file_name: fileName, byte_size: workbook.length })
      .eq("project_team_id", projectTeamId).eq("file_id", result.fileId);
    let warning = error ? "文件已上传，但网站导出记录暂未保存。可重新点击导出补记，不会创建副本。" : "";
    try { await recordProjectReportExport(supabase, projectTeamId); }
    catch { warning = "文件已上传，但网站导出时间暂未保存。可重新点击导出补记，不会创建副本。"; }
    return Response.json({ ...result, fileName, folderUrl: folder.url, warning }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const expected = error instanceof DriveExportError || error instanceof ReportExportError;
    return Response.json({
      error: expected ? error.message : "导出失败，请稍后重试。原请求书和审核状态未改变。",
      code: error instanceof DriveExportError ? error.code : "export_failed",
    }, { status: expected ? error.status : 500, headers: { "Cache-Control": "no-store" } });
  }
}
