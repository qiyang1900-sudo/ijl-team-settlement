import { formatMonthLabel, formatMonthlyNumber } from "@/lib/monthly-data";
import type { TeamTiktokReport, TiktokReportingMetrics } from "@/lib/tiktok-reporting";
import MonthlyComboChart from "../../components/MonthlyComboChart";

const columns: Array<{ key: keyof TiktokReportingMetrics; label: string }> = [
  { key: "postCount", label: "短视频投稿（TT）" },
  { key: "videoViews", label: "短视频播放（TT）" },
  { key: "streamViews", label: "直播观看次数（TT）" },
  { key: "streamCount", label: "直播次数（TT）" },
  { key: "followerCount", label: "TT 登録者" },
];

const displayNumber = (value: number | null) =>
  value === null ? "—" : formatMonthlyNumber(value);
const chartMonthLabel = (month: string) => `${Number(month.slice(5))}月`;

export default function TeamTiktokPanel({ report }: { report: TeamTiktokReport }) {
  return (
    <>
      {report.rows.length === 0 ? (
        <p className="mt-5 text-sm text-slate-400">该期间尚未录入 TT 数据。</p>
      ) : null}
      <section className="mt-5 overflow-hidden rounded-lg border border-slate-700">
        <dl className="grid grid-cols-2 gap-4 bg-slate-950 p-4 lg:grid-cols-5">
          {columns.map((column) => (
            <div key={column.key} className="min-w-0">
              <dt className="text-xs text-slate-400">{column.label}</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-slate-100">{displayNumber(report.total[column.key])}</dd>
            </div>
          ))}
        </dl>
        <details className="border-t border-slate-700 bg-slate-950/50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-300">查看 TT 月度汇总</summary>
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-2">月份</th>
                  {columns.map((column) => <th key={column.key} scope="col" className="px-4 py-2">{column.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {report.months.map((row) => (
                  <tr key={row.month} className="border-t border-slate-800">
                    <td className="whitespace-nowrap px-4 py-2 font-semibold">{formatMonthLabel(row.month)}</td>
                    {columns.map((column) => <td key={column.key} className="px-4 py-2 tabular-nums text-slate-300">{displayNumber(row.total[column.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <details className="border-t border-slate-700 bg-slate-950/50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-300">查看 TT 账号月度明细</summary>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-2">月份</th>
                  <th scope="col" className="px-4 py-2">分类</th>
                  <th scope="col" className="px-4 py-2">账号</th>
                  {columns.map((column) => <th key={column.key} scope="col" className="px-4 py-2">{column.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-5 text-slate-400">该期间暂无 TT 数据。</td></tr>
                ) : report.rows.map((row, index) => (
                  <tr key={`${row.month}-${row.accountName}-${index}`} className="border-t border-slate-800">
                    <td className="whitespace-nowrap px-4 py-2">{formatMonthLabel(row.month)}</td>
                    <td className="px-4 py-2 text-slate-400">{row.isOfficial ? "官方账号" : "选手"}</td>
                    <td className="px-4 py-2 font-semibold">{row.accountName}</td>
                    {columns.map((column) => <td key={column.key} className="px-4 py-2 tabular-nums text-slate-300">{displayNumber(row[column.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <MonthlyComboChart
          title="战队 TikTok 短视频数据"
          barLabel="短视频播放（TT）"
          lineLabel="短视频投稿（TT）"
          barColor="#f97316"
          lineColor="#22c55e"
          points={report.months.map((row) => ({
            label: chartMonthLabel(row.month),
            barValue: row.total.videoViews,
            lineValue: row.total.postCount,
          }))}
        />
        <MonthlyComboChart
          title="战队 TikTok 直播数据"
          barLabel="直播观看"
          lineLabel="直播次数"
          points={report.months.map((row) => ({
            label: chartMonthLabel(row.month),
            barValue: row.total.streamViews,
            lineValue: row.total.streamCount,
          }))}
        />
        <MonthlyComboChart
          title="战队 TikTok 粉丝数"
          lineLabel="TT 登録者"
          lineColor="#0d9488"
          points={report.months.map((row) => ({
            label: chartMonthLabel(row.month),
            lineValue: row.total.followerCount,
          }))}
        />
      </section>
    </>
  );
}
