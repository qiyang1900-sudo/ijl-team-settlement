import { createHash } from "node:crypto";
import { parseMonthlyPlayerRows, normalizeMonthlyStatus } from "./monthly-data";

type SubmissionSnapshot = {
  status?: string | null;
  salary_status?: string | null;
  player_rows?: unknown;
  content_entries?: unknown;
  content_skipped?: boolean;
  club_activity_link?: string | null;
  club_activity_image_url?: string | null;
  club_activity_image_name?: string | null;
  club_activity_image_mime_type?: string | null;
  club_activity_image_storage_path?: string | null;
  return_reason?: string | null;
  salary_return_reason?: string | null;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

// Separate content revisions let salary and monthly drafts be saved independently.
export function monthlyDraftRevision(source: SubmissionSnapshot | null | undefined, salary = false) {
  const rows = parseMonthlyPlayerRows(source?.player_rows).map((row) =>
    Object.fromEntries(Object.entries(row).filter(([key]) =>
      salary ? ["id", "playerId"].includes(key) || key.startsWith("salary") : !key.startsWith("salary")
    ))
  );
  const snapshot = salary ? {
    status: normalizeMonthlyStatus(source?.salary_status),
    reason: source?.salary_return_reason || null,
    rows,
  } : {
    status: normalizeMonthlyStatus(source?.status),
    reason: source?.return_reason || null,
    rows,
    content: source?.content_entries || [],
    skipped: source?.content_skipped || false,
    activities: source?.club_activity_link || null,
    imageUrl: source?.club_activity_image_url || null,
    imageName: source?.club_activity_image_name || null,
    imageMimeType: source?.club_activity_image_mime_type || null,
    imageStoragePath: source?.club_activity_image_storage_path || null,
  };
  return createHash("sha256").update(JSON.stringify(stableValue(snapshot))).digest("hex");
}
