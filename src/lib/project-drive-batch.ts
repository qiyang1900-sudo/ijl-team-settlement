export type DriveExportTarget = {
  projectTeamId: string;
  teamName: string;
  status: string;
  folderId: string;
  eligible: boolean;
};

export type DriveExportResult = {
  fileUrl: string; fileName: string; folderUrl: string; warning?: string; unchanged?: boolean;
};

export type BatchExportRow = DriveExportTarget & {
  state: "waiting" | "uploading" | "authorizing" | "success" | "failed" | "skipped";
  error?: string;
  result?: DriveExportResult;
};

export function prepareDriveBatch(targets: DriveExportTarget[], previous: BatchExportRow[] = []) {
  return targets.map((target): BatchExportRow => {
    if (!target.eligible) return { ...target, state: "skipped" };
    const saved = previous.find((row) => row.projectTeamId === target.projectTeamId && row.folderId === target.folderId);
    if (saved?.state === "success") return { ...target, state: "success", result: saved.result };
    return { ...target, state: "waiting" };
  });
}

export async function runDriveBatch({ rows, upload, onChange, shouldStop }: {
  rows: BatchExportRow[];
  upload: (row: BatchExportRow, onAuthorizing: (active: boolean) => void) => Promise<DriveExportResult>;
  onChange: (rows: BatchExportRow[]) => void;
  shouldStop: () => boolean;
}) {
  const current = rows.map((row) => ({ ...row }));
  const publish = () => onChange(current.map((row) => ({ ...row })));
  // One report per request keeps generation within the single-report timeout and isolates failures.
  for (const row of current) {
    if (shouldStop()) break;
    if (row.state !== "waiting") continue;
    row.state = "uploading";
    publish();
    try {
      if (!row.folderId) throw new Error("此战队未配置请求书文件夹。");
      row.result = await upload(row, (active) => {
        row.state = active ? "authorizing" : "uploading";
        publish();
      });
      row.state = "success";
    } catch (error) {
      row.state = "failed";
      row.error = error instanceof Error ? error.message : "导出失败，请重试。";
      const code = (error as { code?: string })?.code;
      if (code === "google_auth_expired" || code === "admin_auth_required") {
        publish();
        break;
      }
    }
    publish();
  }
  return current;
}
