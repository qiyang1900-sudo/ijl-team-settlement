import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  assertIncentiveFinalizable,
  loadIncentiveWorkspace,
} from "@/lib/incentive-store";
import {
  buildIncentiveMonth,
  incentiveRuleVersion,
  incentiveStartMonth,
  normalizeIncentiveReview,
  type IncentiveReview,
} from "@/lib/incentive-score";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!(await getAdminSession()))
    return Response.json(
      { error: "管理员登录已过期，请重新登录。" },
      { status: 401, headers },
    );
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "不允许跨站请求。" },
      { status: 403, headers },
    );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return Response.json(
      { error: "数据库环境未配置。" },
      { status: 503, headers },
    );
  try {
    const raw = await request.text();
    if (raw.length > 200000) throw new Error("提交内容过大。");
    const body = JSON.parse(raw);
    const month = String(body.month || "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < incentiveStartMonth)
      throw new Error("新版评分从 2026 年 5 月开始。");
    const supabase = createSupabaseServerClient(url, undefined, key);
    const workspace = await loadIncentiveWorkspace(supabase, month);
    let reviewVersion: string | undefined;
    if (body.action === "save") {
      const teamId = String(body.teamId || "");
      const team = workspace.result.teams.find(
        (team) => team.teamId === teamId,
      );
      if (!team?.hasApprovedData)
        throw new Error("该队没有本月审核通过的月数据，不能保存评分。");
      if (body.sourceHash !== workspace.hashes[teamId])
        return Response.json(
          { error: "月数据或 TT 数据已变化，请载入最新资料后重新复核。" },
          { status: 409, headers },
        );
      const existing = workspace.reviews.find(
        (review) => review.team_id === teamId,
      );
      if ((body.reviewVersion || null) !== (existing?.updated_at || null))
        return Response.json(
          { error: "该队的评分已被其他页面修改，请刷新后重试。" },
          { status: 409, headers },
        );
      const inputs = normalizeIncentiveReview(body.inputs);
      if (
        Object.keys(inputs.individuals).some(
          (id) => !team.members.some((member) => member.id === id),
        )
      )
        throw new Error("个人补录中包含非本月名单成员。");
      const status = body.reviewed === true ? "reviewed" : "draft";
      if (status === "reviewed" && body.confirmed !== true)
        throw new Error("请先确认已人工核对视频、活动及补录数据。");
      if (
        (Object.keys(inputs.overrides).length ||
          Object.keys(inputs.individuals).length) &&
        !inputs.note
      )
        throw new Error("有人工补录或修正时，请填写审核备注和数据来源。");
      const record: IncentiveReview = {
        team_id: teamId,
        target_month: month,
        status,
        inputs,
        source_hash: workspace.hashes[teamId],
        updated_at: new Date().toISOString(),
      };
      if (status === "reviewed") {
        const recalculated = buildIncentiveMonth(workspace.context, [
          ...workspace.reviews.filter((review) => review.team_id !== teamId),
          record,
        ]).teams.find((row) => row.teamId === teamId)!;
        if (recalculated.missing.length)
          throw new Error(
            `尚不能确认复核，请先补齐：${recalculated.missing.join("、")}。可先保存草稿。`,
          );
      }
      const query = existing
        ? supabase
            .from("team_incentive_reviews")
            .update(record)
            .eq("team_id", teamId)
            .eq("target_month", month)
            .eq("updated_at", existing.updated_at)
        : supabase.from("team_incentive_reviews").insert(record);
      const { data, error } = await query.select("team_id").maybeSingle();
      if (error) throw new Error(`保存失败：${error.message}`);
      if (!data)
        throw new Error(
          "评分已被另一页面更新，未覆盖对方的数据，请刷新后重试。",
        );
      reviewVersion = record.updated_at;
    } else if (body.action === "finalize") {
      if (body.confirmed !== true)
        throw new Error("请确认本月参评范围和奖金后再保存结算。");
      if (body.sourceHash !== workspace.sourceHash)
        return Response.json(
          { error: "本月数据或复核结果已变化，请刷新后重新确认排名。" },
          { status: 409, headers },
        );
      assertIncentiveFinalizable(workspace);
      const record = {
        target_month: month,
        rule_version: incentiveRuleVersion,
        source_hash: workspace.sourceHash,
        result: workspace.result,
        reviews: workspace.reviews,
      };
      const { error } = await supabase
        .from("monthly_incentive_results")
        .upsert(record, {
          onConflict: "target_month,source_hash",
          ignoreDuplicates: true,
        });
      if (error) throw new Error(`结算保存失败：${error.message}`);
    } else throw new Error("未知的评分操作。");
    revalidatePath("/admin/team-scores");
    return Response.json(
      {
        success: true,
        reviewVersion,
        message:
          body.action === "finalize"
            ? "本月结算已保存，先前快照保留。"
            : body.reviewed
              ? "本队人工复核已确认。"
              : "评分草稿已保存。",
      },
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "评分操作失败，原有结果保留。",
      },
      { status: 400, headers },
    );
  }
}
