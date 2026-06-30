import type { MonthlyPlayerRow } from "./monthly-data";

export type MonthlyImportDataType = "x" | "youtube";
export type MonthlyImportMode = "fill" | "overwrite";

export type MonthlyImportMetricField = {
  key: keyof MonthlyPlayerRow;
  label: string;
};

export type RawMonthlyImportRow = {
  sourceLine: number;
  teamInput: string;
  accountName: string;
  isOfficial: boolean;
  playerHandle: string;
  values: Partial<Record<keyof MonthlyPlayerRow, string>>;
  isEmptyMetrics: boolean;
  rawCells: string[];
};

export type MonthlyImportSkippedRow = {
  sourceLine: number;
  reason: string;
  rawCells: string[];
};

export type MonthlyImportTotals = Record<string, number>;

export type ParsedMonthlyImportText = {
  rows: RawMonthlyImportRow[];
  skippedRows: MonthlyImportSkippedRow[];
  totals: {
    official: MonthlyImportTotals;
    players: MonthlyImportTotals;
    total: MonthlyImportTotals;
  };
};

export const monthlyImportFieldSets: Record<
  MonthlyImportDataType,
  MonthlyImportMetricField[]
> = {
  x: [
    { key: "xTweetCount", label: "ツイート本数（引用含む）" },
    { key: "xImpressions", label: "インプレッション" },
    { key: "xEngagements", label: "エンゲージメント" },
    { key: "xFanEventCount", label: "ファンイベント回数" },
    { key: "xFollowerCount", label: "フォロワー数" },
  ],
  youtube: [
    { key: "youtubeVideoPostCount", label: "投稿本数（動画）" },
    { key: "youtubeVideoViews", label: "視聴回数（動画）" },
    { key: "youtubeShortPostCount", label: "投稿本数（ショート）" },
    { key: "youtubeShortViews", label: "視聴回数（ショート）" },
    { key: "youtubeLikeCount", label: "いいね数" },
    { key: "youtubeStreamCount", label: "配信回数" },
    { key: "youtubeStreamViews", label: "視聴回数（配信）" },
    { key: "youtubeTotalImpressions", label: "合計インプレッション" },
    { key: "youtubeSubscriberCount", label: "登録者数" },
  ],
};

const officialAccountAliases: Record<string, string[]> = {
  AWG: ["awg公式", "arnebwithwog", "arnebwithwog公式"],
  AXIZ: ["axizwave", "axiz公式"],
  DFM: ["dfm公式", "detonationfocusme", "detonationfocusme公式"],
  FL: ["fennel公式", "fennel"],
  QTD: ["qtdig公式", "qtdig"],
  RC: ["rc公式", "reject", "reject公式"],
  SZ: ["sz公式", "scarz", "scarz公式"],
  ZETA: ["zeta公式", "zetadivision", "zetadivision公式"],
};

export function parseMonthlyImportText(
  rawText: string,
  dataType: MonthlyImportDataType
): ParsedMonthlyImportText {
  const fields = monthlyImportFieldSets[dataType];
  const parsedRows = parseDelimitedRows(rawText);
  const rows: RawMonthlyImportRow[] = [];
  const skippedRows: MonthlyImportSkippedRow[] = [];
  let currentTeamInput = "";
  const teamDataRowCounts = new Map<string, number>();

  parsedRows.forEach((cells, index) => {
    const sourceLine = index + 1;
    const normalizedCells = cells.map(cleanCell);

    if (normalizedCells.every((cell) => !cell)) {
      return;
    }

    if (isHeaderRow(normalizedCells)) {
      return;
    }

    if (isTotalRow(normalizedCells)) {
      skippedRows.push({
        sourceLine,
        reason: "合计行不会作为战队数据导入。",
        rawCells: normalizedCells,
      });
      return;
    }

    const teamCell = normalizedCells[0] || "";
    const accountName = stripStatusMarks(normalizedCells[1] || "");

    if (teamCell) {
      currentTeamInput = teamCell;
    }

    if (!currentTeamInput) {
      skippedRows.push({
        sourceLine,
        reason: "没有识别到战队名。",
        rawCells: normalizedCells,
      });
      return;
    }

    if (!accountName) {
      skippedRows.push({
        sourceLine,
        reason: "没有识别到官方账号或选手名。",
        rawCells: normalizedCells,
      });
      return;
    }

    const values: Partial<Record<keyof MonthlyPlayerRow, string>> = {};
    let hasAnyMetricCell = false;

    fields.forEach((field, fieldIndex) => {
      const rawValue = normalizedCells[fieldIndex + 2] || "";
      const parsedValue = normalizeNumericCell(rawValue);

      if (rawValue) {
        hasAnyMetricCell = true;
      }

      values[field.key] = parsedValue;
    });

    const teamLookupKey = normalizeTeamLookupKey(currentTeamInput);
    const currentTeamRowCount = teamDataRowCounts.get(teamLookupKey) || 0;
    const isFirstTeamDataRow = currentTeamRowCount === 0;
    teamDataRowCounts.set(teamLookupKey, currentTeamRowCount + 1);

    const isOfficial =
      isFirstTeamDataRow || isOfficialAccountName(accountName, currentTeamInput);
    const playerHandle = isOfficial
      ? ""
      : normalizePlayerHandle(accountName, currentTeamInput);

    rows.push({
      sourceLine,
      teamInput: currentTeamInput,
      accountName,
      isOfficial,
      playerHandle,
      values,
      isEmptyMetrics: !hasAnyMetricCell,
      rawCells: normalizedCells,
    });
  });

  return {
    rows,
    skippedRows,
    totals: buildImportTotals(rows, fields),
  };
}

