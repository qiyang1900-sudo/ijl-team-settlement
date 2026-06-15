import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  MonthlyPlayerRow,
  createOfficialMonthlyRow,
  emptyMonthlyPlayerRow,
  isOfficialMonthlyRow,
  parseMonthlyPlayerRows,
} from "@/lib/monthly-data";
import {
  MonthlyImportDataType,
  MonthlyImportMode,
  RawMonthlyImportRow,
  buildTeamAliases,
  isBlankImportValue,
  monthlyImportFieldSets,
  normalizePlayerLookupKey,
  normalizeTeamLookupKey,
  parseMonthlyImportText,
} from "@/lib/monthly-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TeamRecord = {
  id: string;
  name: string | null;
  short_name: string | null;
};

type PlayerRecord = {
  id: string;
  handle: string | null;
  reading: string | null;
  position_label: string | null;
  roster_role: string | null;
  current_team_id: string | null;
  current_team_short_name: string | null;
  sort_order: number | null;
};

type ExistingSubmissionRecord = {
  id: string;
  team_id: string;
  target_month: string;
  status: string | null;
  player_rows: unknown;
};

type ImportPayload = {
  rawText?: string;
  targetMonth?: string;
  dataType?: MonthlyImportDataType;
  mode?: MonthlyImportMode;
  dryRun?: boolean;
};

