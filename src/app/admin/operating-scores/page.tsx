import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { buildMonthOptions, getCurrentMonthValue } from "@/lib/month-options";
import { operatingStartMonth, validOperatingMonth } from "@/lib/operating-score";
import { loadOperatingWorkspace } from "@/lib/operating-store";
import OperatingScoreBoard from "./OperatingScoreBoard";

export const dynamic = "force-dynamic";
export default async function OperatingScoresPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  if (!(await getAdminSession())) redirect("/admin/login");
  const { month: requested } = await searchParams;
  const current = getCurrentMonthValue();
  const previous = new Date(`${current}-01T00:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const fallback = previous.toISOString().slice(0, 7) < operatingStartMonth ? operatingStartMonth : previous.toISOString().slice(0, 7);
  const month = requested && validOperatingMonth(requested) && requested <= current ? requested : fallback;
  const months = buildMonthOptions([operatingStartMonth, current], { includeFutureMonths: false, maxMonth: current }).filter((item) => item.value >= operatingStartMonth);
  let workspace: Awaited<ReturnType<typeof loadOperatingWorkspace>> | undefined;
  let error = "";
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("数据库连接尚未配置，请联系管理员。");
    workspace = await loadOperatingWorkspace(createSupabaseServerClient(url, undefined, key), month);
  } catch (e) { error = e instanceof Error ? e.message : "评分资料暂时无法读取，原记录保留。"; }
  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
    <div className="mx-auto max-w-7xl">
      <nav className="mb-6 flex flex-wrap gap-5 text-sm text-slate-400">
        <Link href="/admin">返回管理员后台</Link>
        <Link href={`/admin/team-scores?month=${month}`}>内容激励评分 · コンテンツ奨励</Link>
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-700 pb-5">
        <div><h1 className="text-2xl font-bold">運営方針评分</h1>
          <p className="mt-2 text-sm text-slate-300">チーム運営・コンテンツ活動の評価基準</p>
          <p className="mt-2 text-xs text-slate-400">2026年10月起 · 100点 · S ≥90 / A ≥85 / B ≥75 / C ≥65 / D &lt;65</p></div>
        <form action="/admin/operating-scores" className="flex max-w-full items-center gap-3">
          <label htmlFor="operating-month" className="shrink-0 text-sm">评分月份</label>
          <select id="operating-month" name="month" defaultValue={month} className="min-w-0 rounded border border-slate-600 bg-slate-900 px-3 py-2">
            {months.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
          <button className="shrink-0 rounded bg-white px-4 py-2 text-sm font-semibold text-slate-950">查看</button>
        </form>
      </header>
      {error && <p role="alert" className="mt-5 rounded border border-red-700 bg-red-950/40 p-4 text-red-200">{error}</p>}
      {workspace && <OperatingScoreBoard key={month} month={month} results={workspace.results} reviews={workspace.reviews} hashes={workspace.hashes} />}
    </div>
  </main>;
}
