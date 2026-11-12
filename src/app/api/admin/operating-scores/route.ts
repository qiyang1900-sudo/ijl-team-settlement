import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadOperatingWorkspace } from "@/lib/operating-store";
import { calculateOperatingTeam, normalizeOperatingInputs, operatingRuleVersion, validOperatingMonth } from "@/lib/operating-score";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  if (!(await getAdminSession())) return Response.json({ error: "管理员登录已过期，请重新登录。" }, { status: 401, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "不允许跨站请求。" }, { status: 403, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "数据库环境未配置。" }, { status: 503, headers });
  try {
    const raw = await request.text();
    if (raw.length > 20000) throw new Error("提交内容过大。");
    const body = JSON.parse(raw);
    const month = String(body.month ?? ""), teamId = String(body.teamId ?? "");
    if (!validOperatingMonth(month)) throw new Error("運営方針评分仅计算2026年10月及之后的数据。");
    if (!["draft", "reviewed"].includes(body.status)) throw new Error("评分状态不正确。");
    const inputs = normalizeOperatingInputs(body.inputs);
    const supabase = createSupabaseServerClient(url, undefined, key);
    const workspace = await loadOperatingWorkspace(supabase, month);
    const team = workspace.context.teams.find((item) => item.id === teamId);
    const result = team ? calculateOperatingTeam(team, workspace.context, inputs) : null;
    if (!team || !result?.hasSubmittedData) throw new Error("该队本月尚未提交月数据，不能保存评分。");
    const existing = workspace.reviews.find((item) => item.team_id === teamId);
    if (workspace.hashes[teamId] !== body.sourceHash) return Response.json({ error: "月数据或TT投稿数据已变化，请刷新后重新复核；未覆盖已保存分数。" }, { status: 409, headers });
    if ((existing?.updated_at ?? null) !== (body.reviewVersion ?? null)) return Response.json({ error: "另一页面已保存评分，请刷新后重试；未覆盖对方修改。" }, { status: 409, headers });
    if (body.status === "reviewed" && body.confirmed !== true) throw new Error("请先确认已核对评分及人工判断项目。");
    const record = { team_id: teamId, target_month: month, status: body.status, rule_version: operatingRuleVersion,
      inputs, source_hash: workspace.hashes[teamId], result, updated_at: new Date().toISOString() };
    const query = existing ? supabase.from("team_operating_reviews").update(record).eq("team_id", teamId)
      .eq("target_month", month).eq("updated_at", existing.updated_at) : supabase.from("team_operating_reviews").insert(record);
    const { data, error } = await query.select("updated_at").maybeSingle();
    if (error?.code === "23505" || (!error && !data)) return Response.json({ error: "评分已被另一页面保存，请刷新后重试。" }, { status: 409, headers });
    if (error) throw new Error(`保存失败：${error.message}`);
    revalidatePath("/admin/operating-scores");
    return Response.json({ success: true, reviewVersion: data?.updated_at, message: body.status === "reviewed" ? "复核已确认，本月分数和评级已保存。" : "评分草稿已保存。" }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存失败，原记录保留。" }, { status: 400, headers });
  }
}
