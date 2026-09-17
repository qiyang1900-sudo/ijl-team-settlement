"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleDriveLibraries, requestGoogleDriveToken, type GoogleDriveConfig } from "@/lib/google-drive-browser";
import { exportReportToDrive } from "@/lib/google-drive-export-client";
import { prepareDriveBatch, runDriveBatch, type BatchExportRow, type DriveExportTarget } from "@/lib/project-drive-batch";
import { getAdminStatusLabel } from "@/lib/status-labels";

const stateLabels = {
  waiting: "等待导出", uploading: "正在生成并上传…", authorizing: "等待文件夹授权…",
  success: "已保存到网盘", failed: "导出失败", skipped: "已跳过",
};

export default function ProjectDriveExport({ projectId, approvedCount, config }: {
  projectId: string; approvedCount: number; config: GoogleDriveConfig;
}) {
  const configured = Boolean(config.clientId && config.apiKey && config.appId);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rows, setRows] = useState<BatchExportRow[]>([]);
  const [stopping, setStopping] = useState(false);
  const active = useRef(false);
  const stop = useRef(false);

  useEffect(() => {
    if (!configured || !approvedCount) return;
    let mounted = true;
    loadGoogleDriveLibraries().then(() => { if (mounted) setReady(true); })
      .catch((error) => { if (mounted) setError(error.message); });
    return () => { mounted = false; stop.current = true; };
  }, [configured, approvedCount]);

  useEffect(() => {
    if (!busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [busy]);

  async function start(retry: boolean) {
    if (active.current) return;
    setError("");
    setNotice("");
    if (!configured) return setError("Google 网盘尚未完成首次配置。");
    active.current = true;
    stop.current = false;
    setStopping(false);
    setBusy("正在连接 Google…");
    try {
      if (!ready) {
        await loadGoogleDriveLibraries();
        setReady(true);
        setNotice("Google 连接已恢复，请再次点击导出。");
        return;
      }
      // Request on the button gesture so browsers can open Google's sign-in popup.
      const token = await requestGoogleDriveToken(config.clientId);
      setBusy("正在读取最新审核状态…");
      const response = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/drive-export-targets`, {
        cache: "no-store", signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.targets)) throw new Error(data?.error || "项目列表读取失败，本次未开始导出。");
      const next = prepareDriveBatch(data.targets as DriveExportTarget[], retry ? rows : []);
      setRows(next);
      if (!next.some((row) => row.state === "waiting")) {
        setNotice("当前没有需要导出的已通过报告。");
        return;
      }
      setBusy("正在批量导出…");
      const finalRows = await runDriveBatch({
        rows: next, onChange: setRows, shouldStop: () => stop.current,
        upload: (row, onAuthorizing) => exportReportToDrive({
          projectId, projectTeamId: row.projectTeamId, folderId: row.folderId, config, token, onAuthorizing,
        }),
      });
      setNotice(finalRows.some((row) => row.state === "waiting") ? "已暂停，已完成的报告已保留。" : "本次导出已结束。");
    } catch (error) {
      setError(error instanceof Error ? error.message : "导出失败，请检查网络后重试。");
    } finally { active.current = false; setBusy(""); setStopping(false); }
  }

  const succeeded = rows.filter((row) => row.state === "success").length;
  const failed = rows.filter((row) => row.state === "failed").length;
  const skipped = rows.filter((row) => row.state === "skipped").length;
  const unfinished = rows.filter((row) => row.state === "waiting" || row.state === "failed").length;
  const total = rows.length ? rows.length - skipped : approvedCount;
  const loading = configured && approvedCount > 0 && !ready && !error;

  return (
    <section aria-label="项目网盘导出" className="mt-8 border-y border-slate-700 py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">结案报告</h2>
          <p className="mt-1 text-sm text-slate-400">已通过 {total} 队</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" onClick={() => start(false)} disabled={Boolean(busy) || loading || total === 0}
            aria-busy={Boolean(busy) || loading}
            className="min-h-11 w-full rounded-lg border border-emerald-500 bg-emerald-950 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
            {busy || (loading ? "正在加载 Google…" : "一键导出到 Google 网盘")}
          </button>
          {!busy && unfinished > 0 ? <button type="button" onClick={() => start(true)}
            className="min-h-11 rounded-lg border border-slate-500 px-4 py-2 text-sm hover:bg-slate-800">
            重试未完成（{unfinished}）
          </button> : null}
          {busy ? <button type="button" disabled={stopping} onClick={() => { stop.current = true; setStopping(true); }}
            className="min-h-11 rounded-lg border border-slate-500 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-60">
            {stopping ? "完成当前战队后停止…" : "停止后续导出"}
          </button> : null}
        </div>
      </div>
      {error ? <p role="alert" className="mt-3 break-words text-sm text-red-300">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 text-sm text-slate-300">{notice}</p> : null}
      {rows.length > 0 ? <div className="mt-4">
        <p role="status" className="mb-2 text-sm text-slate-300">成功 {succeeded} / {total} · 失败 {failed} · 跳过 {skipped}</p>
        <progress aria-label="报告导出进度" max={Math.max(total, 1)} value={succeeded + failed}
          className="block h-1.5 w-full appearance-none overflow-hidden rounded bg-slate-800 [&::-webkit-progress-bar]:bg-slate-800 [&::-webkit-progress-value]:bg-emerald-400 [&::-moz-progress-bar]:bg-emerald-400" />
        <ul className="mt-3 divide-y divide-slate-700">
          {rows.map((row) => <li key={row.projectTeamId} className="grid gap-x-4 gap-y-1 py-3 text-sm sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
            <span className="font-semibold">{row.teamName}</span>
            <div className="min-w-0 break-words">
              <p className={row.state === "failed" ? "text-red-300" : row.state === "success" ? "text-emerald-300" : "text-slate-300"}>
                {row.state === "skipped" ? `已跳过：${getAdminStatusLabel(row.status)}` : row.result?.unchanged ? "网盘中已是最新报告" : stateLabels[row.state]}
              </p>
              {row.error ? <p className="mt-1 text-red-300">{row.error}</p> : null}
              {row.result?.warning ? <p className="mt-1 text-amber-200">{row.result.warning}</p> : null}
            </div>
            {row.result ? <div className="flex flex-wrap gap-3">
              <a href={row.result.fileUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-200 underline">查看报告<span className="sr-only">：{row.teamName}</span></a>
              <a href={row.result.folderUrl} target="_blank" rel="noopener noreferrer" className="text-slate-300 underline">文件夹<span className="sr-only">：{row.teamName}</span></a>
            </div> : null}
          </li>)}
        </ul>
      </div> : null}
    </section>
  );
}
