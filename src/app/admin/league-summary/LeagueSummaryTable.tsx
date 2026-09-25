import { formatMonthlyNumber } from "@/lib/monthly-data";
import {
  leaguePeriodMetrics,
  leagueSummaryColumns,
  type LeagueMonthlySummary,
} from "@/lib/league-platform-summary";

export default function LeagueSummaryTable({ rows, summary }: {
  rows: LeagueMonthlySummary[];
  summary: LeagueMonthlySummary;
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[2900px] border-collapse bg-slate-900 text-left text-xs">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              {leagueSummaryColumns.map((column) => (
                <th key={column.key} className="whitespace-nowrap px-3 py-2" scope="col">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td className="px-3 py-5 text-slate-500" colSpan={leagueSummaryColumns.length}>暂无数据。</td></tr>
            ) : rows.map((row) => (
              <tr key={row.month} className="border-t border-slate-700">
                {leagueSummaryColumns.map((column) => {
                  const value = column.value(row);
                  return (
                    <td key={column.key} className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {value === null ? "—" : typeof value === "number" ? formatMonthlyNumber(value) : value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-700 bg-slate-900 p-5">
        <h3 className="text-sm font-semibold text-slate-300">当前期间总计算数</h3>
        <dl className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {leaguePeriodMetrics.map((metric) => {
            const value = metric.value(summary);
            return (
              <div key={metric.label}>
                <dt className="text-xs text-slate-400">{metric.label}</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums">{value === null ? "—" : formatMonthlyNumber(value)}</dd>
              </div>
            );
          })}
        </dl>
      </div>
    </>
  );
}
