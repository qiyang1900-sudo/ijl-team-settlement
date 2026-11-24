import "server-only";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendMonthlyReturnReminder } from "@/lib/return-reminders";

export async function applyMonthlyReviewAction(formData: FormData): Promise<boolean> {
  if (!(await getAdminSession())) throw new Error("管理员登录已过期，请重新登录。");

  const submissionId = String(formData.get("submission_id") || "");
  const actionType = String(formData.get("action_type") || "");
  const reviewKind = String(formData.get("review_kind") || "monthly");
  const returnReason = String(formData.get("return_reason") || "").trim();
  const expectedUpdatedAt = formData.get("expected_updated_at");
  if (!submissionId || !["reviewing", "approved", "returned"].includes(actionType) || !["monthly", "salary"].includes(reviewKind)) {
    throw new Error("审核操作无效，请刷新页面后重试。");
  }
  if (typeof expectedUpdatedAt !== "string") return false;

  const supabase = createSupabaseServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: current, error: readError } = await supabase.from("monthly_data_submissions")
    .select("id,status,salary_status,updated_at").eq("id", submissionId).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!current || (current.updated_at || "") !== expectedUpdatedAt) return false;

  const statusKey = reviewKind === "salary" ? "salary_status" : "status";
  const currentStatus = current[statusKey];
  if (currentStatus !== "submitted" && !(currentStatus === "reviewing" && actionType !== "reviewing")) return false;

  const now = new Date().toISOString();
  const prefix = reviewKind === "salary" ? "salary_" : "";
  const patch: Record<string, unknown> = { [statusKey]: actionType, [`${prefix}${actionType}_at`]: now, updated_at: now };
  if (actionType === "approved") patch[`${prefix}return_reason`] = null;
  if (actionType === "returned") patch[`${prefix}return_reason`] = returnReason || (reviewKind === "salary" ? "请补充工资截图后重新提交。" : "请补充月数据内容后重新提交。");

  // A withdrawal or another review must win over a stale administrator page.
  let update = supabase.from("monthly_data_submissions").update(patch).eq("id", submissionId).eq(statusKey, currentStatus);
  update = current.updated_at ? update.eq("updated_at", current.updated_at) : update.is("updated_at", null);
  const { data: saved, error } = await update.select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!saved) return false;

  revalidatePath("/admin/reviews");
  revalidatePath("/admin/reward");
  revalidatePath("/team/reward");
  if (actionType === "returned") {
    await sendMonthlyReturnReminder({ supabase, submissionId, reviewKind: reviewKind === "salary" ? "salary" : "monthly", returnReason });
  }
  return true;
}
