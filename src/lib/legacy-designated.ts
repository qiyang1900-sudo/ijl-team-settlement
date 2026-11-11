export type LegacyDesignatedSource = {
  team: string;
  spreadsheetId: string;
  sheetId: number;
  sheetName: string;
  entries: Array<{
    row: number;
    title: string;
    url: string;
    publishedOn: string;
    month: string | null;
    platform: string;
    countAsLong?: boolean;
  }>;
};

// Historical evidence is versioned separately from team submissions. Reading
// it must never rewrite monthly metrics, claims, salaries or review states.
export function legacyDesignatedForMonth(
  month: string,
  sources: LegacyDesignatedSource[],
): LegacyDesignatedSource[] {
  if (!/^2026-0[789]$/.test(month)) return [];
  return sources.map((source) => ({
    ...source,
    entries: source.entries.filter((entry) => entry.month === month || entry.month === null),
  }));
}

export function legacyDesignatedSourceUrl(source: LegacyDesignatedSource, row?: number) {
  const range = row ? `&range=A${row}:F${row}` : "";
  return `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}/edit#gid=${source.sheetId}${range}`;
}
