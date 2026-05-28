import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import MonthPicker from "./MonthPicker";
import MonthlyDataForm from "./MonthlyDataForm";
import {
  MonthlyPlayerRow,
  createOfficialMonthlyRow,
  emptyMonthlyPlayerRow,
  formatMonthLabel,
  getMonthlyStatusLabel,
  getMonthlyStatusTone,
  normalizeMonthlyStatus,
  parseMonthlyPlayerRows,
  splitMonthlyRows,
} from "@/lib/monthly-data";
import { getPlayerDisplayName } from "@/lib/player-display";
import { requireTeamAccess } from "@/lib/team-auth";

type MonthlySubmissionRow = {
  id?: string | null;
  team_id?: string | null;
  target_month: string;
  status?: string | null;
  player_rows?: unknown;
  club_activity_link?: string | null;
  club_activity_image_url?: string | null;
  club_activity_image_name?: string | null;
  club_activity_image_mime_type?: string | null;
  club_activity_image_storage_path?: string | null;
  return_reason?: string | null;
  submitted_at?: string | null;
  reviewing_at?: string | null;
  returned_at?: string | null;
  approved_at?: string | null;
  updated_at?: string | null;
};
type MonthlyDataSettingRow = {
  deadline_at: string | null;
};
type TeamRecord = {
  id?: string | null;
  name?: string | null;
  short_name?: string | null;
};
type PlayerRecord = {
  id: string;
  handle: string | null;
  reading: string | null;
  position_label: string | null;
  roster_role: string | null;
  current_team_short_name: string | null;
  sort_order?: number | null;
  teams?: {
    id?: string | null;
    short_name?: string | null;
  } | { id?: string | null; short_name?: string | null }[] | null;
};
type AssignmentRecord = {
  sort_order?: number | null;
  league_players?: PlayerRecord | PlayerRecord[] | null;
};
type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: File,
        options: { contentType: string; upsert: boolean }
      ) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

const imageMaxSize = 2 * 1024 * 1024;

function getCurrentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function createStoragePath(teamId: string, targetMonth: string, fileName: string) {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `monthly-data/${teamId}/${targetMonth}-${Date.now()}-${safeFileName}`;
}

async function saveMonthlyData(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase環境変数が設定されていません。");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const storageClient =
    serviceRoleKey && supabaseUrl
      ? createClient(supabaseUrl, serviceRoleKey)
      : supabase;

  const teamId = String(formData.get("team_id") || "");
  const targetMonth =
    String(formData.get("target_month") || "") ||
    String(formData.get("selected_month") || "");
  const actionType = String(formData.get("action_type") || "draft");
  const clubActivityLink = String(formData.get("club_activity_link") || "").trim();
  const officialRows = parseMonthlyPlayerRows(formData.get("official_row"));
  const officialRow = officialRows[0] || createOfficialMonthlyRow("");
  const playerRows = parseMonthlyPlayerRows(formData.get("player_rows"));
  const nextStatus = actionType === "submit" ? "submitted" : "draft";
  const now = new Date().toISOString();

  if (!teamId || !targetMonth) {
    throw new Error("戦隊または対象月が確認できません。");
  }

  await requireTeamAccess(teamId);

  const { data: existingSubmission } = await supabase
    .from("monthly_data_submissions")
    .select("*")
    .eq("team_id", teamId)
    .eq("target_month", targetMonth)
    .maybeSingle();

  const { playerRows: existingPlayerRows } = splitMonthlyRows(
    parseMonthlyPlayerRows(existingSubmission?.player_rows)
  );
  const rowsWithScreenshots = await uploadSalaryScreenshots({
    formData,
    playerRows,
    existingPlayerRows,
    teamId,
    targetMonth,
    storageClient,
  });

  const clubActivityImage = formData.get("club_activity_image") as File | null;
  const uploadedClubActivity =
    clubActivityImage && clubActivityImage.size > 0
      ? await uploadImage({
          file: clubActivityImage,
          teamId,
          targetMonth,
          storageClient,
          prefix: "club-activity",
        })
      : null;

  const previousClubImage = {
    club_activity_image_url: existingSubmission?.club_activity_image_url || null,
    club_activity_image_name: existingSubmission?.club_activity_image_name || null,
    club_activity_image_mime_type:
      existingSubmission?.club_activity_image_mime_type || null,
    club_activity_image_storage_path:
      existingSubmission?.club_activity_image_storage_path || null,
  };

  const imagePatch = uploadedClubActivity
    ? {
        club_activity_image_url: uploadedClubActivity.fileUrl,
        club_activity_image_name: uploadedClubActivity.fileName,
        club_activity_image_mime_type: uploadedClubActivity.mimeType,
        club_activity_image_storage_path: uploadedClubActivity.storagePath,
      }
    : previousClubImage;

  const payload = {
    team_id: teamId,
    target_month: targetMonth,
    status: nextStatus,
    player_rows: [officialRow, ...rowsWithScreenshots],
    club_activity_link: clubActivityLink || null,
    return_reason: null,
    submitted_at:
      actionType === "submit"
        ? now
        : existingSubmission?.submitted_at || null,
    updated_at: now,
    ...imagePatch,
  };

  const { error } = await supabase
    .from("monthly_data_submissions")
    .upsert(payload, { onConflict: "team_id,target_month" });

  if (error) {
    throw new Error(error.message);
  }

  redirect(
    `/team/reward?teamId=${encodeURIComponent(teamId)}&month=${encodeURIComponent(
      targetMonth
    )}&result=${actionType}`
  );
}

