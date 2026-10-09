import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthOption } from "@/lib/month-options";
import { loadIncentiveWorkspace } from "@/lib/incentive-store";
import { parseClubActivityItems } from "@/lib/club-activities";
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
              新制度 · A＋B＋C · A ≥ 45 参评 · D 单独计奖
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
          计分自 2026 年 5 月起；前五名与 D 奖金自 7 月起。
          {month < "2026-10"
            ? "本月指定视频及人气实绩可依据原 Google 表格补录复核。"
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
