"use client";

import { useState } from "react";
import {
  formatMonthlyNumber,
} from "@/lib/monthly-data";
import {
  MonthlySummary,
  formatMonthlyPercent,
} from "@/lib/monthly-summary";
import MonthlyComboChart from "../../components/MonthlyComboChart";

type TeamMonthlyDataTabsProps = {
  selectedSummary: MonthlySummary | null;
  monthlyStats: MonthlySummary[];
};

export default function TeamMonthlyDataTabs({
  selectedSummary,
  monthlyStats,
}: TeamMonthlyDataTabsProps) {
  const [view, setView] = useState<"x" | "youtube">("x");

  return (
    <>
      <div className="mt-5 inline-flex overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-1 text-sm">
        <button
          type="button"
          onClick={() => setView("x")}
          className={`rounded-md px-4 py-2 font-semibold ${
            view === "x"
              ? "bg-cyan-400 text-slate-950"
              : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          X
        </button>
        <button
          type="button"
          onClick={() => setView("youtube")}
          className={`rounded-md px-4 py-2 font-semibold ${
            view === "youtube"
              ? "bg-red-300 text-slate-950"
              : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          YouTube
        </button>
      </div>

      {selectedSummary ? (
        view === "x" ? (
          <XTotalPanel summary={selectedSummary} />
        ) : (
          <YoutubeTotalPanel summary={selectedSummary} />
        )
      ) : (
        <p className="mt-5 text-sm text-slate-500">暂无已通过月数据。</p>
      )}

      {view === "x" ? (
        <section className="mt-6 grid gap-4 xl:grid-cols-2">
          <MonthlyComboChart
            title="IJL联盟战队推特数据推移"
            barLabel="互动量"
            lineLabel="阅读量"
            barColor="#7e57c2"
            lineColor="#f4b400"
            points={monthlyStats.map((row) => ({
              label: shortMonthLabel(row.month),
              barValue: row.total.xEngagements,
              lineValue: row.total.xImpressions,
            }))}
          />
          <MonthlyComboChart
            title="IJL联盟战队推特粉丝数推移"
            lineLabel="粉丝数"
            lineColor="#f4b400"
            points={monthlyStats.map((row) => ({
              label: shortMonthLabel(row.month),
              lineValue: row.total.xFollowerCount,
            }))}
          />
        </section>
      ) : (
        <section className="mt-6 grid gap-4 xl:grid-cols-2">
          <MonthlyComboChart
            title="IJL联盟Youtube投稿数据"
            barLabel="视频播放次数"
            lineLabel="登録者数"
            barColor="#ef4444"
            lineColor="#3b82f6"
            points={monthlyStats.map((row) => ({
              label: shortMonthLabel(row.month),
              barValue: row.total.youtubeVideoViews,
              lineValue: row.total.youtubeSubscriberCount,
            }))}
          />
          <MonthlyComboChart
            title="IJL联盟 Shorts / TikTok 短视频数据"
            barLabel="短视频播放"
            lineLabel="短视频投稿"
            barColor="#f97316"
            lineColor="#22c55e"
            points={monthlyStats.map((row) => ({
              label: shortMonthLabel(row.month),
              barValue: row.total.youtubeShortViews,
              lineValue: row.total.youtubeShortPostCount,
            }))}
          />
          <MonthlyComboChart
            title="IJL联盟Youtube直播数据"
            barLabel="直播观看"
            lineLabel="直播次数"
            barColor="#3b82f6"
            lineColor="#ef4444"
            points={monthlyStats.map((row) => ({
              label: shortMonthLabel(row.month),
              barValue: row.total.youtubeStreamViews,
              lineValue: row.total.youtubeStreamCount,
            }))}
          />
        </section>
      )}
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-950 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-100">{value}</p>
    </div>
  );
}

function XTotalPanel({ summary }: { summary: MonthlySummary }) {
  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-slate-700">
      <div className="grid gap-3 bg-slate-950 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <MiniStat label="推文条数" value={formatMonthlyNumber(summary.total.xTweetCount)} />
        <MiniStat label="阅读量" value={formatMonthlyNumber(summary.total.xImpressions)} />
        <MiniStat label="互动量" value={formatMonthlyNumber(summary.total.xEngagements)} />
        <MiniStat label="ファンイベント" value={formatMonthlyNumber(summary.total.xFanEventCount)} />
        <MiniStat label="互动率" value={formatMonthlyPercent(summary.total.xEngagementRate)} />
        <MiniStat label="粉丝数" value={formatMonthlyNumber(summary.total.xFollowerCount)} />
      </div>
      <details className="border-t border-slate-700 bg-slate-950/50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-300">
          查看期间 X 明细
        </summary>
        <MonthlyXDetailRows summary={summary} />
      </details>
    </section>
  );
}

function YoutubeTotalPanel({ summary }: { summary: MonthlySummary }) {
  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-slate-700">
      <div className="grid gap-3 bg-slate-950 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <MiniStat label="投稿数量（含短视频）" value={formatMonthlyNumber(summary.total.youtubeTotalPostCount)} />
        <MiniStat label="视频播放" value={formatMonthlyNumber(summary.total.youtubeVideoViews)} />
        <MiniStat label="短视频播放（Shorts+TT）" value={formatMonthlyNumber(summary.total.youtubeShortViews)} />
        <MiniStat label="直播观看" value={formatMonthlyNumber(summary.total.youtubeStreamViews)} />
        <MiniStat label="合計Imp" value={formatMonthlyNumber(summary.total.youtubeTotalImpressions)} />
        <MiniStat label="登録者数" value={formatMonthlyNumber(summary.total.youtubeSubscriberCount)} />
      </div>
      <details className="border-t border-slate-700 bg-slate-950/50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-300">
          查看期间 YouTube 明细
        </summary>
        <MonthlyYoutubeDetailRows summary={summary} />
      </details>
    </section>
  );
}