async function cancelMonthlyDataSubmission(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase環境変数が設定されていません。");
  }

  const teamId = String(formData.get("team_id") || "");
  const targetMonth = String(formData.get("target_month") || "");

  if (!teamId || !targetMonth) {
    throw new Error("戦隊または対象月が確認できません。");
  }

  await requireTeamAccess(teamId);

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: submission, error: fetchError } = await supabase
    .from("monthly_data_submissions")
    .select("id, status")
    .eq("team_id", teamId)
    .eq("target_month", targetMonth)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!submission) {
    throw new Error("取り消し対象の月データが見つかりません。");
  }

  if (normalizeMonthlyStatus(submission.status) !== "submitted") {
    throw new Error("提出済みの月データのみ取り消しできます。");
  }

  const { error } = await supabase
    .from("monthly_data_submissions")
    .update({
      status: "draft",
      submitted_at: null,
      reviewing_at: null,
      returned_at: null,
      approved_at: null,
      return_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submission.id);

  if (error) {
    throw new Error(error.message);
  }

  redirect(
    `/team/reward?teamId=${encodeURIComponent(teamId)}&month=${encodeURIComponent(
      targetMonth
    )}&result=cancelled`
  );
}

export default async function TeamRewardPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string; month?: string; result?: string }>;
}) {
  const { teamId, month, result } = await searchParams;
  const selectedMonth =
    month ||
    new Date().toISOString().slice(0, 7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let team: TeamRecord | null = null;
  let submissions: MonthlySubmissionRow[] = [];
  let assignedPlayers: PlayerRecord[] = [];
  let playerTableError: string | null = null;
  let isUsingMonthlyAssignments = false;
  let tableError: string | null = null;
  let monthlyDeadlineAt: string | null = null;

  if (teamId && supabaseUrl && supabaseAnonKey) {
    await requireTeamAccess(teamId);

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: teamData } = await supabase
      .from("teams")
      .select("id, name, short_name")
      .eq("id", teamId)
      .maybeSingle();

    team = teamData;

    const { data, error } = await supabase
      .from("monthly_data_submissions")
      .select("*")
      .eq("team_id", teamId)
      .order("target_month", { ascending: false });

    if (error) {
      tableError = error.message;
    } else {
      submissions = data || [];
    }

    const { data: settingData } = await supabase
      .from("monthly_data_settings")
      .select("deadline_at")
      .eq("target_month", selectedMonth)
      .maybeSingle();

    monthlyDeadlineAt =
      ((settingData || null) as MonthlyDataSettingRow | null)?.deadline_at ||
      null;

    const { data: assignmentData, error: assignmentError } = await supabase
      .from("monthly_player_assignments")
      .select(
        `
        sort_order,
        league_players (
          id,
          handle,
          reading,
          position_label,
          roster_role,
          current_team_short_name,
          sort_order,
          teams:current_team_id (
            id,
            short_name
          )
        )
      `
      )
      .eq("team_id", teamId)
      .eq("target_month", selectedMonth)
      .order("sort_order", { ascending: true });

    if (assignmentError) {
      playerTableError = assignmentError.message;
    } else if (assignmentData && assignmentData.length > 0) {
      assignedPlayers = (assignmentData as unknown as AssignmentRecord[])
        .flatMap((row: AssignmentRecord) => row.league_players || [])
        .filter(Boolean) as PlayerRecord[];
      isUsingMonthlyAssignments = true;
    }

    if (assignedPlayers.length === 0) {
      const { data: currentPlayers, error: currentPlayersError } = await supabase
        .from("league_players")
        .select(
          `
          id,
          handle,
          reading,
          position_label,
          roster_role,
          current_team_short_name,
          sort_order,
          teams:current_team_id (
            id,
            short_name
          )
        `
        )
        .eq("current_team_id", teamId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (currentPlayersError) {
        playerTableError = playerTableError || currentPlayersError.message;
      } else {
        assignedPlayers = (currentPlayers || []) as unknown as PlayerRecord[];

        if (
          !assignmentError &&
          selectedMonth === getCurrentMonthValue() &&
          assignedPlayers.length > 0
        ) {
          const assignmentRows = assignedPlayers.map((player, index) => ({
            target_month: selectedMonth,
            team_id: teamId,
            player_id: player.id,
            sort_order: player.sort_order ?? index,
            updated_at: new Date().toISOString(),
          }));

          const { error: upsertError } = await supabase
            .from("monthly_player_assignments")
            .upsert(assignmentRows, {
              onConflict: "target_month,team_id,player_id",
            });

          if (!upsertError) {
            isUsingMonthlyAssignments = true;
          }
        }
      }
    }
  }

  if (!teamId) {
    return (
      <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <h1 className="text-3xl font-bold">月データ提出</h1>
          <p className="mt-4 text-rose-600">
            戦隊が選択されていません。ログインページから入り直してください。
          </p>
          <a
            href="/team/login"
            className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"
          >
            戦隊ログインへ戻る
          </a>
        </div>
      </main>
    );
  }

  const selectedSubmission =
    submissions.find((row) => row.target_month === selectedMonth) || null;
  const status = normalizeMonthlyStatus(selectedSubmission?.status);
  const { officialRow: savedOfficialRow, playerRows: savedPlayerRows } =
    splitMonthlyRows(parseMonthlyPlayerRows(selectedSubmission?.player_rows));
  const assignedPlayerRows = assignedPlayers.map((player, index) =>
    createPlayerRowFromRecord(player, index)
  );
  const officialRow =
    savedOfficialRow || createOfficialMonthlyRow(team?.short_name || "");
  const playerRows =
    assignedPlayerRows.length > 0
      ? mergePlayerRows(assignedPlayerRows, savedPlayerRows)
      : savedPlayerRows;
  const isLocked = status === "submitted" || status === "reviewing" || status === "approved";
  const dashboardHref = `/team/dashboard?teamId=${encodeURIComponent(teamId)}`;

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <a href={dashboardHref} className="text-sm font-medium text-slate-500 hover:text-slate-900">
          ← 戦隊ダッシュボードへ戻る
        </a>

        <div className="mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-3xl font-bold">月データ提出</h1>
            <p className="mt-3 text-slate-600">
              {team?.name || "読み込み中"}
              {team?.short_name ? `（${team.short_name}）` : ""} の月次データを入力・提出できます。
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <p className="text-slate-500">現在のステータス</p>
            <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getMonthlyStatusTone(status)}`}>
              {getMonthlyStatusLabel(status)}
            </span>
          </div>
        </div>

        {result === "draft" ? (
          <Notice tone="sky" text="下書きを保存しました。" />
        ) : null}

        {result === "submit" ? (
          <Notice tone="emerald" text="審査提出しました。管理者の確認をお待ちください。" />
        ) : null}

        {result === "cancelled" ? (
          <Notice tone="sky" text="提出を取り消しました。内容を修正して再提出できます。" />
        ) : null}

        {tableError ? (
          <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-800">
            <h2 className="font-bold">月データ提出テーブルがまだ準備されていません。</h2>
            <p className="mt-2 text-sm">
              管理者側で Supabase に `monthly_data_submissions` テーブルを作成すると利用できます。
            </p>
            <p className="mt-2 text-xs">{tableError}</p>
          </section>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="space-y-3">
              <MonthPicker teamId={teamId} selectedMonth={selectedMonth} />

              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="text-sm font-bold">提出履歴</h2>
                </div>
                {submissions.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500">
                    まだ提出データがありません。
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {submissions.map((submission) => (
                      <a
                        key={submission.id || submission.target_month}
                        href={`/team/reward?teamId=${encodeURIComponent(teamId)}&month=${encodeURIComponent(submission.target_month)}`}
                        className={`block px-4 py-3 text-sm hover:bg-slate-50 ${
                          submission.target_month === selectedMonth ? "bg-slate-50" : ""
                        }`}
                      >
                        <div className="font-semibold">
                          {formatMonthLabel(submission.target_month)}
                        </div>
                        <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${getMonthlyStatusTone(submission.status)}`}>
                          {getMonthlyStatusLabel(submission.status)}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </section>
            </aside>

            <div>
              {playerTableError ? (
                <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  選手管理テーブルがまだ準備されていないため、既存提出データのみ表示しています。
                  <span className="mt-1 block text-xs">{playerTableError}</span>
                </section>
              ) : null}

              {!playerTableError ? (
                <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                  {isUsingMonthlyAssignments
                    ? "この月は管理者が設定した月別選手リストを使用しています。"
                    : "この月は現在のクラブ所属リストを自動反映しています。"}
                </section>
              ) : null}

              <DeadlineNotice deadlineAt={monthlyDeadlineAt} />

              {selectedSubmission?.return_reason ? (
                <section className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800">
                  <p className="font-bold">差し戻し理由</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {selectedSubmission.return_reason}
                  </p>
                </section>
              ) : null}

              {status === "submitted" ? (
                <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p>
                      提出済みです。管理者が審査を開始する前であれば、提出を取り消して再編集できます。
                    </p>
                    <form action={cancelMonthlyDataSubmission}>
                      <input type="hidden" name="team_id" value={teamId} />
                      <input
                        type="hidden"
                        name="target_month"
                        value={selectedMonth}
                      />
                      <button className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400">
                        提出を取り消して編集する
                      </button>
                    </form>
                  </div>
                </section>
              ) : null}

              {status === "reviewing" || status === "approved" ? (
                <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                  この月は審査中、または承認済みのため編集できません。
                </section>
              ) : null}

              <MonthlyDataForm
                action={saveMonthlyData}
                teamId={teamId}
                selectedMonth={selectedMonth}
                initialOfficialRow={officialRow}
                initialPlayers={playerRows}
                clubActivityLink={selectedSubmission?.club_activity_link || ""}
                clubActivityImageUrl={selectedSubmission?.club_activity_image_url || null}
                clubActivityImageName={selectedSubmission?.club_activity_image_name || null}
                isLocked={isLocked}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function createPlayerRowFromRecord(
  player: PlayerRecord,
  index: number
): MonthlyPlayerRow {
  return {
    ...emptyMonthlyPlayerRow(index),
    id: `player-${player.id}`,
    playerId: player.id,
    playerHandle: player.handle || "",
    playerReading: player.reading || "",
    playerPosition: player.position_label || "",
    playerRole: player.roster_role || "",
    playerName: getPlayerDisplayName(player),
  };
}

