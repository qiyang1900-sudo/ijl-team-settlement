import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { incentiveStartMonth } from "@/lib/incentive-score";
import { buildMonthOptions, getCurrentMonthValue } from "@/lib/month-options";
import IncentiveScoresPage from "./IncentiveScoresPage";

export const dynamic = "force-dynamic";

export default async function AdminTeamScoresPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  if (!(await getAdminSession())) redirect("/admin/login");
  const { month } = await searchParams;
  if (month && month < incentiveStartMonth)
    redirect(`/admin/team-scores?month=${incentiveStartMonth}`);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">内容激励评分 · コンテンツ奨励</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
  const currentMonth = getCurrentMonthValue();
  const { data: monthRows } = await supabase
    .from("monthly_data_submissions")
    .select("target_month")
    .eq("status", "approved")
    .gte("target_month", incentiveStartMonth)
    .lte("target_month", currentMonth)
    .order("target_month", { ascending: true });
  const availableMonths = (monthRows || []).map((row) => String(row.target_month || ""));
  const monthOptions = buildMonthOptions([incentiveStartMonth, ...availableMonths], {
    includeFutureMonths: false,
    maxMonth: currentMonth,
  }).filter((item) => item.value >= incentiveStartMonth);
  const latestApprovedMonth = availableMonths
    .filter((value) => value >= incentiveStartMonth && value <= currentMonth)
    .sort()
    .at(-1);
  const selectedMonth =
    month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month >= incentiveStartMonth && month <= currentMonth
      ? month
      : latestApprovedMonth || currentMonth;

  return <IncentiveScoresPage supabase={supabase} month={selectedMonth} months={monthOptions} />;
}
