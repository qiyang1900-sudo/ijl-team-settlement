import ExcelJS from "exceljs";
import { tiktokMonthlyRows, type TiktokMonthlyRow } from "./tiktok-monthly-data";

export const tiktokSpreadsheetId = "17TXWAXGOKqJis0WgxVh-2ayU5d2-Wi5m6TA5-pdzkjw";
export const tiktokSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${tiktokSpreadsheetId}/edit`;
export const tiktokTeams = ["AWG", "AXIZ", "DFM", "FL", "QTD", "RC", "SZ", "ZETA"];
const metrics = {
  followerCount: "粉丝数", streamCount: "配信回数", postCount: "投稿回数",
  streamViews: "配信視聴回数", videoViews: "動画視聴回数",
} as const;
export type TiktokImportIssue = { month: string; sheet: string; row: number; team: string; account: string; reason: string };
export type TiktokImport = { rows: TiktokMonthlyRow[]; issues: TiktokImportIssue[]; months: string[]; emptyMonths: string[] };

export function tiktokMonthFromSheet(title: string): string | null {
  const name = title.normalize("NFKC").trim();
  const explicit = name.match(/^(20\d{2}|\d{2})年(\d{1,2})月$/);
  if (explicit) {
    const year = explicit[1].length === 2 ? `20${explicit[1]}` : explicit[1];
    const month = Number(explicit[2]);
    return month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, "0")}` : null;
  }
  // These yearless tabs belong to the supplied 2025/26 workbook, not the current year.
  const legacy = name.match(/^(\d{1,2})月$/);
  if (!legacy) return null;
  const month = Number(legacy[1]);
  return month >= 1 && month <= 12 ? `${month >= 9 ? 2025 : 2026}-${String(month).padStart(2, "0")}` : null;
}

function cellValue(value: unknown): string | number {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value !== "object") return "";
  const object = value as Record<string, unknown>;
  if ("error" in object) return String(object.error);
  if ("formula" in object || "sharedFormula" in object) return cellValue(object.result);
  if ("hyperlink" in object) return String(object.hyperlink);
  if ("text" in object) return cellValue(object.text);
  if (Array.isArray(object.richText)) return object.richText.map((part) => cellValue(part)).join("");
  return "";
}

