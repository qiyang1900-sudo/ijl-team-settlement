"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { TiktokSyncStatus } from "@/lib/tiktok-sync-status";

export default function TiktokSyncButton() {
  const router = useRouter();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<TiktokSyncStatus | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/tiktok-sync", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "无法读取同步状态。");
        setStatus(data);
      }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);

  async function sync() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(""); setDone(false);
    try {
      const response = await fetch("/api/admin/tiktok-sync", { method: "POST", signal: AbortSignal.timeout(130_000) });
      const data = await response.json().catch(() => ({ error: "未收到完整结果，请刷新页面查看最后同步时间。" }));
      if (!response.ok) throw new Error(data.error || "同步失败，已有数据保留。");
      setStatus(data); setDone(true); router.refresh();
    } catch (error) {
      setError(error instanceof Error && error.name !== "TimeoutError" && error.name !== "TypeError" ? error.message : "连接中断或等待超时，请刷新页面查看最后同步时间；重复同步不会重复计数。");
    } finally { busyRef.current = false; setBusy(false); }
  }

  return (
    <section aria-label="TikTok 数据同步" className="mt-6 border-y border-slate-200 py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold">TikTok 数据</h2>
          <p className="mt-1 text-sm text-slate-600">{status?.syncedAt ? `最后同步：${new Date(status.syncedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false })}（日本时间）` : "尚未从 Google 表格同步"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <a className="text-sm text-sky-700 underline" href="https://docs.google.com/spreadsheets/d/17TXWAXGOKqJis0WgxVh-2ayU5d2-Wi5m6TA5-pdzkjw/edit" target="_blank" rel="noreferrer">打开源表格</a>
          <button type="button" disabled={busy} onClick={sync} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60">
            <RefreshCw size={17} aria-hidden className={busy ? "animate-spin" : ""} />
            {busy ? "正在读取并同步…" : "同步 TikTok 数据"}
          </button>
        </div>
      </div>
      <div aria-live="polite" className="text-sm">
        {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
        {done && status && <p className="mt-3 text-emerald-700">同步完成：新增 {status.added} 条，更新 {status.updated} 条，未变化 {status.unchanged} 条。</p>}
        {status?.syncedAt && <p className="mt-2 text-slate-600">已读取月份：{status.months.join("、")}</p>}
        {!!status?.emptyMonths.length && <p className="mt-2 text-slate-600">空月份未导入：{status.emptyMonths.join("、")}</p>}
      </div>
      {!!status?.issues.length && <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-amber-800">异常明细（{status.issues.length} 行已跳过，已有数据保留）</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[660px] text-left">
            <thead className="sticky top-0 bg-slate-100"><tr>{["月份", "来源行", "战队 / 账号", "原因"].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
            <tbody>{status.issues.map((issue, index) => <tr key={index} className="border-t border-slate-200"><td className="whitespace-nowrap p-2">{issue.month}</td><td className="whitespace-nowrap p-2">{issue.sheet}!{issue.row}</td><td className="break-all p-2">{issue.team} / {issue.account}</td><td className="p-2">{issue.reason}</td></tr>)}</tbody>
          </table>
        </div>
      </details>}
    </section>
  );
}