export function normalizeTeamLookupKey(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[＿_・,，.。()（）"']/g, "")
    .trim();
}

export function normalizePlayerLookupKey(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[＿_・,，.。()（）"']/g, "")
    .trim();
}

export function normalizePlayerHandle(name: string, teamInput?: string) {
  let value = stripStatusMarks(name);
  const normalizedTeam = normalizeTeamLookupKey(teamInput);
  const firstUnderscore = value.indexOf("_");

  if (firstUnderscore > 0) {
    const prefix = normalizeTeamLookupKey(value.slice(0, firstUnderscore));

    if (
      prefix === normalizedTeam ||
      Object.values(teamAliases).some((aliases) => aliases.includes(prefix)) ||
      Object.keys(teamAliases).some((shortName) => shortName.toLowerCase() === prefix)
    ) {
      value = value.slice(firstUnderscore + 1);
    }
  }

  return value.trim();
}

export function buildTeamAliases(shortName: string | null | undefined) {
  const key = String(shortName || "").trim().toUpperCase();

  return teamAliases[key] || [];
}

export function isBlankImportValue(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

function buildImportTotals(
  rows: RawMonthlyImportRow[],
  fields: MonthlyImportMetricField[]
) {
  const official = emptyTotals(fields);
  const players = emptyTotals(fields);

  for (const row of rows) {
    const target = row.isOfficial ? official : players;

    for (const field of fields) {
      target[String(field.key)] += numericImportValue(row.values[field.key]);
    }
  }

  const total = emptyTotals(fields);

  for (const field of fields) {
    const key = String(field.key);
    total[key] = official[key] + players[key];
  }

  return { official, players, total };
}

function emptyTotals(fields: MonthlyImportMetricField[]) {
  return Object.fromEntries(fields.map((field) => [String(field.key), 0]));
}

function numericImportValue(value: unknown) {
  const numberValue = Number(value || 0);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function parseDelimitedRows(rawText: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === "\t") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);

  return rows.map((row) =>
    row.length <= 1 && /\s{2,}/.test(row[0] || "")
      ? String(row[0] || "").split(/\s{2,}/)
      : row
  );
}

function cleanCell(value: unknown) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripStatusMarks(value: string) {
  return cleanCell(value)
    .replace(/[✅✔︎✓]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNumericCell(value: string) {
  const cleaned = String(value || "")
    .replace(/[,\s　円¥￥]/g, "")
    .trim();

  if (!cleaned || cleaned === "-" || cleaned === "ー") {
    return "";
  }

  const match = cleaned.match(/-?\d+(?:\.\d+)?/);

  return match ? match[0] : "";
}

function isHeaderRow(cells: string[]) {
  const joined = cells.join(" ");

  return (
    /チーム名|選手名|手動入力|アナリティクス/.test(joined) ||
    /^\d{1,2}月$/.test(cells[0] || "")
  );
}

function isTotalRow(cells: string[]) {
  const joined = cells.slice(0, 2).join(" ");

  return /合計|总合计|官方合计|选手合计/.test(joined);
}

function isOfficialAccountName(accountName: string, teamInput: string) {
  const normalizedName = normalizeTeamLookupKey(stripStatusMarks(accountName));
  const normalizedTeam = normalizeTeamLookupKey(teamInput);

  if (!normalizedName) {
    return false;
  }

  if (normalizedName.includes("公式")) {
    return true;
  }

  if (normalizedName === normalizedTeam) {
    return true;
  }

  return Object.entries(officialAccountAliases).some(([shortName, aliases]) => {
    const allAliases = [
      shortName.toLowerCase(),
      ...aliases,
      ...buildTeamAliases(shortName),
    ];

    return allAliases.includes(normalizedName);
  });
}

const teamAliases: Record<string, string[]> = {
  AWG: ["awg", "arnebwithwog"],
  AXIZ: ["axiz", "axizwave"],
  DFM: ["dfm", "detonationfocusme"],
  FL: ["fl", "fennel"],
  QTD: ["qtd", "qtdig", "qtdig"],
  RC: ["rc", "reject"],
  SZ: ["sz", "scarz"],
  ZETA: ["zeta", "zetadivision"],
};