export function tiktokAccountKey(link: string): string | null {
  const normalized = link.normalize("NFKC").trim();
  // Some historical links are display text such as nameko (@nameko1123) | TikTok.
  const displayHandle = normalized.match(/\(@([A-Za-z0-9_.]+)\)/);
  if (displayHandle) return `@${displayHandle[1].toLowerCase()}`;
  try {
    const url = new URL(/^https?:\/\//.test(normalized) ? normalized : `https://${normalized}`);
    if (url.protocol !== "https:" || !(url.hostname === "tiktok.com" || url.hostname.endsWith(".tiktok.com"))) return null;
    const handle = url.pathname.match(/^\/@([A-Za-z0-9_.]+)\/?$/)?.[1];
    if (handle) return `@${handle.toLowerCase()}`;
    const query = url.pathname === "/search" ? url.searchParams.get("q") : null;
    if (query && /^@[A-Za-z0-9_.]+$/.test(query)) return query.toLowerCase();
    if (/^\/t\/[A-Za-z0-9]+\/?$/.test(url.pathname)) return `${url.hostname}${url.pathname.replace(/\/$/, "")}`;
  } catch { /* Invalid links are reported with their source row. */ }
  return null;
}

export function parseTiktokCount(value: unknown): number | null {
  const raw = cellValue(value);
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
  const text = raw.normalize("NFKC").trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(text)) return null;
  const number = Number(text.replaceAll(",", ""));
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export async function parseTiktokWorkbook(buffer: Buffer, maxMonth: string): Promise<TiktokImport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  if (workbook.worksheets.length > 60) throw new Error("表格页数异常，本次未更新数据。");
  const aliases = new Map<string, { name: string; official: boolean; team: string }>();
  for (const row of tiktokMonthlyRows) {
    const key = tiktokAccountKey(row.link);
    if (key) aliases.set(key, { name: row.accountName, official: row.isOfficial, team: row.teamShortName });
  }
  const rows: TiktokMonthlyRow[] = [];
  const issues: TiktokImportIssue[] = [];
  const months: string[] = [];
  const emptyMonths: string[] = [];
  const monthSet = new Set<string>();
  for (const sheet of workbook.worksheets) {
    const month = tiktokMonthFromSheet(sheet.name);
    if (!month || month > maxMonth) continue;
    if (monthSet.has(month)) throw new Error(`${month} 有重复月份工作表，本次未更新数据。`);
    monthSet.add(month);
    if (!sheet.actualRowCount) { emptyMonths.push(month); continue; }
    if (sheet.rowCount > 2000) throw new Error(`${sheet.name} 行数异常，本次未更新数据。`);
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, index) => headers.set(String(cellValue(cell.value)).normalize("NFKC").trim(), index));
    const linkCol = headers.get("TikTok");
    if (!linkCol || Object.values(metrics).some((label) => !headers.has(label))) {
      throw new Error(`${sheet.name} 缺少 TikTok、粉丝数或投稿/直播列，本次未更新数据。`);
    }
    const nameCol = headers.get("選手名");
    const seenTeams = new Set<string>();
    const seenKeys = new Set<string>();
    let team = "";
    let hasAccount = false;
    for (let index = 2; index <= sheet.rowCount; index++) {
      const source = sheet.getRow(index);
      const teamText = String(cellValue(source.getCell(1).value)).normalize("NFKC").trim().toUpperCase();
      const link = String(cellValue(source.getCell(linkCol).value)).trim();
      const hasNumbers = Object.keys(metrics).some((key) => cellValue(source.getCell(headers.get(metrics[key as keyof typeof metrics])!).value) !== "");
      if (/合計|合计|总计|TOTAL/i.test(teamText)) { team = ""; continue; }
      if (teamText) {
        if (!tiktokTeams.includes(teamText)) throw new Error(`${sheet.name}!A${index} 战队「${teamText}」无法识别，本次未更新数据。`);
        team = teamText;
        seenTeams.add(team);
      }
      if (!link && !hasNumbers) continue;
      // Unlabelled SUM control rows are not player accounts.
      if (!link && !teamText && Object.values(metrics).every((label) => {
        const value = source.getCell(headers.get(label)!).value;
        return value && typeof value === "object" && ("formula" in value || "sharedFormula" in value);
      })) continue;
      const key = tiktokAccountKey(link);
      const alias = key ? aliases.get(key) : undefined;
      const explicitName = nameCol ? String(cellValue(source.getCell(nameCol).value)).trim() : "";
      const account = explicitName || alias?.name || key || link || "未填写账号链接";
      const issue = (reason: string) => issues.push({ month, sheet: sheet.name, row: index, team, account, reason });
      if (!team) throw new Error(`${sheet.name}!${index} 缺少所属战队，本次未更新数据。`);
      if (!key) { issue("账号链接缺失或无法识别，跳过此行；已有数据保留。"); continue; }
      hasAccount = true;
      if (alias?.official && alias.team !== team) throw new Error(`${sheet.name}!${index} 官方账号与所属战队不一致，本次未更新数据。`);
      const uniqueKey = `${team}|${key}`;
      if (seenKeys.has(uniqueKey)) throw new Error(`${sheet.name}!${index} 同一战队账号重复，本次未更新数据。`);
      seenKeys.add(uniqueKey);
      const values = Object.fromEntries(Object.entries(metrics).map(([metric, label]) => [metric, parseTiktokCount(source.getCell(headers.get(label)!).value)]));
      const missing = Object.entries(values).filter(([, value]) => value === null).map(([metric]) => metrics[metric as keyof typeof metrics]);
      if (missing.length) { issue(`${missing.join("、")} 含空白、#N/A 或非整数，跳过此行；已有数据保留。`); continue; }
      rows.push({ month, teamShortName: team, accountName: account, isOfficial: alias?.official ?? /公式|官方/.test(explicitName), link,
        ...values as Pick<TiktokMonthlyRow, keyof typeof metrics> });
    }
    if (!hasAccount) { emptyMonths.push(month); continue; }
    const missingTeams = tiktokTeams.filter((name) => !seenTeams.has(name));
    if (missingTeams.length) throw new Error(`${sheet.name} 缺少 ${missingTeams.join("、")} 战队分组，本次未更新数据。`);
    months.push(month);
  }
  if (!rows.length) throw new Error("没有可同步的完整 TikTok 账号数据，已有数据未改变。");
  return { rows, issues, months: months.sort(), emptyMonths: emptyMonths.sort() };
}

export function mergeTiktokImport(previous: TiktokMonthlyRow[], imported: TiktokImport) {
  const key = (row: TiktokMonthlyRow) => `${row.month}|${row.teamShortName}|${tiktokAccountKey(row.link) || row.accountName}`;
  const records = new Map(previous.map((row) => [key(row), row]));
  let added = 0, updated = 0, unchanged = 0;
  for (const row of imported.rows) {
    const old = records.get(key(row));
    if (!old) added++;
    else if (Object.keys(metrics).some((metric) => old[metric as keyof typeof metrics] !== row[metric as keyof typeof metrics]) || old.accountName !== row.accountName || old.isOfficial !== row.isOfficial) updated++;
    else unchanged++;
    records.set(key(row), row);
  }
  return {
    rows: [...records.values()].sort((a, b) => key(a).localeCompare(key(b))),
    added, updated, unchanged,
  };
}
