import { Buffer } from "node:buffer";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  MonthlyPlayerRow,
  formatMonthLabel,
  isOfficialMonthlyRow,
  numericMonthlyValue,
  parseMonthlyPlayerRows,
  splitMonthlyRows,
} from "@/lib/monthly-data";
import { getCurrentMonthValue } from "@/lib/month-options";
import {
  MonthlySummary,
  combineMonthlySummariesForPeriod,
  formatMonthlyPercent,
  summarizeMonthlySubmissions,
} from "@/lib/monthly-summary";
import {
  applyHistoricalLeagueSummaries,
  getPreviousYearMonth,
} from "@/lib/league-summary-history";
import { applyTiktokShortVideoToSummary } from "@/lib/tiktok-monthly-data";

export const runtime = "nodejs";

type MonthlySubmissionRow = {
  target_month: string;
  player_rows: unknown;
  teams: {
    name: string | null;
    short_name: string | null;
  } | null;
};

type SheetCell = string | number | null;
type SheetRow = {
  cells: SheetCell[];
  style?: number;
};
type SheetData = {
  name: string;
  rows: SheetRow[];
  merges: string[];
  widths: number[];
};

const xFields: Array<{ key: keyof MonthlyPlayerRow; label: string }> = [
  { key: "xTweetCount", label: "ツイート本数（引用含む）" },
  { key: "xImpressions", label: "インプレッション" },
  { key: "xEngagements", label: "エンゲージメント" },
  { key: "xFanEventCount", label: "ファンイベント回数" },
  { key: "xFollowerCount", label: "フォロワー数" },
];