type EnrichedImportRow = {
  raw: RawMonthlyImportRow;
  team: TeamRecord | null;
  player: PlayerRecord | null;
  warnings: string[];
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as ImportPayload;
    const rawText = String(payload.rawText || "");
    const targetMonth = String(payload.targetMonth || "");
    const dataType = normalizeImportDataType(payload.dataType);
    const mode = normalizeImportMode(payload.mode);
    const dryRun = payload.dryRun !== false;

    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      return Response.json(
        { error: "请选择有效的目标月份。" },
        { status: 400 }
      );
    }

    if (!rawText.trim()) {
      return Response.json(
        { error: "请先粘贴需要导入的表格内容。" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json(
        { error: "Supabase 环境变量没有设置成功。" },
        { status: 500 }
      );
    }

    const supabase = createSupabaseServerClient(
      supabaseUrl,
      supabaseAnonKey,
      serviceRoleKey
    );
    const parsed = parseMonthlyImportText(rawText, dataType);
    const [{ data: teams, error: teamError }, { data: players, error: playerError }] =
      await Promise.all([
        supabase
          .from("teams")
          .select("id, name, short_name")
          .order("short_name", { ascending: true }),
        supabase
          .from("league_players")
          .select(
            "id, handle, reading, position_label, roster_role, current_team_id, current_team_short_name, sort_order"
          ),
      ]);

    if (teamError) {
      return Response.json({ error: teamError.message }, { status: 500 });
    }

    if (playerError) {
      return Response.json(
        {
          error: playerError.message,
          hint: "请先在 Supabase 执行 supabase/player-management.sql。",
        },
        { status: 500 }
      );
    }

    const safeTeams = (teams || []) as TeamRecord[];
    let safePlayers = (players || []) as PlayerRecord[];
    let enrichedRows = enrichRows(parsed.rows, safeTeams, safePlayers);
    const previewBeforeWrite = await buildPreview({
      supabase,
      parsedRows: parsed.rows,
      enrichedRows,
      targetMonth,
      dataType,
      mode,
      skippedRows: parsed.skippedRows,
      totals: parsed.totals,
    });

    if (dryRun) {
      return Response.json({
        ok: true,
        dryRun: true,
        preview: previewBeforeWrite,
      });
    }

    const rowsWithMissingTeams = enrichedRows.filter((row) => !row.team);

    if (rowsWithMissingTeams.length > 0) {
      return Response.json(
        {
          error: "有战队无法识别，已停止导入。",
          preview: previewBeforeWrite,
        },
        { status: 400 }
      );
    }

    const missingPlayers = getMissingPlayers(enrichedRows);
    let createdPlayers = 0;

    if (missingPlayers.length > 0) {
      const now = new Date().toISOString();
      const { data: created, error: createPlayerError } = await supabase
        .from("league_players")
        .upsert(
          missingPlayers.map((row, index) => ({
            handle: row.playerHandle,
            reading: null,
            position_label: "历史数据",
            roster_role: "历史数据",
            current_team_id: null,
            current_team_short_name: row.teamShortName,
            sort_order: 9000 + index,
            is_active: true,
            updated_at: now,
          })),
          { onConflict: "handle" }
        )
        .select(
          "id, handle, reading, position_label, roster_role, current_team_id, current_team_short_name, sort_order"
        );

      if (createPlayerError) {
        return Response.json(
          { error: createPlayerError.message, preview: previewBeforeWrite },
          { status: 500 }
        );
      }

      createdPlayers = created?.length || 0;
      safePlayers = mergePlayers(safePlayers, (created || []) as PlayerRecord[]);
      enrichedRows = enrichRows(parsed.rows, safeTeams, safePlayers);
    }

    const importResult = await importMonthlyRows({
      supabase,
      enrichedRows,
      targetMonth,
      dataType,
      mode,
    });
    const previewAfterWrite = await buildPreview({
      supabase,
      parsedRows: parsed.rows,
      enrichedRows,
      targetMonth,
      dataType,
      mode,
      skippedRows: parsed.skippedRows,
      totals: parsed.totals,
    });

    return Response.json({
      ok: true,
      dryRun: false,
      preview: previewAfterWrite,
      result: {
        ...importResult,
        createdPlayers,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "导入失败。" },
      { status: 500 }
    );
  }
}

function normalizeImportDataType(value: unknown): MonthlyImportDataType {
  return value === "youtube" ? "youtube" : "x";
}

function normalizeImportMode(value: unknown): MonthlyImportMode {
  return value === "overwrite" ? "overwrite" : "fill";
}

function enrichRows(
  rows: RawMonthlyImportRow[],
  teams: TeamRecord[],
  players: PlayerRecord[]
): EnrichedImportRow[] {
  const teamLookup = buildTeamLookup(teams);
  const playerLookup = buildPlayerLookup(players);

  return rows.map((raw) => {
    const team = teamLookup.get(normalizeTeamLookupKey(raw.teamInput)) || null;
    const player = raw.isOfficial
      ? null
      : playerLookup.get(normalizePlayerLookupKey(raw.playerHandle)) || null;
    const warnings: string[] = [];

    if (!team) {
      warnings.push(`无法识别战队：${raw.teamInput}`);
    }

    if (!raw.isOfficial && !player) {
      warnings.push(`导入时会新增历史选手：${raw.playerHandle || raw.accountName}`);
    }

    if (raw.isEmptyMetrics) {
      warnings.push("这一行没有数值，会按空数据导入。");
    }

    return { raw, team, player, warnings };
  });
}

function buildTeamLookup(teams: TeamRecord[]) {
  const lookup = new Map<string, TeamRecord>();

  for (const team of teams) {
    const shortName = String(team.short_name || "").trim();
    const names = [
      shortName,
      team.name || "",
      ...buildTeamAliases(shortName),
    ];

    for (const name of names) {
      const key = normalizeTeamLookupKey(name);

      if (key) {
        lookup.set(key, team);
      }
    }
  }

  return lookup;
}

function buildPlayerLookup(players: PlayerRecord[]) {
  const lookup = new Map<string, PlayerRecord>();

  for (const player of players) {
    const handle = String(player.handle || "").trim();

    if (handle) {
      lookup.set(normalizePlayerLookupKey(handle), player);
    }
  }

  return lookup;
}

function getMissingPlayers(enrichedRows: EnrichedImportRow[]) {
  const missing = new Map<
    string,
    { playerHandle: string; teamShortName: string }
  >();

  for (const row of enrichedRows) {
    const handle = row.raw.playerHandle.trim();

    if (!row.team || row.raw.isOfficial || row.player || !handle) {
      continue;
    }

    const key = normalizePlayerLookupKey(handle);

    if (!missing.has(key)) {
      missing.set(key, {
        playerHandle: handle,
        teamShortName: row.team.short_name || row.raw.teamInput,
      });
    }
  }

  return Array.from(missing.values());
}

function mergePlayers(existing: PlayerRecord[], created: PlayerRecord[]) {
  const byHandle = new Map(
    existing.map((player) => [normalizePlayerLookupKey(player.handle), player])
  );

  for (const player of created) {
    byHandle.set(normalizePlayerLookupKey(player.handle), player);
  }

  return Array.from(byHandle.values());
}

async function buildPreview({
  supabase,
  parsedRows,
  enrichedRows,
  targetMonth,
  dataType,
  mode,
  skippedRows,
  totals,
}: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  parsedRows: RawMonthlyImportRow[];
  enrichedRows: EnrichedImportRow[];
  targetMonth: string;
  dataType: MonthlyImportDataType;
  mode: MonthlyImportMode;
  skippedRows: unknown[];
  totals: unknown;
}) {
  const teams = Array.from(
    new Map(
      enrichedRows
        .filter((row) => row.team)
        .map((row) => [row.team?.id, row.team as TeamRecord])
    ).values()
  );
  const existingRows = await loadExistingSubmissions(
    supabase,
    targetMonth,
    teams.map((team) => team.id)
  );
  const existingByTeamId = new Map(existingRows.map((row) => [row.team_id, row]));
  const missingTeams = Array.from(
    new Set(
      enrichedRows
        .filter((row) => !row.team)
        .map((row) => row.raw.teamInput)
    )
  );
  const missingPlayers = getMissingPlayers(enrichedRows);
  const emptyTeams = Array.from(
    new Set(
      enrichedRows
        .filter((row) => row.team && row.raw.isEmptyMetrics)
        .map((row) => row.team?.short_name || row.raw.teamInput)
    )
  );
  const actionRows = teams.map((team) => {
    const teamRows = enrichedRows.filter((row) => row.team?.id === team.id);
    const existing = existingByTeamId.get(team.id);

    return {
      teamId: team.id,
      teamName: team.name,
      teamShortName: team.short_name,
      rowCount: teamRows.length,
      officialRows: teamRows.filter((row) => row.raw.isOfficial).length,
      playerRows: teamRows.filter((row) => !row.raw.isOfficial).length,
      emptyRows: teamRows.filter((row) => row.raw.isEmptyMetrics).length,
      action: existing ? "update" : "insert",
      currentStatus: existing?.status || null,
    };
  });

  return {
    targetMonth,
    dataType,
    mode,
    parsedRowCount: parsedRows.length,
    importableRowCount: enrichedRows.filter((row) => row.team).length,
    skippedRows,
    missingTeams,
    missingPlayers,
    emptyTeams,
    actions: actionRows,
    totals,
    rows: enrichedRows.slice(0, 80).map((row) => ({
      sourceLine: row.raw.sourceLine,
      teamInput: row.raw.teamInput,
      teamShortName: row.team?.short_name || null,
      accountName: row.raw.accountName,
      playerHandle: row.raw.playerHandle,
      isOfficial: row.raw.isOfficial,
      playerMatched: Boolean(row.player || row.raw.isOfficial),
      isEmptyMetrics: row.raw.isEmptyMetrics,
      values: row.raw.values,
      warnings: row.warnings,
    })),
  };
}