function mergePlayerRows(
  assignedRows: MonthlyPlayerRow[],
  savedRows: MonthlyPlayerRow[]
) {
  const savedByPlayerId = new Map(
    savedRows
      .filter((row) => row.playerId)
      .map((row) => [String(row.playerId), row])
  );
  const savedByName = new Map(
    savedRows.map((row) => [String(row.playerName || row.playerHandle), row])
  );

  const usedSavedRows = new Set<MonthlyPlayerRow>();
  const mergedRows = assignedRows.map((assignedRow) => {
    const savedRow =
      savedByPlayerId.get(String(assignedRow.playerId || "")) ||
      savedByName.get(assignedRow.playerName) ||
      savedByName.get(String(assignedRow.playerHandle || ""));

    if (savedRow) {
      usedSavedRows.add(savedRow);
    }

    return {
      ...assignedRow,
      ...(savedRow || {}),
      id: assignedRow.id,
      playerId: assignedRow.playerId,
      playerHandle: assignedRow.playerHandle,
      playerReading: assignedRow.playerReading,
      playerPosition: assignedRow.playerPosition,
      playerRole: assignedRow.playerRole,
      playerName: assignedRow.playerName,
    };
  });

  return [
    ...mergedRows,
    ...savedRows.filter((savedRow) => !usedSavedRows.has(savedRow)),
  ];
}

