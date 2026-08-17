import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseMonthlyPlayerRows } from "@/lib/monthly-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmToken = "zeta-kznk-2026-08-return";
const targetMonth = "2026-08";
const targetTeamShortName = "ZETA";
const targetHandle = "Kznk";
const targetSortOrder = 808;

type PlayerRecord = {
  id: string;
  handle: string | null;
  reading: string | null;
  position_label: string | null;
  roster_role: string | null;
  current_team_id: string | null;
  current_team_short_name: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

type MonthlySubmissionRecord = {
  id: string;
  team_id: string;
  target_month: string;
  status: string | null;
  salary_status: string | null;
  player_rows: unknown;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      confirm?: string;
      dryRun?: boolean;
    };

    if (payload.confirm !== confirmToken) {
      return Response.json({ error: "confirm token 不正确。" }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
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
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, name, short_name")
      .eq("short_name", targetTeamShortName)
      .maybeSingle();

    if (teamError || !team) {
      return Response.json(
        { error: teamError?.message || "ZETA 战队不存在。" },
        { status: 404 }
      );
    }

    const { data: player, error: playerError } = await supabase
      .from("league_players")
      .select(
        "id, handle, reading, position_label, roster_role, current_team_id, current_team_short_name, sort_order, is_active"
      )
      .eq("handle", targetHandle)
      .maybeSingle();

    if (playerError || !player) {
      return Response.json(
        { error: playerError?.message || "Kznk 选手不存在。" },
        { status: 404 }
      );
    }

    const playerRecord = player as PlayerRecord;
    const { data: assignment } = await supabase
      .from("monthly_player_assignments")
      .select("id, target_month, team_id, player_id, sort_order")
      .eq("target_month", targetMonth)
      .eq("team_id", team.id)
      .eq("player_id", playerRecord.id)
      .maybeSingle();
    const { data: submission } = await supabase
      .from("monthly_data_submissions")
      .select("id, team_id, target_month, status, salary_status, player_rows")
      .eq("team_id", team.id)
      .eq("target_month", targetMonth)
      .maybeSingle();
    const submissionPreview = buildSubmissionPreview(
      submission as MonthlySubmissionRecord | null
    );

    if (payload.dryRun) {
      return Response.json({
        ok: true,
        dryRun: true,
        targetMonth,
        team,
        before: {
          player: formatPlayer(playerRecord),
          assignment: assignment || null,
          submission: submissionPreview.before,
        },
        after: {
          player: buildNextPlayer(team.id, playerRecord),
          assignment: buildNextAssignment(team.id, playerRecord.id),
          submission: submissionPreview.after,
        },
      });
    }

    const { error: playerUpdateError } = await supabase
      .from("league_players")
      .update({
        current_team_id: team.id,
        current_team_short_name: targetTeamShortName,
        position_label: null,
        roster_role: null,
        sort_order: targetSortOrder,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", playerRecord.id);

    if (playerUpdateError) {
      return Response.json({ error: playerUpdateError.message }, { status: 500 });
    }

    const { error: assignmentError } = await supabase
      .from("monthly_player_assignments")
      .upsert(buildNextAssignment(team.id, playerRecord.id), {
        onConflict: "target_month,team_id,player_id",
      });

    if (assignmentError) {
      return Response.json({ error: assignmentError.message }, { status: 500 });
    }

    if (submission && submissionPreview.nextRows) {
      const { error: submissionError } = await supabase
        .from("monthly_data_submissions")
        .update({
          player_rows: submissionPreview.nextRows,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (submission as MonthlySubmissionRecord).id);

      if (submissionError) {
        return Response.json({ error: submissionError.message }, { status: 500 });
      }
    }

    const { data: updatedPlayer } = await supabase
      .from("league_players")
      .select(
        "id, handle, reading, position_label, roster_role, current_team_id, current_team_short_name, sort_order, is_active"
      )
      .eq("id", playerRecord.id)
      .maybeSingle();
    const { data: updatedAssignment } = await supabase
      .from("monthly_player_assignments")
      .select("id, target_month, team_id, player_id, sort_order")
      .eq("target_month", targetMonth)
      .eq("team_id", team.id)
      .eq("player_id", playerRecord.id)
      .maybeSingle();

    return Response.json({
      ok: true,
      dryRun: false,
      targetMonth,
      team,
      before: {
        player: formatPlayer(playerRecord),
        assignment: assignment || null,
        submission: submissionPreview.before,
      },
      after: {
        player: updatedPlayer ? formatPlayer(updatedPlayer as PlayerRecord) : null,
        assignment: updatedAssignment || null,
        submission: submissionPreview.after,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "修正失败。" },
      { status: 500 }
    );
  }
}

function buildNextPlayer(teamId: string, player: PlayerRecord) {
  return {
    ...formatPlayer(player),
    current_team_id: teamId,
    current_team_short_name: targetTeamShortName,
    position_label: null,
    roster_role: null,
    sort_order: targetSortOrder,
    is_active: true,
  };
}

function buildNextAssignment(teamId: string, playerId: string) {
  return {
    target_month: targetMonth,
    team_id: teamId,
    player_id: playerId,
    sort_order: targetSortOrder,
    updated_at: new Date().toISOString(),
  };
}

function buildSubmissionPreview(submission: MonthlySubmissionRecord | null) {
  if (!submission) {
    return { before: null, after: null, nextRows: null };
  }

  const rows = parseMonthlyPlayerRows(submission.player_rows);
  const index = rows.findIndex((row) =>
    [row.playerId, row.playerHandle, row.playerName]
      .map((value) => normalizeLookupValue(value))
      .some((value) => value.includes("kznk"))
  );

  if (index < 0) {
    return { before: null, after: null, nextRows: null };
  }

  const before = {
    id: rows[index].id,
    playerId: rows[index].playerId || "",
    playerHandle: rows[index].playerHandle || "",
    playerName: rows[index].playerName || "",
    playerPosition: rows[index].playerPosition || "",
    playerRole: rows[index].playerRole || "",
  };
  const nextRows = rows.map((row, rowIndex) =>
    rowIndex === index
      ? {
          ...row,
          playerPosition: "",
          playerRole: "",
          playerName: `${targetTeamShortName}_${targetHandle}`,
        }
      : row
  );
  const after = {
    ...before,
    playerName: `${targetTeamShortName}_${targetHandle}`,
    playerPosition: "",
    playerRole: "",
  };

  return { before, after, nextRows };
}

function formatPlayer(player: PlayerRecord) {
  return {
    id: player.id,
    handle: player.handle,
    reading: player.reading,
    position_label: player.position_label,
    roster_role: player.roster_role,
    current_team_id: player.current_team_id,
    current_team_short_name: player.current_team_short_name,
    sort_order: player.sort_order,
    is_active: player.is_active,
  };
}

function normalizeLookupValue(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[＿_・,，.。()（）"']/g, "")
    .trim();
}
