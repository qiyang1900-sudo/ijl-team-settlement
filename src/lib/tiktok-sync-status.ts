import type { TiktokMonthlyRow } from "./tiktok-monthly-data";
import type { TiktokImportIssue } from "./tiktok-sheet-import";

export type TiktokSyncStatus = {
  syncedAt: string | null;
  months: string[];
  emptyMonths: string[];
  added: number;
  updated: number;
  unchanged: number;
  issues: TiktokImportIssue[];
};
export type TiktokSnapshot = TiktokSyncStatus & {
  version: 1;
  spreadsheetId: string;
  rows: TiktokMonthlyRow[];
};

export function tiktokSyncStatus(snapshot: TiktokSnapshot | null): TiktokSyncStatus {
  if (!snapshot) return { syncedAt: null, months: [], emptyMonths: [], added: 0, updated: 0, unchanged: 0, issues: [] };
  const { syncedAt, months, emptyMonths, added, updated, unchanged, issues } = snapshot;
  return { syncedAt, months, emptyMonths, added, updated, unchanged, issues };
}
