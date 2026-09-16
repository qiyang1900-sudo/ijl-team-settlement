import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  generateProjectReport,
  getApprovedReportContext,
  recordProjectReportExport,
  ReportExportError,
} from "@/lib/project-report-export";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectTeamId: string }> }
) {
  const { projectTeamId } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new Response("Supabase環境変数が設定されていません。", { status: 500 });
  }
  try {
    const supabase = createSupabaseServerClient(url, undefined, key);
    const context = await getApprovedReportContext(supabase, projectTeamId);
    const { workbook, fileName } = await generateProjectReport(supabase, context);
    await recordProjectReportExport(supabase, projectTeamId);
    return new Response(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return new Response(
      error instanceof ReportExportError ? error.message : "Excel 出力に失敗しました。再度お試しください。",
      { status: error instanceof ReportExportError ? error.status : 500 }
    );
  }
}
