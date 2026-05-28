import { createClient } from "@supabase/supabase-js";
import historyData from "@/lib/historical-monthly-import-data.json";

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

  const supabase = createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey);
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
    current_team_short_name: player.currentTeamShortName,
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

  const submissionRows = payload.submissions.map((submission) => ({
    team_id: teamIds.get(submission.teamShortName),
    target_month: submission.targetMonth,
    status: submission.status,
    player_rows: submission.playerRows,
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
    submissions: submissionRows.length,
    playerRows: payload.submissions.reduce(
      (sum, submission) => sum + submission.playerRows.length,
      0
    ),
  });
}