const youtubeFields: Array<{ key: keyof MonthlyPlayerRow; label: string }> = [
  { key: "youtubeVideoPostCount", label: "投稿本数（動画）" },
  { key: "youtubeVideoViews", label: "視聴回数（動画）" },
  { key: "youtubeShortPostCount", label: "投稿本数（ショート）" },
  { key: "youtubeShortViews", label: "視聴回数（ショート）" },
  { key: "youtubeLikeCount", label: "いいね数" },
  { key: "youtubeStreamCount", label: "配信回数" },
  { key: "youtubeStreamViews", label: "視聴回数（配信）" },
  { key: "youtubeTotalImpressions", label: "合計インプレッション" },
  { key: "youtubeSubscriberCount", label: "登録者数" },
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const currentMonth = getCurrentMonthValue();
  let fromMonth = normalizeExportMonth(
    url.searchParams.get("from") || "0000-01",
    currentMonth
  );
  let toMonth = normalizeExportMonth(
    url.searchParams.get("to") || currentMonth,
    currentMonth
  );
  if (fromMonth > toMonth) {
    [fromMonth, toMonth] = [toMonth, fromMonth];
  }
  const requestedMonth = normalizeExportMonth(
    url.searchParams.get("month") || toMonth,
    currentMonth
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response("Supabase 环境变量没有设置成功。", { status: 500 });
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase
    .from("monthly_data_submissions")
    .select(
      `
      target_month,
      player_rows,
      teams (
        name,
        short_name
      )
    `
    )
    .lte("target_month", currentMonth)
    .eq("status", "approved")
    .order("target_month", { ascending: true });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const allSubmissions = (data || []) as unknown as MonthlySubmissionRow[];
  const submissions = allSubmissions.filter(
    (submission) =>
      submission.target_month >= fromMonth && submission.target_month <= toMonth
  );
  const allMonthlySummaries = applyHistoricalLeagueSummaries(
    summarizeMonthlySubmissions(allSubmissions)
  ).map((summary) => applyTiktokShortVideoToSummary(summary));
  const monthlySummaries = allMonthlySummaries.filter(
    (summary) => summary.month >= fromMonth && summary.month <= toMonth
  );
  const selectedMonth = allMonthlySummaries.some(
    (summary) => summary.month === requestedMonth
  )
    ? requestedMonth
    : toMonth;
  const workbook = createXlsxWorkbook([
    buildSummarySheet(monthlySummaries, allMonthlySummaries, selectedMonth),
    buildXSheet(submissions),
    buildYoutubeSheet(submissions),
  ]);

  return new Response(workbook, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        `league-summary_${fromMonth}_${toMonth}.xlsx`
      )}`,
    },
  });
}

function buildSummarySheet(
  monthlySummaries: MonthlySummary[],
  allMonthlySummaries: MonthlySummary[],
  selectedMonth: string
): SheetData {
  const current = allMonthlySummaries.find((summary) => summary.month === selectedMonth);
  const previous = allMonthlySummaries.find(
    (summary) => summary.month === getPreviousYearMonth(selectedMonth)
  );
  const rows: SheetRow[] = [
    {
      cells: [
        "数据",
        "官推条数",
        "官推互动量",
        "官推阅读量",
        "互动率",
        "粉丝数",
        "选手推条数",
        "互动量",
        "阅读量",
        "互动率",
        "选手粉丝数",
        "YT 登録者",
        "投稿数量",
        "视频播放次数",
        "直播观看次数",
        "直播次数",
        "短视频投稿（Shorts+TT）",
        "短视频播放（Shorts+TT）",
        "点赞量",
      ],
      style: 2,
    },
    ...monthlySummaries.map((summary) => ({
      cells: [
        formatMonthLabel(summary.month),
        summary.official.xTweetCount,
        summary.official.xEngagements,
        summary.official.xImpressions,
        formatMonthlyPercent(summary.official.xEngagementRate),
        summary.official.xFollowerCount,
        summary.players.xTweetCount,
        summary.players.xEngagements,
        summary.players.xImpressions,
        formatMonthlyPercent(summary.players.xEngagementRate),
        summary.players.xFollowerCount,
        summary.total.youtubeSubscriberCount,
        summary.total.youtubeTotalPostCount,
        summary.total.youtubeVideoViews,
        summary.total.youtubeStreamViews,
        summary.total.youtubeStreamCount,
        summary.total.youtubeShortPostCount,
        summary.total.youtubeShortViews,
        summary.total.youtubeLikeCount,
      ],
    })),
    { cells: [] },
    {
      cells: [
        "当前期间总计算数",
        "",
        "总计算数放在表格下方，不混入月度表格行。",
      ],
      style: 1,
    },
    { cells: ["指标", "数值"], style: 2 },
    ...buildPeriodTotalRows(monthlySummaries),
    { cells: [] },
    {
      cells: [
        `${formatMonthLabel(selectedMonth)} 指定月份总数据`,
        "",
        "表格合计放在这里，不混入月度表格行。",
      ],
      style: 1,
    },
    { cells: ["指标", "当前", "去年同月", "增减"], style: 2 },
    ...buildComparisonRows(current, previous),
  ];

  return {
    name: "汇总",
    rows,
    merges: [],
    widths: [
      14, 12, 14, 14, 12, 12, 14, 14, 14, 12, 14, 14, 12, 14, 14, 12, 14,
      14, 12,
    ],
  };
}

function buildPeriodTotalRows(monthlySummaries: MonthlySummary[]): SheetRow[] {
  const summary = combineMonthlySummariesForPeriod(
    "period",
    monthlySummaries,
    monthlySummaries.reduce((sum, row) => sum + row.submissionCount, 0)
  );
  const metrics = [
    { label: "总条数", value: summary.total.xTweetCount },
    { label: "总曝光", value: summary.total.xImpressions },
    { label: "总互动", value: summary.total.xEngagements },
    { label: "视频播放合计", value: summary.total.youtubeVideoViews },
    { label: "短视频播放合计（Shorts+TT）", value: summary.total.youtubeShortViews },
    { label: "直播观看合计", value: summary.total.youtubeStreamViews },
    { label: "直播次数合计", value: summary.total.youtubeStreamCount },
    { label: "合计播放数", value: summary.total.youtubeTotalPlayback },
  ];

  return metrics.map((metric) => ({
    cells: [metric.label, metric.value],
  }));
}

function buildComparisonRows(
  current: MonthlySummary | undefined,
  previous: MonthlySummary | undefined
): SheetRow[] {
  if (!current) {
    return [{ cells: ["暂无该月份数据", "", "", ""], style: 0 }];
  }

  const metrics = [
    {
      label: "X 总推文",
      value: current.total.xTweetCount,
      previous: previous?.total.xTweetCount,
    },
    {
      label: "X 总曝光",
      value: current.total.xImpressions,
      previous: previous?.total.xImpressions,
    },
    {
      label: "X 总互动",
      value: current.total.xEngagements,
      previous: previous?.total.xEngagements,
    },
    {
      label: "视频播放",
      value: current.total.youtubeVideoViews,
      previous: previous?.total.youtubeVideoViews,
    },
    {
      label: "短视频播放（Shorts+TT）",
      value: current.total.youtubeShortViews,
      previous: previous?.total.youtubeShortViews,
    },
    {
      label: "直播观看",
      value: current.total.youtubeStreamViews,
      previous: previous?.total.youtubeStreamViews,
    },
    {
      label: "直播次数",
      value: current.total.youtubeStreamCount,
      previous: previous?.total.youtubeStreamCount,
    },
    {
      label: "YouTube 登録者",
      value: current.total.youtubeSubscriberCount,
      previous: previous?.total.youtubeSubscriberCount,
    },
  ];

  return metrics.map((metric) => ({
    cells: [
      metric.label,
      metric.value,
      metric.previous ?? "",
      formatComparison(metric.value, metric.previous),
    ],
  }));
}

function formatComparison(current: number, previous?: number) {
  if (!previous) {
    return "-";
  }

  const change = (current - previous) / previous;
  const sign = change > 0 ? "+" : "";

  return `${sign}${(change * 100).toFixed(1)}%`;
}

function normalizeExportMonth(month: string, maxMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return maxMonth;
  }

  return month > maxMonth ? maxMonth : month;
}

function buildXSheet(submissions: MonthlySubmissionRow[]): SheetData {
  const rows: SheetRow[] = [];
  const merges: string[] = [];
  const monthGroups = groupSubmissionsByMonth(submissions);

  for (const [month, monthSubmissions] of monthGroups) {
    rows.push({
      cells: [
        shortMonthLabel(month),
        "",
        "手動入力",
        "アナリティクス",
        "アナリティクス",
        "手動入力",
        "アナリティクス",
      ],
      style: 1,
    });
    rows.push({
      cells: ["チーム名", "選手名", ...xFields.map((field) => field.label)],
      style: 2,
    });

    const officialRows: MonthlyPlayerRow[] = [];
    const playerRows: MonthlyPlayerRow[] = [];

    for (const submission of sortSubmissionsByTeam(monthSubmissions)) {
      const allRows = parseMonthlyPlayerRows(submission.player_rows);
      const { officialRow, playerRows: parsedPlayerRows } = splitMonthlyRows(allRows);
      const blockRows = [
        ...(officialRow ? [officialRow] : allRows.filter(isOfficialMonthlyRow)),
        ...parsedPlayerRows,
      ];
      const startRow = rows.length + 1;

      blockRows.forEach((row, index) => {
        const isOfficial = isOfficialMonthlyRow(row);

        if (isOfficial) {
          officialRows.push(row);
        } else {
          playerRows.push(row);
        }

        rows.push({
          cells: [
            index === 0 ? getTeamExportName(submission) : "",
            row.playerName || row.playerHandle || "-",
            ...xFields.map((field) => numericMonthlyValue(row[field.key])),
          ],
        });
      });

      if (blockRows.length > 1) {
        merges.push(`A${startRow}:A${startRow + blockRows.length - 1}`);
      }
    }

    rows.push(...buildTotalRows("官方合计", "选手合计", officialRows, playerRows, xFields));
    rows.push({ cells: [], style: 0 });
  }

  return {
    name: "X",
    rows,
    merges,
    widths: [14, 18, 23, 16, 16, 16, 16],
  };
}

function buildYoutubeSheet(submissions: MonthlySubmissionRow[]): SheetData {
  const rows: SheetRow[] = [];
  const merges: string[] = [];
  const monthGroups = groupSubmissionsByMonth(submissions);

  for (const [month, monthSubmissions] of monthGroups) {
    rows.push({
      cells: [
        "youtube",
        "",
        "アナリティクス",
        "アナリティクス",
        "アナリティクス",
        "アナリティクス",
        "手動入力",
        "アナリティクス",
        "アナリティクス",
        "アナリティクス",
        "手動入力",
      ],
      style: 1,
    });
    rows.push({
      cells: ["チーム名", "選手名", ...youtubeFields.map((field) => field.label)],
      style: 2,
    });
    rows.push({ cells: [shortMonthLabel(month)], style: 1 });

    const officialRows: MonthlyPlayerRow[] = [];
    const playerRows: MonthlyPlayerRow[] = [];

    for (const submission of sortSubmissionsByTeam(monthSubmissions)) {
      const allRows = parseMonthlyPlayerRows(submission.player_rows);
      const { officialRow, playerRows: parsedPlayerRows } = splitMonthlyRows(allRows);
      const blockRows = [
        ...(officialRow ? [officialRow] : allRows.filter(isOfficialMonthlyRow)),
        ...parsedPlayerRows,
      ];
      const startRow = rows.length + 1;

      blockRows.forEach((row, index) => {
        const isOfficial = isOfficialMonthlyRow(row);

        if (isOfficial) {
          officialRows.push(row);
        } else {
          playerRows.push(row);
        }

        rows.push({
          cells: [
            index === 0 ? getTeamExportName(submission) : "",
            row.playerName || row.playerHandle || "-",
            ...youtubeFields.map((field) => numericMonthlyValue(row[field.key])),
          ],
        });
      });

      if (blockRows.length > 1) {
        merges.push(`A${startRow}:A${startRow + blockRows.length - 1}`);
      }
    }

    rows.push(...buildTotalRows("官推合计", "选手合计", officialRows, playerRows, youtubeFields));
    rows.push({ cells: [], style: 0 });
  }

  return {
    name: "youtube",
    rows,
    merges,
    widths: [14, 18, 18, 18, 18, 18, 14, 14, 18, 20, 14],
  };
}

function buildTotalRows(
  officialLabel: string,
  playerLabel: string,
  officialRows: MonthlyPlayerRow[],
  playerRows: MonthlyPlayerRow[],
  fields: Array<{ key: keyof MonthlyPlayerRow; label: string }>
): SheetRow[] {
  return [
    {
      cells: [
        officialLabel,
        "",
        ...fields.map((field) => sumRows(officialRows, field.key)),
      ],
      style: 3,
    },
    {
      cells: [
        playerLabel,
        "",
        ...fields.map((field) => sumRows(playerRows, field.key)),
      ],
      style: 4,
    },
    {
      cells: [
        "总合计",
        "",
        ...fields.map(
          (field) => sumRows(officialRows, field.key) + sumRows(playerRows, field.key)
        ),
      ],
      style: 5,
    },
  ];
}

function groupSubmissionsByMonth(submissions: MonthlySubmissionRow[]) {
  const groups = new Map<string, MonthlySubmissionRow[]>();

  for (const submission of submissions) {
    const month = submission.target_month;
    groups.set(month, [...(groups.get(month) || []), submission]);
  }

  return Array.from(groups.entries()).sort(([left], [right]) =>
    left.localeCompare(right)
  );
}

function sortSubmissionsByTeam(submissions: MonthlySubmissionRow[]) {
  return [...submissions].sort((left, right) =>
    getTeamExportName(left).localeCompare(getTeamExportName(right))
  );
}

function getTeamExportName(submission: MonthlySubmissionRow) {
  return submission.teams?.name || submission.teams?.short_name || "-";
}

function shortMonthLabel(month: string) {
  const [, monthNumber] = month.split("-");

  return monthNumber ? `${Number(monthNumber)}月` : formatMonthLabel(month);
}

function sumRows(rows: MonthlyPlayerRow[], key: keyof MonthlyPlayerRow) {
  return rows.reduce((sum, row) => sum + numericMonthlyValue(row[key]), 0);
}

function createXlsxWorkbook(sheets: SheetData[]) {
  const files = [
    {
      path: "[Content_Types].xml",
      content: contentTypesXml(sheets.length),
    },
    {
      path: "_rels/.rels",
      content: rootRelsXml(),
    },
    {
      path: "xl/workbook.xml",
      content: workbookXml(sheets),
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: workbookRelsXml(sheets.length),
    },
    {
      path: "xl/styles.xml",
      content: stylesXml(),
    },
    ...sheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheet),
    })),
  ];

  return zipStore(
    files.map((file) => ({
      path: file.path,
      data: Buffer.from(file.content, "utf8"),
    }))
  );
}

function worksheetXml(sheet: SheetData) {
  const maxColumns = Math.max(
    sheet.widths.length,
    ...sheet.rows.map((row) => row.cells.length),
    1
  );
  const maxRows = Math.max(sheet.rows.length, 1);
  const columns = sheet.widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
    )
    .join("");
  const rowXml = sheet.rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row.cells
        .map((value, cellIndex) =>
          cellXml(value, rowNumber, cellIndex + 1, row.style || 0)
        )
        .join("");

      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");
  const mergeXml =
    sheet.merges.length > 0
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
          .map((ref) => `<mergeCell ref="${ref}"/>`)
          .join("")}</mergeCells>`
      : "";

  return xmlDocument(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <dimension ref="A1:${columnName(maxColumns)}${maxRows}"/>
      <sheetViews><sheetView workbookViewId="0"/></sheetViews>
      <sheetFormatPr defaultRowHeight="18"/>
      <cols>${columns}</cols>
      <sheetData>${rowXml}</sheetData>
      ${mergeXml}
    </worksheet>`
  );
}

function cellXml(
  value: SheetCell,
  rowNumber: number,
  columnNumber: number,
  style: number
) {
  const ref = `${columnName(columnNumber)}${rowNumber}`;

  if (value === null || value === "") {
    return style
      ? `<c r="${ref}" s="${style}"/>`
      : "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }

  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(
    String(value)
  )}</t></is></c>`;
}

function contentTypesXml(sheetCount: number) {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) => {
    const sheetNumber = index + 1;

    return `<Override PartName="/xl/worksheets/sheet${sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }).join("");

  return xmlDocument(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      ${sheetOverrides}
    </Types>`
  );
}