function MonthlyXDetailRows({ summary }: { summary: MonthlySummary }) {
  const rows = [
    ...summary.officialRows.map((row) => ({ type: "官方账号", row })),
    ...summary.playerRows.map((row) => ({ type: "选手", row })),
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left text-xs">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-4 py-2">分类</th>
            <th className="px-4 py-2">名称</th>
            <th className="px-4 py-2">推文</th>
            <th className="px-4 py-2">阅读量</th>
            <th className="px-4 py-2">互动量</th>
            <th className="px-4 py-2">ファンイベント</th>
            <th className="px-4 py-2">粉丝数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ type, row }) => (
            <tr key={`${type}-${row.id}`} className="border-t border-slate-800">
              <td className="px-4 py-2 text-slate-400">{type}</td>
              <td className="px-4 py-2 font-semibold">{row.playerName}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.xTweetCount)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.xImpressions)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.xEngagements)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.xFanEventCount)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.xFollowerCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyYoutubeDetailRows({ summary }: { summary: MonthlySummary }) {
  const rows = [
    ...summary.officialRows.map((row) => ({ type: "官方账号", row })),
    ...summary.playerRows.map((row) => ({ type: "选手", row })),
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-4 py-2">分类</th>
            <th className="px-4 py-2">名称</th>
            <th className="px-4 py-2">動画投稿</th>
            <th className="px-4 py-2">動画視聴</th>
            <th className="px-4 py-2">ショート投稿</th>
            <th className="px-4 py-2">ショート視聴</th>
            <th className="px-4 py-2">配信回数</th>
            <th className="px-4 py-2">配信視聴</th>
            <th className="px-4 py-2">いいね</th>
            <th className="px-4 py-2">合計Imp</th>
            <th className="px-4 py-2">登録者</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ type, row }) => (
            <tr key={`${type}-${row.id}`} className="border-t border-slate-800">
              <td className="px-4 py-2 text-slate-400">{type}</td>
              <td className="px-4 py-2 font-semibold">{row.playerName}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.youtubeVideoPostCount)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.youtubeVideoViews)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.youtubeShortPostCount)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.youtubeShortViews)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.youtubeStreamCount)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.youtubeStreamViews)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.youtubeLikeCount)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.youtubeTotalImpressions)}</td>
              <td className="px-4 py-2 text-slate-300">{formatMonthlyNumber(row.youtubeSubscriberCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortMonthLabel(month: string) {
  const [, monthValue] = month.split("-");
  return monthValue ? `${Number(monthValue)}月` : month;
}
