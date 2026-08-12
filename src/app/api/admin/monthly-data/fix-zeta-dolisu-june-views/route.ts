import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  parseMonthlyPlayerRows,
  type MonthlyPlayerRow,
} from "@/lib/monthly-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmToken = "zeta-dolisu-2026-06-youtubeVideoViews-419448";
const targetMonth = "2026-06";
const targetTeamShortName = "ZETA";
const targetPlayerKey = "dolisu";
const correctedYoutubeVideoViews = "419448";

type MonthlySubmissionRecord = {
  id: string;
  target_month: string;
  status: string | null;
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

    const { data: submission, error: submissionError } = await supabase
      .from("monthly_data_submissions")
      .select("id, target_month, status, player_rows")
      .eq("team_id", team.id)
      .eq("target_month", targetMonth)
      .maybeSingle();

    if (submissionError || !submission) {
      return Response.json(
        { error: submissionError?.message || "ZETA 2026-06 月数据不存在。" },
        { status: 404 }
      );
    }

    const rows = parseMonthlyPlayerRows(
      (submission as MonthlySubmissionRecord).player_rows
    );
    const targetIndex = rows.findIndex(isTargetDoLisuRow);

    if (targetIndex < 0) {
      return Response.json(
        { error: "没有在 ZETA 2026-06 月数据中找到 DoLisu。" },
        { status: 404 }
      );
    }

    const before = rows[targetIndex].youtubeVideoViews || "";
    const nextRows = rows.map((row, index) =>
      index === targetIndex
        ? { ...row, youtubeVideoViews: correctedYoutubeVideoViews }
        : row
    );

    if (payload.dryRun) {
      return Response.json({
        ok: true,
        dryRun: true,
        team,
        targetMonth,
        player: describePlayerRow(rows[targetIndex]),
        before,
        after: correctedYoutubeVideoViews,
      });
    }

    const { error: updateError } = await supabase
      .from("monthly_data_submissions")
      .update({
        player_rows: nextRows,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (submission as MonthlySubmissionRecord).id);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({
      ok: true,
      dryRun: false,
      team,
      targetMonth,
      status: (submission as MonthlySubmissionRecord).status,
      player: describePlayerRow(nextRows[targetIndex]),
      before,
      after: correctedYoutubeVideoViews,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "修正失败。" },
      { status: 500 }
    );
  }
}

function isTargetDoLisuRow(row: MonthlyPlayerRow) {
  const values = [row.playerName, row.playerHandle, row.id]
    .map((value) => normalizeLookupValue(value))
    .filter(Boolean);

  return values.some((value) => value.includes(targetPlayerKey));
}

function describePlayerRow(row: MonthlyPlayerRow) {
  return {
    id: row.id,
    playerId: row.playerId || "",
    playerHandle: row.playerHandle || "",
    playerName: row.playerName || "",
    youtubeVideoViews: row.youtubeVideoViews || "",
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
