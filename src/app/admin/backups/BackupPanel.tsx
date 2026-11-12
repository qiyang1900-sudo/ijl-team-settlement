"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CloudUpload, Download, Link2, Pause, FolderOpen } from "lucide-react";
import { authorizeReportFolder, loadGoogleDriveLibraries } from "@/lib/google-drive-browser";
type State = { missing: string[]; folderId: string; config: null | { enabled: boolean; connected_at: string; last_error: string | null }; runs: Array<{ run_key: string; status: string; file_id: string; error: string | null; created_at: string }> };
export default function BackupPanel({ authorization }: { authorization?: string }) {
  const [data, setData] = useState<State | null>(null);
  const [message, setMessage] = useState(authorization === "connected" ? "Google 已连接，请选择备份文件夹并启用自动备份。" : "");
  const [error, setError] = useState(authorization === "failed" ? "Google 备份授权未完成或已过期，请重新连接；原有备份未改动。" : "");
  const [busy, setBusy] = useState(false);
  async function load() { const response = await fetch("/api/admin/backups", { cache: "no-store" }); const value = await response.json(); if (!response.ok) throw new Error(value.error); return value as State; }
  useEffect(() => { let active = true; load().then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  async function action(kind: string) {
    setBusy(true); setError(""); setMessage("");
    const post = async (action: string) => { const r = await fetch("/api/admin/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); const value = await r.json(); if (!r.ok) throw new Error(value.error); return value; };
    try {
      if (kind === "enable") { await loadGoogleDriveLibraries(); const token = await post("folder-token"); await authorizeReportFolder(token.config, token.token, data!.folderId, "选择管理员专用的“战队备份数据”文件夹"); }
      const result = await post(kind);
      if (result.url) { window.location.assign(result.url); return; }
      setMessage(result.message || "已完成。"); setData(await load());
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败。"); }
    finally { setBusy(false); }
  }
  const button = "inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40";
  return <main className="min-h-screen bg-[#f6f7fb] text-slate-950"><div className="mx-auto max-w-5xl px-6 py-10">
    <Link href="/admin" className="text-sm text-slate-600">返回管理员后台</Link>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-bold">月数据备份</h1><span className="text-sm">{data?.config?.enabled ? "自动备份已启用" : "自动备份未启用"}</span></div>
    <dl className="mt-6 grid gap-4 border-y border-slate-200 py-5 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">执行时间</dt><dd className="mt-1">日本时间每月 1 日凌晨 03:00；未成功时次日补跑，首次启用后补齐当月备份。</dd></div><div><dt className="text-slate-500">目标文件夹</dt><dd className="mt-1"><a href="https://drive.google.com/drive/folders/1ZMnCooqyGDerJ0uwdCkj47GMChU13odx" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sky-700"><FolderOpen size={16}/>战队备份数据</a></dd></div><div className="sm:col-span-2"><dt className="text-slate-500">备份范围</dt><dd className="mt-1">全部月份的月数据、工资、指定视频、热门作品、活动、名册、TT 同步数据、内容激励与運営方針评分审核记录，以及月数据修改历史。包含附件链接，不包含图片文件本体。每次保留独立版本。</dd></div></dl>
    {data?.missing?.length ? <p role="alert" className="mt-4 text-sm text-amber-800">尚未配置：{data.missing.join("、")}</p> : null}
    {data?.config?.last_error && <p role="alert" className="mt-4 text-sm text-red-700">上次自动备份失败：{data.config.last_error}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-4 text-sm text-emerald-700">{message}</p>}
    <div className="my-6 flex flex-wrap gap-3"><button className={button} disabled={busy || !data || !!data.missing.length} onClick={() => action("connect")}><Link2 size={16}/>{data?.config ? "重新连接 Google" : "连接 Google"}</button><button className={button} disabled={busy || !data?.config || !!data?.missing.length} onClick={() => action(data?.config?.enabled ? "pause" : "enable")}>{data?.config?.enabled ? <Pause size={16}/> : <FolderOpen size={16}/>} {data?.config?.enabled ? "暂停自动备份" : "授权文件夹并启用"}</button><button className={`${button} bg-slate-900 text-white`} disabled={busy || !data?.config || !!data?.missing.length} onClick={() => action("run")}><CloudUpload size={16}/>{busy ? "处理中" : "立即备份到网盘"}</button><a className={button} href="/api/admin/backups/download"><Download size={16}/>下载当前备份</a></div>
    <h2 className="text-lg font-semibold">备份记录</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-3">时间（日本时间）</th><th className="p-3">状态</th><th className="p-3">结果</th></tr></thead><tbody>{data?.runs.map(run => <tr key={run.run_key} className="border-b border-slate-200"><td className="whitespace-nowrap p-3">{new Date(run.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })}</td><td className="whitespace-nowrap p-3">{run.status === "completed" ? "成功" : run.status === "failed" ? "失败" : "进行中"}</td><td className="p-3">{run.status === "completed" ? <a className="text-sky-700" href={`https://drive.google.com/file/d/${run.file_id}/view`} target="_blank" rel="noreferrer">打开备份</a> : run.error || "尚未完成"}</td></tr>)}</tbody></table>{!data?.runs.length && <p className="py-6 text-sm text-slate-500">尚无备份记录</p>}</div>
  </div></main>;
}
