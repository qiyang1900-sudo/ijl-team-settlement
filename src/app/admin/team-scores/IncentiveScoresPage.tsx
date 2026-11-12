import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthOption } from "@/lib/month-options";
import { loadIncentiveWorkspace } from "@/lib/incentive-store";
import { parseClubActivityItems } from "@/lib/club-activities";
import { legacyDesignatedSourceUrl } from "@/lib/legacy-designated";
import MonthlyContentReview from "../components/MonthlyContentReview";
import IncentiveScoreBoard from "./IncentiveScoreBoard";

export default async function IncentiveScoresPage({
  supabase,
  month,
  months,
}: {
  supabase: SupabaseClient;
  month: string;
  months: MonthOption[];
}) {
  let workspace: Awaited<ReturnType<typeof loadIncentiveWorkspace>> | undefined;
  let errorMessage = "";
  try {
    workspace = await loadIncentiveWorkspace(supabase, month);
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "评分数据读取失败。";
  }
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-7 text-white sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1680px]">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft size={16} />
          返回管理员后台
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-5 py-7">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">战队积分计算</h1>
            <p className="mt-3 text-sm text-slate-400">
              A＋B＋C 排名须 A ≥ 45 · D 仅需当月月数据审核通过，不受 A 分数及排名限制
            </p>
          </div>
          <form action="/admin/team-scores" className="flex items-center gap-3">
            <label htmlFor="score-month" className="text-sm text-slate-300">
              查看月份
            </label>
            <select
              id="score-month"
              name="month"
              defaultValue={month}
              className="min-w-0 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
            >
              {months.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-950">
              查看
            </button>
          </form>
        </header>
        <p className="mb-5 text-sm text-slate-400">
          计分及奖金自 2026 年 7 月起，之前的历史数据保留。
          {month < "2026-10"
            ? "7～9 月指定视频依据旧 Google 表格与网站记录去重合并，缺月份的记录暂不新增计入。"
            : "指定视频及人气实绩读取月数据第二页。"}
        </p>
        {!workspace ? (
          <div
            role="alert"
            className="border-y border-rose-800 py-5 text-rose-300"
          >
            <h2 className="font-bold">新制度评分暂时无法读取</h2>
            <p className="mt-2 break-words text-sm">{errorMessage}</p>
            <p className="mt-2 text-sm">
              未改写任何已保存分数。请检查数据库迁移或数据来源后重试。
            </p>
          </div>
        ) : (
          <IncentiveScoreBoard
            result={workspace.result}
            reviews={workspace.reviews}
            hashes={workspace.hashes}
            rankingHash={workspace.rankingHash}
            sourceHash={workspace.sourceHash}
            snapshot={workspace.snapshot}
            legacy={workspace.legacy}
            evidence={Object.fromEntries(
              workspace.context.teams.map((team) => {
                const submission = workspace?.context.submissions.find(
                  (row) =>
                    row.team_id === team.id && row.target_month === month,
                );
                const activities = parseClubActivityItems({
                  link: submission?.club_activity_link,
                });
                return [
                  team.id,
                  <div key={team.id} className="space-y-5">
                    {workspace?.context.designatedSources?.filter((source) => source.team === team.short_name).map((source) => (
                      <details key={source.sheetId} className="border-t border-slate-700 pt-3 text-sm">
                        <summary className="cursor-pointer text-sky-300">
                          旧表指定视频 · {source.sheetName}
                        </summary>
                        <a href={legacyDesignatedSourceUrl(source)} target="_blank" rel="noreferrer" className="my-3 inline-block text-sky-300 underline">
                          查看来源表格
                        </a>
                        {source.entries.length ? (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] text-left text-xs">
                              <thead className="text-slate-400"><tr><th className="py-2">行</th><th>视频内容</th><th>月份／日期</th><th>分类</th></tr></thead>
                              <tbody>{source.entries.map((entry) => (
                                <tr key={entry.row} className="border-t border-slate-800">
                                  <td className="py-2 pr-3">{entry.row}</td>
                                  <td className="max-w-sm py-2 pr-4"><a href={entry.url} target="_blank" rel="noreferrer" className="break-words text-sky-300 underline">{entry.title}</a></td>
                                  <td className="whitespace-nowrap pr-4">{entry.month ? entry.publishedOn : "月份待确认，未计入"}</td>
                                  <td>{entry.platform === "youtube_short" ? "Shorts" : entry.platform === "youtube_live" ? "长视频（已确认直播计入）" : "长视频"}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        ) : <p className="text-slate-400">此页没有可确定为本月的指定视频，网站已有记录保留。</p>}
                      </details>
                    ))}
                    <MonthlyContentReview
                      value={submission?.content_entries}
                      skipped={submission?.content_skipped}
                    />
                    {activities
                      .filter((item) => item.popular)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="border-t border-slate-700 pt-3 text-sm"
                        >
                          <p>
                            {item.activityDate} · {item.popularKind} ·{" "}
                            {item.audienceCount} 人
                          </p>
                          {/^https?:\/\//i.test(item.link) && (
                            <a
                              className="mt-1 block break-all text-sky-300 underline"
                              href={item.link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              活动凭证
                            </a>
                          )}
                          {/^https?:\/\//i.test(item.imageUrl) && (
                            <a
                              className="mt-1 block text-sky-300 underline"
                              href={item.imageUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              活动截图
                            </a>
                          )}
                        </div>
                      ))}
                  </div>,
                ];
              }),
            )}
          />
        )}
      </div>
    </main>
  );
}