async function loadExistingSubmissions(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  targetMonth: string,
  teamIds: string[]
) {
  if (teamIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("monthly_data_submissions")
    .select("id, team_id, target_month, status, player_rows")
    .eq("target_month", targetMonth)
    .in("team_id", teamIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as ExistingSubmissionRecord[];
}

async function importMonthlyRows({
  supabase,
  enrichedRows,
  targetMonth,
  dataType,
  mode,
}: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  enrichedRows: EnrichedImportRow[];
  targetMonth: string;
  dataType: MonthlyImportDataType;
  mode: MonthlyImportMode;
}) {
  const grouped = groupRowsByTeam(enrichedRows.filter((row) => row.team));
  const existingRows = await loadExistingSubmissions(
    supabase,
    targetMonth,
    Array.from(grouped.keys())
  );
  const existingByTeamId = new Map(existingRows.map((row) => [row.team_id, row]));
  const now = new Date().toISOString();
  const rows = Array.from(grouped.entries()).map(([teamId, teamRows]) => {
    const existing = existingByTeamId.get(teamId);
    const team = teamRows[0]?.team as TeamRecord;
    const incomingRows = teamRows.map((row, index) =>
      buildMonthlyRow(row, dataType, index)
    );
    const playerRows = mergeMonthlyRows({
      existingRows: parseMonthlyPlayerRows(existing?.player_rows),
      incomingRows,
      dataType,
      mode,
    });

    return {
      team_id: teamId,
      target_month: targetMonth,
      status: "approved",
      player_rows: playerRows,
      return_reason: null,
      submitted_at: existing?.id ? undefined : now,
      reviewing_at: existing?.id ? undefined : now,
      approved_at: now,
      updated_at: now,
      created_at: existing?.id ? undefined : now,
      team_short_name: team.short_name,
      action: existing ? "updated" : "inserted",
    };
  });
  const dbRows = rows.map((row) => ({
    team_id: row.team_id,
    target_month: row.target_month,
    status: row.status,
    player_rows: row.player_rows,
    return_reason: row.return_reason,
    submitted_at: row.submitted_at,
    reviewing_at: row.reviewing_at,
    approved_at: row.approved_at,
    updated_at: row.updated_at,
    created_at: row.created_at,
  }));

  for (let index = 0; index < dbRows.length; index += 30) {
    const chunk = dbRows.slice(index, index + 30);
    const { error } = await supabase
      .from("monthly_data_submissions")
      .upsert(chunk, { onConflict: "team_id,target_month" });

    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    inserted: rows.filter((row) => row.action === "inserted").length,
    updated: rows.filter((row) => row.action === "updated").length,
    teams: rows.map((row) => row.team_short_name).filter(Boolean),
  };
}

function groupRowsByTeam(rows: EnrichedImportRow[]) {
  const grouped = new Map<string, EnrichedImportRow[]>();

  for (const row of rows) {
    const teamId = row.team?.id;

    if (!teamId) {
      continue;
    }

    grouped.set(teamId, [...(grouped.get(teamId) || []), row]);
  }

  return grouped;
}

function buildMonthlyRow(
  row: EnrichedImportRow,
  dataType: MonthlyImportDataType,
  index: number
): MonthlyPlayerRow {
  const teamShortName = row.team?.short_name || row.raw.teamInput;
  const base = row.raw.isOfficial
    ? {
        ...createOfficialMonthlyRow(teamShortName, index),
        id: `official-${teamShortName}`,
        playerName: row.raw.accountName || `${teamShortName}公式`,
      }
    : {
        ...emptyMonthlyPlayerRow(index),
        id: row.player?.id
          ? `player-${row.player.id}`
          : `import-${teamShortName}-${row.raw.playerHandle || index}`,
        playerId: row.player?.id || "",
        playerHandle: row.player?.handle || row.raw.playerHandle,
        playerReading: row.player?.reading || "",
        playerPosition: row.player?.position_label || "",
        playerRole: row.player?.roster_role || "",
        playerName: `${teamShortName}_${row.player?.handle || row.raw.playerHandle}`,
      };

  const monthlyRow = {
    ...base,
  };

  for (const field of monthlyImportFieldSets[dataType]) {
    monthlyRow[field.key] = row.raw.values[field.key] || "";
  }

  return monthlyRow;
}

function mergeMonthlyRows({
  existingRows,
  incomingRows,
  dataType,
  mode,
}: {
  existingRows: MonthlyPlayerRow[];
  incomingRows: MonthlyPlayerRow[];
  dataType: MonthlyImportDataType;
  mode: MonthlyImportMode;
}) {
  const fields = monthlyImportFieldSets[dataType].map((field) => field.key);
  const mergedRows = [...existingRows];

  for (const incomingRow of incomingRows) {
    const existingIndex = mergedRows.findIndex((row) =>
      isSameMonthlyRow(row, incomingRow)
    );

    if (existingIndex < 0) {
      mergedRows.push(incomingRow);
      continue;
    }

    const nextRow = { ...mergedRows[existingIndex] };

    for (const field of fields) {
      const incomingValue = incomingRow[field] || "";

      if (mode === "overwrite") {
        nextRow[field] = incomingValue;
        continue;
      }

      if (isBlankImportValue(nextRow[field]) && !isBlankImportValue(incomingValue)) {
        nextRow[field] = incomingValue;
      }
    }

    mergedRows[existingIndex] = nextRow;
  }

  return mergedRows;
}

function isSameMonthlyRow(left: MonthlyPlayerRow, right: MonthlyPlayerRow) {
  if (isOfficialMonthlyRow(left) && isOfficialMonthlyRow(right)) {
    return true;
  }

  if (left.playerId && right.playerId && left.playerId === right.playerId) {
    return true;
  }

  const leftHandle = normalizePlayerLookupKey(left.playerHandle || left.playerName);
  const rightHandle = normalizePlayerLookupKey(right.playerHandle || right.playerName);

  return Boolean(leftHandle && rightHandle && leftHandle === rightHandle);
}