async function uploadSalaryScreenshots({
  formData,
  playerRows,
  existingPlayerRows,
  teamId,
  targetMonth,
  storageClient,
}: {
  formData: FormData;
  playerRows: MonthlyPlayerRow[];
  existingPlayerRows: MonthlyPlayerRow[];
  teamId: string;
  targetMonth: string;
  storageClient: StorageClient;
}) {
  const rows = [...playerRows];

  for (let index = 0; index < rows.length; index += 1) {
    const file = formData.get(`salary_screenshot_${index}`) as File | null;

    if (!file || file.size <= 0) {
      rows[index] = {
        ...rows[index],
        salaryScreenshotName:
          rows[index].salaryScreenshotName ||
          existingPlayerRows[index]?.salaryScreenshotName ||
          "",
        salaryScreenshotUrl:
          rows[index].salaryScreenshotUrl ||
          existingPlayerRows[index]?.salaryScreenshotUrl ||
          "",
        salaryScreenshotStoragePath:
          rows[index].salaryScreenshotStoragePath ||
          existingPlayerRows[index]?.salaryScreenshotStoragePath ||
          "",
        salaryScreenshotMimeType:
          rows[index].salaryScreenshotMimeType ||
          existingPlayerRows[index]?.salaryScreenshotMimeType ||
          "",
      };
      continue;
    }

    const uploaded = await uploadImage({
      file,
      teamId,
      targetMonth,
      storageClient,
      prefix: `salary-${index + 1}`,
    });

    rows[index] = {
      ...rows[index],
      salaryScreenshotName: uploaded.fileName,
      salaryScreenshotUrl: uploaded.fileUrl,
      salaryScreenshotStoragePath: uploaded.storagePath,
      salaryScreenshotMimeType: uploaded.mimeType,
    };
  }

  return rows;
}