function rootRelsXml() {
  return xmlDocument(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`
  );
}

function workbookXml(sheets: SheetData[]) {
  return xmlDocument(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets>
        ${sheets
          .map(
            (sheet, index) =>
              `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${
                index + 1
              }"/>`
          )
          .join("")}
      </sheets>
    </workbook>`
  );
}

function workbookRelsXml(sheetCount: number) {
  const sheetRels = Array.from({ length: sheetCount }, (_, index) => {
    const sheetNumber = index + 1;

    return `<Relationship Id="rId${sheetNumber}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetNumber}.xml"/>`;
  }).join("");

  return xmlDocument(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${sheetRels}
      <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    </Relationships>`
  );
}

function stylesXml() {
  return xmlDocument(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <fonts count="2">
        <font><sz val="11"/><name val="Calibri"/></font>
        <font><b/><sz val="11"/><name val="Calibri"/></font>
      </fonts>
      <fills count="6">
        <fill><patternFill patternType="none"/></fill>
        <fill><patternFill patternType="gray125"/></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFBBD7FF"/><bgColor indexed="64"/></patternFill></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill>
      </fills>
      <borders count="2">
        <border><left/><right/><top/><bottom/><diagonal/></border>
        <border>
          <left style="thin"><color rgb="FF808080"/></left>
          <right style="thin"><color rgb="FF808080"/></right>
          <top style="thin"><color rgb="FF808080"/></top>
          <bottom style="thin"><color rgb="FF808080"/></bottom>
          <diagonal/>
        </border>
      </borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="6">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
        <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1"/>
        <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1"/>
        <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFill="1" applyFont="1"/>
        <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFill="1" applyFont="1"/>
        <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1"/>
      </cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`
  );
}

function xmlDocument(content: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content.replace(
    />\s+</g,
    "><"
  )}`;
}

function columnName(columnNumber: number) {
  let number = columnNumber;
  let name = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function zipStore(files: Array<{ path: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const crc = crc32(file.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(file.data.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, file.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(file.data.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + file.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(files.length, 8);
  endOfCentralDirectory.writeUInt16LE(files.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});
