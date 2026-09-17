"use client";

import { authorizeReportFolder, clearGoogleDriveToken, type GoogleDriveConfig } from "@/lib/google-drive-browser";
import type { DriveExportResult } from "@/lib/project-drive-batch";

export class DriveUploadClientError extends Error {
  constructor(message: string, public code: string) { super(message); }
}

export async function exportReportToDrive({ projectTeamId, projectId, folderId, config, token, onAuthorizing }: {
  projectTeamId: string; projectId?: string; folderId: string; config: GoogleDriveConfig; token: string;
  onAuthorizing: (active: boolean) => void;
}): Promise<DriveExportResult> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const upload = async () => {
    let response: Response;
    try {
      response = await fetch(`/api/admin/project-teams/${encodeURIComponent(projectTeamId)}/export-drive${query}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(310_000),
      });
    } catch {
      throw new DriveUploadClientError("连接中断或等待超时，尚未确认导出结果。请重试，不会创建重复文件。", "network_error");
    }
    const data = await response.json().catch(() => ({ error: "服务器未返回完整结果，请重试。", code: "invalid_response" }));
    return { response, data };
  };
  let reply = await upload();
  if (reply.data.code === "folder_authorization_required") {
    onAuthorizing(true);
    try { await authorizeReportFolder(config, token, folderId); }
    finally { onAuthorizing(false); }
    reply = await upload();
  }
  if (!reply.response.ok || !reply.data.fileUrl || !reply.data.fileName || !reply.data.folderUrl) {
    if (reply.data.code === "google_auth_expired") clearGoogleDriveToken();
    throw new DriveUploadClientError(reply.data.error || `导出失败（HTTP ${reply.response.status}）。`, reply.data.code || "export_failed");
  }
  return reply.data;
}
