import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getInvoiceUploadFolderId, getInvoiceUploadUrl } from "@/lib/invoice-upload-links";

const API = "https://www.googleapis.com/drive/v3";
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FILE_FIELDS = "id,name,parents,trashed,mimeType,md5Checksum,webViewLink,appProperties";

export class DriveExportError extends Error {
  constructor(message: string, public code: string, public status = 502) {
    super(message);
  }
}

export function getReportDriveFolder(teamCode: string) {
  const url = getInvoiceUploadUrl(teamCode);
  const id = getInvoiceUploadFolderId(teamCode);
  if (!id || !/^[\w-]+$/.test(id)) {
    throw new DriveExportError("该战队尚未配置请求书文件夹。", "folder_not_configured", 409);
  }
  return { id, url };
}

export async function driveRequest(token: string, url: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new DriveExportError("Google 网盘连接中断或超时，请重试。重复导出不会创建额外副本。", "network_error");
  }
  if (response.ok || response.status === 404 || response.status === 409) return response;
  const detail = await response.json().catch(() => null);
  const reason = detail?.error?.errors?.[0]?.reason;
  if (response.status === 401) {
    throw new DriveExportError("Google 授权已过期，请重新连接 Google 后重试。", "google_auth_expired", 401);
  }
  if (reason === "appNotAuthorizedToFile") {
    throw new DriveExportError("请先授权该战队的请求书文件夹。", "folder_authorization_required", 409);
  }
  if (reason === "storageQuotaExceeded") {
    throw new DriveExportError("Google 网盘存储空间不足，请释放空间后重试。", "storage_full", 409);
  }
  if (response.status === 429 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
    throw new DriveExportError("Google 网盘暂时限制请求，请稍后重试。", "rate_limited", 429);
  }
  if (response.status === 403) {
    throw new DriveExportError("Google 拒绝上传。请确认当前账号有编辑权限，并已启用 Google Drive API。", "google_forbidden", 403);
  }
  throw new DriveExportError(`Google 网盘处理失败（HTTP ${response.status}），请稍后重试。`, "google_error");
}

export async function verifyReportDriveFolder(token: string, folderId: string) {
  const response = await driveRequest(token, `${API}/files/${folderId}?supportsAllDrives=true&fields=id,mimeType,trashed,capabilities(canAddChildren)`);
  if (response.status === 404) {
    throw new DriveExportError("请先在 Google 文件夹选择窗口中授权该战队的请求书文件夹。", "folder_authorization_required", 409);
  }
  const folder = await response.json();
  if (folder.trashed || folder.mimeType !== "application/vnd.google-apps.folder") {
    throw new DriveExportError("请求书文件夹不存在或已被移入回收站。", "invalid_folder", 409);
  }
  if (!folder.capabilities?.canAddChildren) {
    throw new DriveExportError("当前 Google 账号只有查看权限，无法向此文件夹上传。", "folder_read_only", 403);
  }
}

type ExportRecord = {
  file_id: string;
  folder_id: string;
  uploaded_at: string | null;
};

export async function reserveReportDriveFile(
  supabase: SupabaseClient, projectTeamId: string, folderId: string, token: string
): Promise<ExportRecord> {
  const read = () => supabase.from("project_report_drive_exports")
    .select("file_id,folder_id,uploaded_at").eq("project_team_id", projectTeamId).maybeSingle();
  const existing = await read();
  if (existing.error) {
    throw new DriveExportError("网盘导出记录读取失败，请确认已安装 project-report-drive-exports.sql。", "export_record_unavailable", 503);
  }
  if (existing.data) {
    if (existing.data.folder_id !== folderId) {
      throw new DriveExportError("战队目标文件夹已变更，请管理员核对原导出记录后再继续。", "folder_changed", 409);
    }
    return existing.data;
  }
  const idsResponse = await driveRequest(token, `${API}/files/generateIds?count=1&space=drive&type=files`);
  const fileId = (await idsResponse.json()).ids?.[0];
  if (typeof fileId !== "string" || !/^[\w-]+$/.test(fileId)) {
    throw new DriveExportError("Google 未返回有效的文件编号，请重试。", "missing_file_id");
  }
  // Reserve before uploading: concurrent requests and uncertain retries use the same Drive file.
  const inserted = await supabase.from("project_report_drive_exports")
    .insert({ project_team_id: projectTeamId, folder_id: folderId, file_id: fileId })
    .select("file_id,folder_id,uploaded_at").single();
  if (!inserted.error && inserted.data) return inserted.data;
  if (inserted.error?.code === "23505") {
    const winner = await read();
    if (!winner.error && winner.data?.folder_id === folderId) return winner.data;
  }
  throw new DriveExportError("无法保存网盘导出记录，本次没有上传文件。请重试。", "export_record_unavailable", 503);
}

