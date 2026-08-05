import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const salaryFieldPatch = {
  salaryAmount: "",
  salaryScreenshotName: "",
  salaryScreenshotUrl: "",
  salaryScreenshotStoragePath: "",
  salaryScreenshotMimeType: "",
};

type ClearSalaryPayload = {
  teamId?: string;
  teamShortName?: string;
  targetMonth?: string;
};

type MonthlySubmissionRow = {
  id: string;
  status: string | null;
  salary_status: string | null;
  salary_submitted_at: string | null;
  salary_approved_at: string | null;
  player_rows: unknown;
};

type PlayerSalaryRow = Record<string, unknown> & {
  salaryAmount?: string;
  salaryScreenshotStoragePath?: string;
  salaryScreenshotUrl?: string;
};

type SalaryRowsSummary = {
  rows: number;
  amountTotal: number;
  screenshotCount: number;
};

export async function POST(request: Request) {
  const adminSession = await getAdminSession();

  if (!adminSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ClearSalaryPayload;

  try {
    payload = (await request.json()) as ClearSalaryPayload;
  } catch {
    return NextResponse.json(
      { error: "リクエスト内容を確認できません。" },
      { status: 400 }
    );
  }

  const teamId = String(payload.teamId || "").trim();
  const teamShortName = String(payload.teamShortName || "").trim();
  const targetMonth = String(payload.targetMonth || "").trim();

  if (!targetMonth.match(/^\d{4}-\d{2}$/)) {
    return NextResponse.json(
      { error: "対象月は YYYY-MM 形式で指定してください。" },
      { status: 400 }
    );
  }

  if (!teamId && !teamShortName) {
    return NextResponse.json(
      { error: "戦隊IDまたは戦隊略称を指定してください。" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase の管理用環境変数が設定されていません。" },
      { status: 500 }
    );
  }

  const supabase = createSupabaseServerClient(
    supabaseUrl,
    undefined,
    serviceRoleKey
  );

  let teamQuery = supabase.from("teams").select("id, name, short_name").limit(1);

  if (teamId) {
    teamQuery = teamQuery.eq("id", teamId);
  } else {
    teamQuery = teamQuery.eq("short_name", teamShortName);
  }

  const { data: team, error: teamError } = await teamQuery.maybeSingle();

  if (teamError) {
    return NextResponse.json({ error: teamError.message }, { status: 500 });
  }

  if (!team) {
    return NextResponse.json(
      { error: "対象戦隊が見つかりません。" },
      { status: 404 }
    );
  }

  const { data: submission, error: submissionError } = await supabase
    .from("monthly_data_submissions")
    .select(
      "id, status, salary_status, salary_submitted_at, salary_approved_at, player_rows"
    )
    .eq("team_id", team.id)
    .eq("target_month", targetMonth)
    .maybeSingle<MonthlySubmissionRow>();

  if (submissionError) {
    return NextResponse.json({ error: submissionError.message }, { status: 500 });
  }

  if (!submission) {
    return NextResponse.json(
      { error: "対象月の提出データが見つかりません。" },
      { status: 404 }
    );
  }

  const rows = normalizePlayerRows(submission.player_rows);
  const before = summarizeSalaryRows(rows);
  const storagePaths = rows
    .map((row) => String(row.salaryScreenshotStoragePath || "").trim())
    .filter(Boolean);
  const cleanedRows = rows.map((row) => ({
    ...row,
    ...salaryFieldPatch,
  }));

  const { data: updated, error: updateError } = await supabase
    .from("monthly_data_submissions")
    .update({
      salary_status: "not_submitted",
      salary_submitted_at: null,
      salary_reviewing_at: null,
      salary_returned_at: null,
      salary_approved_at: null,
      salary_return_reason: null,
      player_rows: cleanedRows,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submission.id)
    .select("id, status, salary_status, salary_approved_at, player_rows")
    .single<MonthlySubmissionRow>();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  let removedStoragePaths = 0;
  let storageWarning: string | null = null;

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("screenshots")
      .remove(storagePaths);

    if (storageError) {
      storageWarning = storageError.message;
    } else {
      removedStoragePaths = storagePaths.length;
    }
  }

  return NextResponse.json({
    ok: true,
    team,
    targetMonth,
    monthlyStatus: updated?.status || submission.status,
    salaryStatus: updated?.salary_status || "not_submitted",
    before,
    after: summarizeSalaryRows(normalizePlayerRows(updated?.player_rows)),
    removedStoragePaths,
    storageWarning,
  });
}

function normalizePlayerRows(value: unknown): PlayerSalaryRow[] {
  return Array.isArray(value)
    ? value.filter((row): row is PlayerSalaryRow =>
        Boolean(row && typeof row === "object")
      )
    : [];
}

function summarizeSalaryRows(rows: PlayerSalaryRow[]): SalaryRowsSummary {
  return rows.reduce<SalaryRowsSummary>(
    (summary, row) => {
      const amount = Number(String(row.salaryAmount || "").replace(/,/g, ""));
      const screenshotUrl = String(row.salaryScreenshotUrl || "").trim();

      return {
        rows: summary.rows + 1,
        amountTotal:
          summary.amountTotal + (Number.isFinite(amount) ? amount : 0),
        screenshotCount: summary.screenshotCount + (screenshotUrl ? 1 : 0),
      };
    },
    { rows: 0, amountTotal: 0, screenshotCount: 0 }
  );
}
