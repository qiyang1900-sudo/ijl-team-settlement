import { createClient } from "@supabase/supabase-js";
import { parseMonthlyPlayerRows } from "@/lib/monthly-data";

type MonthlySubmissionRow = {
  target_month: string;
  player_rows: unknown;
  teams: {
    name: string | null;
    short_name: string | null;
  } | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fromMonth = url.searchParams.get("from") || "0000-01";
  const toMonth = url.searchParams.get("to") || "9999-12";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response("Supabase 环境变量没有设置成功。", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
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
    .gte("target_month", fromMonth)
    .lte("target_month", toMonth)
    .order("target_month", { ascending: true });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const lines = [
    [
      "月份",
      "战队",
      "选手",
      "給与",
      "X曝光",
      "YouTube总曝光",
      "YouTube登録者",
    ],
  ];

  for (const submission of (data || []) as unknown as MonthlySubmissionRow[]) {
    const teamName = submission.teams?.name || "";
    const teamShortName = submission.teams?.short_name || "";

    for (const player of parseMonthlyPlayerRows(submission.player_rows)) {
      lines.push([
        submission.target_month,
        teamShortName ? `${teamName} (${teamShortName})` : teamName,
        player.playerName,
        player.salaryAmount || "0",
        player.xImpressions || "0",
        player.youtubeTotalImpressions || "0",
        player.youtubeSubscriberCount || "0",
      ]);
    }
  }

  const csv = lines.map((line) => line.map(escapeCsv).join(",")).join("\n");

  return new Response(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        `league-summary_${fromMonth}_${toMonth}.csv`
      )}`,
    },
  });
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}