type DriveFile = {
  id: string; name: string; parents?: string[]; trashed?: boolean; mimeType?: string;
  md5Checksum?: string; webViewLink?: string; appProperties?: Record<string, string>;
};

export async function uploadProjectReportToDrive({
  token, record, projectTeamId, fileName, workbook,
}: {
  token: string; record: ExportRecord; projectTeamId: string; fileName: string; workbook: Buffer;
}) {
  const checksum = createHash("md5").update(workbook).digest("hex");
  const fileUrl = `${API}/files/${record.file_id}?supportsAllDrives=true&fields=${FILE_FIELDS}`;
  const previous = await driveRequest(token, fileUrl);
  let exists = previous.status !== 404;
  const check = (file: DriveFile) => {
    if (file.id !== record.file_id || file.trashed || !file.parents?.includes(record.folder_id) ||
        file.mimeType !== MIME || file.appProperties?.ijlProjectTeamId !== projectTeamId) {
      throw new DriveExportError("原导出文件已移动、删除或不属于此项目，本次未覆盖任何文件。", "file_mismatch", 409);
    }
  };
  if (exists) {
    const previousFile: DriveFile = await previous.json();
    check(previousFile);
    if (previousFile.md5Checksum === checksum && previousFile.name === fileName) {
      return { fileId: previousFile.id, fileUrl: previousFile.webViewLink || `https://drive.google.com/file/d/${previousFile.id}/view`, unchanged: true };
    }
  } else if (record.uploaded_at) {
    throw new DriveExportError("已导出的文件不可访问。请使用原 Google 账号，或检查文件是否已删除；本次不会另建副本。", "file_unavailable", 409);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const metadata = exists
      ? { name: fileName }
      : { id: record.file_id, name: fileName, mimeType: MIME, parents: [record.folder_id], appProperties: { ijlProjectTeamId: projectTeamId } };
    const endpoint = `https://www.googleapis.com/upload/drive/v3/files${exists ? `/${record.file_id}` : ""}?uploadType=resumable&supportsAllDrives=true&fields=${FILE_FIELDS}`;
    const start = await driveRequest(token, endpoint, {
      method: exists ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", "X-Upload-Content-Type": MIME, "X-Upload-Content-Length": String(workbook.length) },
      body: JSON.stringify(metadata),
    });
    if (start.status === 409 && !exists) {
      const concurrent = await driveRequest(token, fileUrl);
      if (!concurrent.ok) break;
      check(await concurrent.json());
      exists = true;
      continue;
    }
    const location = start.headers.get("location");
    if (!start.ok || !location) break;
    const sessionUrl = new URL(location);
    if (sessionUrl.protocol !== "https:" || sessionUrl.hostname !== "www.googleapis.com" ||
        !sessionUrl.pathname.startsWith("/upload/drive/v3/files")) {
      throw new DriveExportError("Google 返回了无效的上传地址。", "invalid_upload_session");
    }
    const uploaded = await driveRequest(token, location, {
      method: "PUT", headers: { "Content-Type": MIME }, body: new Uint8Array(workbook),
    });
    if (uploaded.status === 409 && !exists) {
      const concurrent = await driveRequest(token, fileUrl);
      if (!concurrent.ok) break;
      check(await concurrent.json());
      exists = true;
      continue;
    }
    if (!uploaded.ok) break;
    const verified = await driveRequest(token, fileUrl);
    if (!verified.ok) break;
    const file: DriveFile = await verified.json();
    check(file);
    if (file.md5Checksum !== checksum) {
      throw new DriveExportError("网盘文件完整性校验未通过，请重试。", "checksum_mismatch");
    }
    return { fileId: file.id, fileUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`, unchanged: false };
  }
  throw new DriveExportError("Google 网盘上传未完成，请重试。", "upload_incomplete");
}
