"use client";

import { useEffect, useState } from "react";
import {
  loadGoogleDriveLibraries,
  requestGoogleDriveToken, type GoogleDriveConfig,
} from "@/lib/google-drive-browser";
import { exportReportToDrive } from "@/lib/google-drive-export-client";
import type { DriveExportResult } from "@/lib/project-drive-batch";

export default function ReportExportButtons({
  projectTeamId, folderId, config,
}: { projectTeamId: string; folderId: string; config: GoogleDriveConfig }) {
  const configured = Boolean(config.clientId && config.apiKey && config.appId);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<DriveExportResult | null>(null);
  useEffect(() => {
    if (!configured) return;
    let active = true;
    loadGoogleDriveLibraries().then(() => { if (active) setReady(true); })
      .catch((error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [configured]);

  async function exportToDrive() {
    setError("");
    setNotice("");
    setResult(null);
    if (!configured) return setError("Google 网盘尚未完成首次配置。当前仍可使用「导出 Excel」。");
    if (!folderId) return setError("此战队未配置请求书文件夹，请联系管理员。");
    if (!ready) {
      setBusy("正在连接 Google…");
      try {
        await loadGoogleDriveLibraries();
        setReady(true);
        setNotice("Google 连接已恢复，请再次点击导出。");
      }
      catch (error) { setError(error instanceof Error ? error.message : "Google 连接失败。"); }
      finally { setBusy(""); }
      return;
    }
    setBusy("正在连接 Google…");
    try {
      const token = await requestGoogleDriveToken(config.clientId);
      setBusy("正在生成并上传…");
      const data = await exportReportToDrive({ projectTeamId, folderId, config, token,
        onAuthorizing: (active) => setBusy(active ? "等待文件夹授权…" : "正在生成并上传…"),
      });
      setResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "导出失败，请检查网络后重试。");
    } finally { setBusy(""); }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <a href={`/api/admin/project-teams/${projectTeamId}/export`}
          className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200">
          导出 Excel
        </a>
        <button type="button" onClick={exportToDrive}
          disabled={Boolean(busy) || (configured && !ready && !error)} aria-busy={Boolean(busy) || (configured && !ready && !error)}
          className="min-h-11 min-w-52 rounded-lg border border-emerald-500 bg-emerald-950 px-5 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60">
          {busy || (configured && !ready && !error ? "正在加载 Google…" : "导出到 Google 网盘")}
        </button>
      </div>
      {error ? <p role="alert" className="mt-3 max-w-3xl break-words text-sm text-red-300">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 text-sm text-slate-300">{notice}</p> : null}
      {result ? <div role="status" className="mt-3 max-w-3xl space-y-1 break-words text-sm text-emerald-200">
        <p>{result.unchanged ? "网盘中已是最新报告。" : "结案报告已保存到该战队的请求书文件夹。"}</p>
        <p className="break-all">{result.fileName}</p>
        <div className="flex flex-wrap gap-4">
          <a href={result.fileUrl} target="_blank" rel="noopener noreferrer" className="underline">查看报告</a>
          <a href={result.folderUrl} target="_blank" rel="noopener noreferrer" className="underline">打开文件夹</a>
        </div>
        {result.warning ? <p className="text-amber-200">{result.warning}</p> : null}
      </div> : null}
    </div>
  );
}
