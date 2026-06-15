import Link from "next/link";
import { formatMonthLabel } from "@/lib/monthly-data";
import { addMonths, getCurrentMonthValue } from "@/lib/month-options";
import MonthlyImportClient from "./MonthlyImportClient";

export const dynamic = "force-dynamic";

export default function MonthlyImportPage() {
  const currentMonth = getCurrentMonthValue();
  const monthOptions = Array.from({ length: 37 }, (_, index) =>
    addMonths(currentMonth, index - 36)
  )
    .sort()
    .reverse()
    .map((value) => ({ value, label: formatMonthLabel(value) }));

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/admin/dashboard"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← 返回管理员后台
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-bold">历史月数据导入</h1>
            <p className="mt-2 text-slate-400">
              粘贴过往 X / YouTube 表格，先预览校验，再导入为已通过月数据。
            </p>
          </div>
          <Link
            href="/admin/league-summary"
            className="rounded-lg border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-white hover:text-white"
          >
            查看联盟汇总
          </Link>
        </div>

        <MonthlyImportClient
          monthOptions={monthOptions}
          defaultMonth={currentMonth}
        />
      </div>
    </main>
  );
}
