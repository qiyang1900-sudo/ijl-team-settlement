import { createSupabaseServerClient } from "@/lib/supabase-server";
import historyData from "@/lib/historical-monthly-import-data.json";
import { normalizePlayerLookupKey } from "@/lib/monthly-import";

export const runtime = "nodejs";

type HistoryPlayer = {
  handle: string;
  currentTeamShortName: string;
  sortOrder: number;
};

type HistorySubmission = {
  targetMonth: string;
  teamShortName: string;
  status: string;
  playerRows: unknown[];
};

type HistoryPayload = {
  version: string;
  retiredPlayers: HistoryPlayer[];
  submissions: HistorySubmission[];
};

type PlayerRecord = {
  id: string;
  handle: string | null;
};

type HistoryPlayerRow = Record<string, unknown> & {
  playerId?: string;
  playerHandle?: string;
  playerName?: string;
  playerRole?: string;
};

const retiredTeamLabel = "已退役";
const officialPlayerHandle = "__official_account__";

export async function POST(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("confirm") !== "import-history") {
    return Response.json(
      { error: "confirm=import-history が必要です。" },
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

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey, serviceRoleKey);
  const payload = historyData as HistoryPayload;
  const now = new Date().toISOString();

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, short_name");

  if (teamsError) {
    return Response.json({ error: teamsError.message }, { status: 500 });
  }

  const teamIds = new Map(
    (teams || []).map((team) => [String(team.short_name || ""), team.id])
  );
  const missingTeams = Array.from(
    new Set(
      payload.submissions
        .map((submission) => submission.teamShortName)
        .filter((shortName) => !teamIds.has(shortName))
    )
  );

  if (missingTeams.length > 0) {
    return Response.json(
      { error: "找不到这些战队。", missingTeams },
      { status: 500 }
    );
  }

  const retiredRows = payload.retiredPlayers.map((player) => ({
    handle: player.handle,
    reading: null,
    position_label: "退役",
    roster_role: "退役",
    current_team_id: null,
    current_team_short_name: player.currentTeamShortName || retiredTeamLabel,
    sort_order: player.sortOrder,
    is_active: true,
    updated_at: now,
  }));

  const { error: retiredError } = await supabase
    .from("league_players")
    .upsert(retiredRows, { onConflict: "handle" });

  if (retiredError) {
    return Response.json({ error: retiredError.message }, { status: 500 });
  }

  let playerLookup = await loadPlayerLookup(supabase);
  const missingHistoryHandles = collectHistoryPlayerHandles(payload.submissions).filter(
    (handle) => !playerLookup.has(normalizePlayerLookupKey(handle))
  );

  if (missingHistoryHandles.length > 0) {
    const { error: missingPlayerError } = await supabase
      .from("league_players")
      .upsert(
        missingHistoryHandles.map((handle, index) => ({
          handle,
          reading: null,
          position_label: "退役",
          roster_role: "退役",
          current_team_id: null,
          current_team_short_name: retiredTeamLabel,
          sort_order: 9500 + index,
          is_active: true,
          updated_at: now,
        })),
        { onConflict: "handle" }
      );

    if (missingPlayerError) {
      return Response.json({ error: missingPlayerError.message }, { status: 500 });
    }

    playerLookup = await loadPlayerLookup(supabase);
  }

  const submissionRows = payload.submissions.map((submission) => ({
    team_id: teamIds.get(submission.teamShortName),
    target_month: submission.targetMonth,
    status: submission.status,
    player_rows: hydrateHistoryPlayerRows(submission.playerRows, playerLookup),
    return_reason: null,
    submitted_at: now,
    reviewing_at: now,
    approved_at: now,
    updated_at: now,
  }));

  for (let index = 0; index < submissionRows.length; index += 30) {
    const chunk = submissionRows.slice(index, index + 30);
    const { error } = await supabase
      .from("monthly_data_submissions")
      .upsert(chunk, { onConflict: "team_id,target_month" });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({
    ok: true,
    version: payload.version,
    retiredPlayers: retiredRows.length,
    autoCreatedHistoryPlayers: missingHistoryHandles.length,
    submissions: submissionRows.length,
    playerRows: payload.submissions.reduce(
      (sum, submission) => sum + submission.playerRows.length,
      0
    ),
  });
}

async function loadPlayerLookup(
  supabase: ReturnType<typeof createSupabaseServerClient>
) {
  const { data, error } = await supabase.from("league_players").select("id, handle");

  if (error) {
    throw new Error(error.message);
  }

  const entries: Array<[string, PlayerRecord]> = [];

  for (const player of (data || []) as PlayerRecord[]) {
    const key = normalizePlayerLookupKey(player.handle);

    if (key) {
      entries.push([key, player]);
    }
  }

  return new Map(entries);
}

function collectHistoryPlayerHandles(submissions: HistorySubmission[]) {
  const handles = new Map<string, string>();

  for (const submission of submissions) {
    for (const row of submission.playerRows) {
      const handle = getHistoryPlayerHandle(row as HistoryPlayerRow);
      const key = normalizePlayerLookupKey(handle);

      if (key && !handles.has(key)) {
        handles.set(key, handle);
      }
    }
  }

  return Array.from(handles.values());
}

function hydrateHistoryPlayerRows(
  rows: unknown[],
  playerLookup: Map<string, PlayerRecord>
) {
  return rows.map((row) => {
    const monthlyRow = row as HistoryPlayerRow;
    const handle = getHistoryPlayerHandle(monthlyRow);

    if (!handle) {
      return monthlyRow;
    }

    const player = playerLookup.get(normalizePlayerLookupKey(handle));

    return {
      ...monthlyRow,
      playerId: player?.id || monthlyRow.playerId || "",
      playerHandle: player?.handle || handle,
    };
  });
}

function getHistoryPlayerHandle(row: HistoryPlayerRow) {
  if (isOfficialHistoryRow(row)) {
    return "";
  }

  const handle = String(row.playerHandle || "").trim();

  if (handle && handle !== officialPlayerHandle) {
    return handle;
  }

  const playerName = String(row.playerName || "").trim();
  const [, prefixedHandle] = playerName.match(/^(?:已退役|[A-Za-z0-9]+)_(.+)$/) || [];

  return prefixedHandle || playerName;
}

function isOfficialHistoryRow(row: HistoryPlayerRow) {
  return (
    row.playerRole === "official_account" ||
    row.playerHandle === officialPlayerHandle ||
    String(row.playerName || "").includes("公式")
  );
}