async function uploadImage({
  file,
  teamId,
  targetMonth,
  storageClient,
  prefix,
}: {
  file: File;
  teamId: string;
  targetMonth: string;
  storageClient: StorageClient;
  prefix: string;
}) {
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルのみアップロードできます。");
  }

  if (file.size > imageMaxSize) {
    throw new Error("画像は2MB以内にしてください。");
  }

  const storagePath = createStoragePath(teamId, targetMonth, `${prefix}-${file.name}`);
  const { error } = await storageClient.storage
    .from("screenshots")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = storageClient.storage
    .from("screenshots")
    .getPublicUrl(storagePath);

  return {
    storagePath,
    fileUrl: data.publicUrl,
    fileName: file.name,
    mimeType: file.type,
  };
}

function Notice({ text, tone }: { text: string; tone: "sky" | "emerald" }) {
  const className =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-sky-200 bg-sky-50 text-sky-800";

  return (
    <div className={`mt-5 rounded-lg border p-4 text-sm font-semibold ${className}`}>
      {text}
    </div>
  );
}

function DeadlineNotice({ deadlineAt }: { deadlineAt: string | null }) {
  if (!deadlineAt) {
    return (
      <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        提出期限はまだ設定されていません。管理者からの案内を確認してください。
      </section>
    );
  }

  const deadline = new Date(deadlineAt);
  const isOverdue = new Date().getTime() > deadline.getTime();

  return (
    <section
      className={`mb-5 rounded-lg border p-4 text-sm shadow-sm ${
        isOverdue
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      <p className="font-bold">
        月データ提出期限：{formatDeadlineDateTime(deadlineAt)}
      </p>
      <p className="mt-1">
        {isOverdue
          ? "提出期限を過ぎています。未提出または差し戻し中の場合は、早めに提出してください。"
          : "この日時までに月データを提出してください。"}
      </p>
    </section>
  );
}

function formatDeadlineDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
