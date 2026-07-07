import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import {
  ClubActivityItem,
  getPrimaryClubActivityItem,
  parseClubActivityItems,
  serializeClubActivityItems,
} from "@/lib/club-activities";
import MonthPicker from "./MonthPicker";
import MonthlyDataForm, {
  type MonthlyDataActionState,
} from "./MonthlyDataForm";
import {
  MonthlyPlayerRow,
  createOfficialMonthlyRow,
  emptyMonthlyPlayerRow,
  formatMonthLabel,
  getMonthlyStatusLabel,
  getMonthlyStatusTone,
  getSalaryScreenshotSummary,
  hasMonthlyMetricScreenshot,
  isMonthlyDataScreenshotRequiredMonth,
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
  salary_status?: string | null;
  player_rows?: unknown;
  club_activity_link?: string | null;
  club_activity_image_url?: string | null;
  club_activity_image_name?: string | null;
  club_activity_image_mime_type?: string | null;
  club_activity_image_storage_path?: string | null;
  return_reason?: string | null;
  salary_return_reason?: string | null;
  submitted_at?: string | null;
  reviewing_at?: string | null;
  returned_at?: string | null;
  approved_at?: string | null;
  salary_submitted_at?: string | null;
  salary_reviewing_at?: string | null;
  salary_returned_at?: string | null;
  salary_approved_at?: string | null;
  updated_at?: string | null;
};
type MonthlyDataSettingRow = {
  target_month?: string | null;
  deadline_at: string | null;
  salary_screenshot_deadline_at?: string | null;
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
const monthlySubmissionStartMonth = "2026-06";

function getCurrentMonthValue() {
  return getTokyoMonthValue(new Date());
}

function createStoragePath(teamId: string, targetMonth: string, fileName: string) {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `monthly-data/${teamId}/${targetMonth}-${Date.now()}-${safeFileName}`;
}

function buildMonthlyDataActionError(
  error: unknown,
  actionType?: string
): MonthlyDataActionState {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "保存できませんでした。入力内容と画像サイズを確認してください。";
  const label = actionType?.startsWith("salary_screenshots")
    ? "給与スクリーンショット"
    : "月データ";

  return {
    status: "error",
    message: `${label}を保存できませんでした：${message}`,
    submittedAt: Date.now(),
  };
}

function getMonthlyDataActionSuccessMessage(actionType: string) {
  if (actionType === "submit") {
    return "月データを審査提出しました。";
  }

  if (actionType === "salary_screenshots_draft") {
    return "給与スクリーンショットの下書きを保存しました。";
  }

  if (actionType === "salary_screenshots_submit") {
    return "給与スクリーンショットを審査提出しました。";
  }

  return "月データの下書きを保存しました。";
}

async function saveMonthlyData(
  _state: MonthlyDataActionState,
  formData: FormData
): Promise<MonthlyDataActionState> {
  "use server";

  const teamId = String(formData.get("team_id") || "");
  const targetMonth =
    String(formData.get("target_month") || "") ||
    String(formData.get("selected_month") || "");
  const actionType = String(formData.get("action_type") || "draft");

  if (!teamId || !targetMonth) {
    return buildMonthlyDataActionError(
      "戦隊または対象月が確認できません。",
      actionType
    );
  }

  await requireTeamAccess(teamId);

  try {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase環境変数が設定されていません。");
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
  const storageClient =
    serviceRoleKey && supabaseUrl
      ? createSupabaseServerClient(supabaseUrl, undefined, serviceRoleKey)
      : supabase;

  const clubActivityItems = parseClubActivityItems({
    link: formData.get("club_activity_items"),
    keepEmpty: true,
  });
  const officialRows = parseMonthlyPlayerRows(formData.get("official_row"));
  const officialRow = officialRows[0] || createOfficialMonthlyRow("");
  const playerRows = parseMonthlyPlayerRows(formData.get("player_rows"));
  const isSalaryScreenshotAction = actionType.startsWith("salary_screenshots");
  const isMonthlySubmitAction = actionType === "submit";
  const requiresMetricScreenshots =
    isMonthlySubmitAction && isMonthlyDataScreenshotRequiredMonth(targetMonth);
  const now = new Date().toISOString();

  const { data: existingSubmission } = await supabase
    .from("monthly_data_submissions")
    .select("*")
    .eq("team_id", teamId)
    .eq("target_month", targetMonth)
    .maybeSingle();
  const nextStatus = isSalaryScreenshotAction
    ? normalizeMonthlyStatus(existingSubmission?.status)
    : actionType === "submit"
      ? "submitted"
      : "draft";
  const nextSalaryStatus = isSalaryScreenshotAction
    ? actionType === "salary_screenshots_submit"
      ? "submitted"
      : "draft"
    : normalizeMonthlyStatus(existingSubmission?.salary_status);

  const { officialRow: existingOfficialRow, playerRows: existingPlayerRows } =
    splitMonthlyRows(
      parseMonthlyPlayerRows(existingSubmission?.player_rows)
    );
  const officialRowForPayload = isSalaryScreenshotAction
    ? existingOfficialRow || officialRow
    : await uploadMetricScreenshotsForRow({
        formData,
        row: carryMetricScreenshots({
          row: officialRow,
          existingRow: existingOfficialRow,
        }),
        existingRow: existingOfficialRow,
        teamId,
        targetMonth,
        storageClient,
        fileKeySuffix: "official",
        uploadPrefixSuffix: "official",
      });
  const rowsForPayload = isSalaryScreenshotAction
    ? mergeSalaryRowsOnly({
        salaryRows: await uploadSalaryScreenshots({
          formData,
          playerRows,
          existingPlayerRows,
          teamId,
          targetMonth,
          storageClient,
        }),
        existingPlayerRows,
      })
    : mergeMonthlyRowsPreservingSalary({
        monthlyRows: playerRows,
        existingPlayerRows,
      });
  const monthlyRowsForPayload = isSalaryScreenshotAction
    ? rowsForPayload
    : await uploadMetricScreenshotsForPlayers({
        formData,
        rows: rowsForPayload,
        existingPlayerRows,
        teamId,
        targetMonth,
        storageClient,
      });

  if (!isSalaryScreenshotAction && requiresMetricScreenshots) {
    validateRequiredMetricScreenshots({
      officialRow: officialRowForPayload,
      playerRows: monthlyRowsForPayload,
    });
  }

  const uploadedClubActivityItems = isSalaryScreenshotAction
    ? null
    : await uploadClubActivityImages({
        formData,
        items: clubActivityItems,
        teamId,
        targetMonth,
        storageClient,
      });
  const primaryClubActivity = uploadedClubActivityItems
    ? getPrimaryClubActivityItem(uploadedClubActivityItems)
    : null;

  const payload = {
    team_id: teamId,
    target_month: targetMonth,
    status: nextStatus,
    salary_status: nextSalaryStatus,
    player_rows: [
      officialRowForPayload,
      ...monthlyRowsForPayload,
    ],
    club_activity_link: isSalaryScreenshotAction
      ? existingSubmission?.club_activity_link || null
      : serializeClubActivityItems(uploadedClubActivityItems || []),
    club_activity_image_url: isSalaryScreenshotAction
      ? existingSubmission?.club_activity_image_url || null
      : primaryClubActivity?.imageUrl || null,
    club_activity_image_name: isSalaryScreenshotAction
      ? existingSubmission?.club_activity_image_name || null
      : primaryClubActivity?.imageName || null,
    club_activity_image_mime_type: isSalaryScreenshotAction
      ? existingSubmission?.club_activity_image_mime_type || null
      : primaryClubActivity?.imageMimeType || null,
    club_activity_image_storage_path: isSalaryScreenshotAction
      ? existingSubmission?.club_activity_image_storage_path || null
      : primaryClubActivity?.imageStoragePath || null,
    return_reason: isSalaryScreenshotAction
      ? existingSubmission?.return_reason || null
      : null,
    salary_return_reason:
      isSalaryScreenshotAction && actionType === "salary_screenshots_submit"
        ? null
        : existingSubmission?.salary_return_reason || null,
    submitted_at:
      actionType === "submit"
        ? now
        : existingSubmission?.submitted_at || null,
    reviewing_at: existingSubmission?.reviewing_at || null,
    returned_at: existingSubmission?.returned_at || null,
    approved_at: existingSubmission?.approved_at || null,
    salary_submitted_at:
      actionType === "salary_screenshots_submit"
        ? now
        : existingSubmission?.salary_submitted_at || null,
    salary_reviewing_at: existingSubmission?.salary_reviewing_at || null,
    salary_returned_at: existingSubmission?.salary_returned_at || null,
    salary_approved_at: existingSubmission?.salary_approved_at || null,
    updated_at: now,
  };

  const { error } = await supabase
    .from("monthly_data_submissions")
    .upsert(payload, { onConflict: "team_id,target_month" });

  if (error) {
    throw new Error(error.message);
  }

  return {
    status: "success",
    message: getMonthlyDataActionSuccessMessage(actionType),
    redirectTo: `/team/reward?teamId=${encodeURIComponent(teamId)}&month=${encodeURIComponent(
      targetMonth
    )}&result=${actionType}`,
    submittedAt: Date.now(),
  };
  } catch (error) {
    return buildMonthlyDataActionError(error, actionType);
  }
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

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
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
  const requestedMonth = normalizeMonthValue(month);
  let selectedMonth = requestedMonth || getDefaultRewardSelectedMonth();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let team: TeamRecord | null = null;
  let submissions: MonthlySubmissionRow[] = [];
  let monthlySettings: MonthlyDataSettingRow[] = [];
  let assignedPlayers: PlayerRecord[] = [];
  let playerTableError: string | null = null;
  let isUsingMonthlyAssignments = false;
  let tableError: string | null = null;
  let monthlyDeadlineAt = buildDefaultMonthlyDeadlineAt(selectedMonth);
  let salaryScreenshotDeadlineAt =
    buildDefaultSalaryScreenshotDeadlineAt(selectedMonth);

  if (teamId && supabaseUrl && supabaseAnonKey) {
    await requireTeamAccess(teamId);

    const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);

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

    const { data: settingsData } = await supabase
      .from("monthly_data_settings")
      .select("*");

    monthlySettings = (settingsData || []) as MonthlyDataSettingRow[];

    if (!requestedMonth) {
      selectedMonth = getDefaultRewardSelectedMonth({
        submissions,
        settings: monthlySettings,
      });
    }

    const settingData =
      monthlySettings.find((setting) => setting.target_month === selectedMonth) ||
      null;

    monthlyDeadlineAt =
      ((settingData || null) as MonthlyDataSettingRow | null)?.deadline_at ||
      buildDefaultMonthlyDeadlineAt(selectedMonth);
    salaryScreenshotDeadlineAt =
      ((settingData || null) as MonthlyDataSettingRow | null)
        ?.salary_screenshot_deadline_at ||
      buildDefaultSalaryScreenshotDeadlineAt(selectedMonth);

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
  const salaryStatus = normalizeMonthlyStatus(selectedSubmission?.salary_status);
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
  const salaryScreenshotSummary = getSalaryScreenshotSummary(playerRows);
  const clubActivityItems = parseClubActivityItems({
    link: selectedSubmission?.club_activity_link,
    imageUrl: selectedSubmission?.club_activity_image_url,
    imageName: selectedSubmission?.club_activity_image_name,
    imageMimeType: selectedSubmission?.club_activity_image_mime_type,
    imageStoragePath: selectedSubmission?.club_activity_image_storage_path,
  });
  const isMonthlyDataLocked =
    status === "submitted" || status === "reviewing" || status === "approved";
  const isSalaryLocked =
    salaryStatus === "submitted" ||
    salaryStatus === "reviewing" ||
    salaryStatus === "approved";
  const canSaveSalaryScreenshots = !isSalaryLocked;
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

          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm sm:grid-cols-2">
            <div>
              <p className="text-slate-500">月データステータス</p>
              <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getMonthlyStatusTone(status)}`}>
                {getMonthlyStatusLabel(status)}
              </span>
            </div>
            <div>
              <p className="text-slate-500">給与ステータス</p>
              <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getMonthlyStatusTone(salaryStatus)}`}>
                {getMonthlyStatusLabel(salaryStatus)}
              </span>
            </div>
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

        {result === "salary_screenshots_draft" ? (
          <Notice tone="sky" text="給与スクリーンショットの下書きを保存しました。" />
        ) : null}

        {result === "salary_screenshots_submit" ? (
          <Notice tone="emerald" text="給与スクリーンショットを審査提出しました。" />
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
                          月：{getMonthlyStatusLabel(submission.status)}
                        </span>
                        <span className={`mt-2 ml-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${getMonthlyStatusTone(normalizeMonthlyStatus(submission.salary_status))}`}>
                          給与：{getMonthlyStatusLabel(submission.salary_status)}
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

              <div className="mb-5 grid gap-3 md:grid-cols-2">
                <DeadlineNotice
                  label="月データ提出期限"
                  deadlineAt={monthlyDeadlineAt}
                  helpText="この日時までに月データを提出してください。"
                  overdueText="提出期限を過ぎています。未提出または差し戻し中の場合は、早めに提出してください。"
                />
                <DeadlineNotice
                  label="給与スクリーンショット提出期限"
                  deadlineAt={salaryScreenshotDeadlineAt}
                  helpText="給与スクリーンショットはこの日時までに補足提出してください。"
                  overdueText="給与スクリーンショットの提出期限を過ぎています。未提出の場合は早めにアップロードしてください。"
                />
              </div>

              <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-slate-900">
                      給与スクリーンショット提出状況
                    </p>
                    <p className="mt-1">
                      {salaryScreenshotSummary.label}
                      {salaryScreenshotSummary.total > 0
                        ? `（未提出 ${salaryScreenshotSummary.missing} 名）`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                      salaryScreenshotSummary.isComplete
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-amber-50 text-amber-700 ring-amber-200"
                    }`}
                  >
                    {salaryScreenshotSummary.isComplete ? "完了" : "要確認"}
                  </span>
                </div>
              </section>

              {selectedSubmission?.return_reason ? (
                <section className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800">
                  <p className="font-bold">月データ差し戻し理由</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {selectedSubmission.return_reason}
                  </p>
                </section>
              ) : null}

              {selectedSubmission?.salary_return_reason ? (
                <section className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800">
                  <p className="font-bold">給与差し戻し理由</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {selectedSubmission.salary_return_reason}
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
                  月データは審査中、または承認済みのため編集できません。給与スクリーンショットは別提出として管理されます。
                </section>
              ) : null}

              {salaryStatus === "submitted" ||
              salaryStatus === "reviewing" ||
              salaryStatus === "approved" ? (
                <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                  給与スクリーンショットは審査提出済み、審査中、または承認済みのため編集できません。
                </section>
              ) : null}

              <MonthlyDataForm
                action={saveMonthlyData}
                teamId={teamId}
                selectedMonth={selectedMonth}
                initialOfficialRow={officialRow}
                initialPlayers={playerRows}
                clubActivityItems={clubActivityItems}
                isMonthlyDataLocked={isMonthlyDataLocked}
                isSalaryLocked={isSalaryLocked}
                canSaveSalaryScreenshots={canSaveSalaryScreenshots}
                isDataScreenshotRequired={isMonthlyDataScreenshotRequiredMonth(
                  selectedMonth
                )}
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

function mergeMonthlyRowsPreservingSalary({
  monthlyRows,
  existingPlayerRows,
}: {
  monthlyRows: MonthlyPlayerRow[];
  existingPlayerRows: MonthlyPlayerRow[];
}) {
  return monthlyRows.map((monthlyRow, index) => {
    const existingRow = findMatchingPlayerRow(
      monthlyRow,
      existingPlayerRows,
      index
    );

    return {
      ...monthlyRow,
      salaryAmount: existingRow?.salaryAmount || "",
      salaryScreenshotName: existingRow?.salaryScreenshotName || "",
      salaryScreenshotUrl: existingRow?.salaryScreenshotUrl || "",
      salaryScreenshotStoragePath:
        existingRow?.salaryScreenshotStoragePath || "",
      salaryScreenshotMimeType: existingRow?.salaryScreenshotMimeType || "",
      xScreenshotName:
        monthlyRow.xScreenshotName || existingRow?.xScreenshotName || "",
      xScreenshotUrl:
        monthlyRow.xScreenshotUrl || existingRow?.xScreenshotUrl || "",
      xScreenshotStoragePath:
        monthlyRow.xScreenshotStoragePath ||
        existingRow?.xScreenshotStoragePath ||
        "",
      xScreenshotMimeType:
        monthlyRow.xScreenshotMimeType || existingRow?.xScreenshotMimeType || "",
      youtubeScreenshotName:
        monthlyRow.youtubeScreenshotName ||
        existingRow?.youtubeScreenshotName ||
        "",
      youtubeScreenshotUrl:
        monthlyRow.youtubeScreenshotUrl ||
        existingRow?.youtubeScreenshotUrl ||
        "",
      youtubeScreenshotStoragePath:
        monthlyRow.youtubeScreenshotStoragePath ||
        existingRow?.youtubeScreenshotStoragePath ||
        "",
      youtubeScreenshotMimeType:
        monthlyRow.youtubeScreenshotMimeType ||
        existingRow?.youtubeScreenshotMimeType ||
        "",
    };
  });
}

function mergeSalaryRowsOnly({
  salaryRows,
  existingPlayerRows,
}: {
  salaryRows: MonthlyPlayerRow[];
  existingPlayerRows: MonthlyPlayerRow[];
}) {
  return salaryRows.map((salaryRow, index) => {
    const existingRow = findMatchingPlayerRow(
      salaryRow,
      existingPlayerRows,
      index
    );

    return {
      ...(existingRow || emptyMonthlyMetrics(salaryRow)),
      id: salaryRow.id,
      playerId: salaryRow.playerId,
      playerHandle: salaryRow.playerHandle,
      playerReading: salaryRow.playerReading,
      playerPosition: salaryRow.playerPosition,
      playerRole: salaryRow.playerRole,
      playerName: salaryRow.playerName,
      salaryAmount: salaryRow.salaryAmount,
      salaryScreenshotName: salaryRow.salaryScreenshotName || "",
      salaryScreenshotUrl: salaryRow.salaryScreenshotUrl || "",
      salaryScreenshotStoragePath: salaryRow.salaryScreenshotStoragePath || "",
      salaryScreenshotMimeType: salaryRow.salaryScreenshotMimeType || "",
    };
  });
}

function findMatchingPlayerRow(
  row: MonthlyPlayerRow,
  rows: MonthlyPlayerRow[],
  fallbackIndex: number
) {
  return (
    rows.find(
      (candidate) =>
        row.playerId && candidate.playerId && row.playerId === candidate.playerId
    ) ||
    rows.find(
      (candidate) =>
        row.playerName &&
        candidate.playerName &&
        row.playerName === candidate.playerName
    ) ||
    rows.find(
      (candidate) =>
        row.playerHandle &&
        candidate.playerHandle &&
        row.playerHandle === candidate.playerHandle
    ) ||
    rows[fallbackIndex] ||
    null
  );
}

function emptyMonthlyMetrics(row: MonthlyPlayerRow) {
  return {
    ...row,
    xTweetCount: "",
    xImpressions: "",
    xEngagements: "",
    xFanEventCount: "",
    xFollowerCount: "",
    youtubeVideoPostCount: "",
    youtubeVideoViews: "",
    youtubeShortPostCount: "",
    youtubeShortViews: "",
    youtubeLikeCount: "",
    youtubeStreamCount: "",
    youtubeStreamViews: "",
    youtubeTotalImpressions: "",
    youtubeSubscriberCount: "",
  };
}

function carryMetricScreenshots({
  row,
  existingRow,
}: {
  row: MonthlyPlayerRow;
  existingRow: MonthlyPlayerRow | null;
}): MonthlyPlayerRow {
  return {
    ...row,
    xScreenshotName: row.xScreenshotName || existingRow?.xScreenshotName || "",
    xScreenshotUrl: row.xScreenshotUrl || existingRow?.xScreenshotUrl || "",
    xScreenshotStoragePath:
      row.xScreenshotStoragePath || existingRow?.xScreenshotStoragePath || "",
    xScreenshotMimeType:
      row.xScreenshotMimeType || existingRow?.xScreenshotMimeType || "",
    youtubeScreenshotName:
      row.youtubeScreenshotName || existingRow?.youtubeScreenshotName || "",
    youtubeScreenshotUrl:
      row.youtubeScreenshotUrl || existingRow?.youtubeScreenshotUrl || "",
    youtubeScreenshotStoragePath:
      row.youtubeScreenshotStoragePath ||
      existingRow?.youtubeScreenshotStoragePath ||
      "",
    youtubeScreenshotMimeType:
      row.youtubeScreenshotMimeType ||
      existingRow?.youtubeScreenshotMimeType ||
      "",
  };
}

async function uploadMetricScreenshotsForPlayers({
  formData,
  rows,
  existingPlayerRows,
  teamId,
  targetMonth,
  storageClient,
}: {
  formData: FormData;
  rows: MonthlyPlayerRow[];
  existingPlayerRows: MonthlyPlayerRow[];
  teamId: string;
  targetMonth: string;
  storageClient: StorageClient;
}) {
  const nextRows: MonthlyPlayerRow[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const existingRow = findMatchingPlayerRow(row, existingPlayerRows, index);
    const uploadedRow = await uploadMetricScreenshotsForRow({
      formData,
      row: carryMetricScreenshots({ row, existingRow }),
      existingRow,
      teamId,
      targetMonth,
      storageClient,
      fileKeySuffix: String(index),
      uploadPrefixSuffix: `player-${index + 1}`,
    });

    nextRows.push(uploadedRow);
  }

  return nextRows;
}

async function uploadMetricScreenshotsForRow({
  formData,
  row,
  existingRow,
  teamId,
  targetMonth,
  storageClient,
  fileKeySuffix,
  uploadPrefixSuffix,
}: {
  formData: FormData;
  row: MonthlyPlayerRow;
  existingRow: MonthlyPlayerRow | null;
  teamId: string;
  targetMonth: string;
  storageClient: StorageClient;
  fileKeySuffix: string;
  uploadPrefixSuffix: string;
}) {
  let nextRow = carryMetricScreenshots({ row, existingRow });

  for (const kind of ["x", "youtube"] as const) {
    const file = formData.get(
      `metric_screenshot_${kind}_${fileKeySuffix}`
    ) as File | null;

    if (!file || file.size <= 0) {
      continue;
    }

    const uploaded = await uploadImage({
      file,
      teamId,
      targetMonth,
      storageClient,
      prefix: `${kind}-data-${uploadPrefixSuffix}`,
    });

    nextRow = applyMetricScreenshot(nextRow, kind, uploaded);
  }

  return nextRow;
}

function applyMetricScreenshot(
  row: MonthlyPlayerRow,
  kind: "x" | "youtube",
  uploaded: {
    fileName: string;
    fileUrl: string;
    storagePath: string;
    mimeType: string;
  }
): MonthlyPlayerRow {
  if (kind === "x") {
    return {
      ...row,
      xScreenshotName: uploaded.fileName,
      xScreenshotUrl: uploaded.fileUrl,
      xScreenshotStoragePath: uploaded.storagePath,
      xScreenshotMimeType: uploaded.mimeType,
    };
  }

  return {
    ...row,
    youtubeScreenshotName: uploaded.fileName,
    youtubeScreenshotUrl: uploaded.fileUrl,
    youtubeScreenshotStoragePath: uploaded.storagePath,
    youtubeScreenshotMimeType: uploaded.mimeType,
  };
}

function validateRequiredMetricScreenshots({
  officialRow,
  playerRows,
}: {
  officialRow: MonthlyPlayerRow;
  playerRows: MonthlyPlayerRow[];
}) {
  const missing: string[] = [];

  for (const row of [officialRow, ...playerRows]) {
    const name = row.playerName || row.playerHandle || "名前未設定";

    if (!hasMonthlyMetricScreenshot(row, "x")) {
      missing.push(`${name} のXデータスクリーンショット`);
    }

    if (!hasMonthlyMetricScreenshot(row, "youtube")) {
      missing.push(`${name} のYouTubeデータスクリーンショット`);
    }
  }

  if (missing.length === 0) {
    return;
  }

  const visibleMissing = missing.slice(0, 8).join("、");
  const suffix =
    missing.length > 8 ? ` ほか${missing.length - 8}件` : "";

  throw new Error(
    `2026年7月以降の月データは、公式アカウント・各選手のX / YouTubeデータスクリーンショットが必須です。未登録：${visibleMissing}${suffix}`
  );
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

async function uploadClubActivityImages({
  formData,
  items,
  teamId,
  targetMonth,
  storageClient,
}: {
  formData: FormData;
  items: ClubActivityItem[];
  teamId: string;
  targetMonth: string;
  storageClient: StorageClient;
}) {
  const nextItems: ClubActivityItem[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const file = formData.get(`club_activity_image_${item.id}`) as File | null;

    if (!file || file.size <= 0) {
      nextItems.push(item);
      continue;
    }

    const uploaded = await uploadImage({
      file,
      teamId,
      targetMonth,
      storageClient,
      prefix: `club-activity-${index + 1}`,
    });

    nextItems.push({
      ...item,
      imageUrl: uploaded.fileUrl,
      imageName: uploaded.fileName,
      imageMimeType: uploaded.mimeType,
      imageStoragePath: uploaded.storagePath,
    });
  }

  return nextItems;
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

function DeadlineNotice({
  label,
  deadlineAt,
  helpText,
  overdueText,
}: {
  label: string;
  deadlineAt: string;
  helpText: string;
  overdueText: string;
}) {
  const deadline = new Date(deadlineAt);
  const isOverdue = new Date().getTime() > deadline.getTime();

  return (
    <section
      className={`rounded-lg border p-4 text-sm shadow-sm ${
        isOverdue
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      <p className="font-bold">
        {label}：{formatDeadlineDateTime(deadlineAt)}
      </p>
      <p className="mt-1">{isOverdue ? overdueText : helpText}</p>
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

function buildDefaultMonthlyDeadlineAt(monthValue: string) {
  const parts = parseMonthValue(monthValue);

  if (!parts) {
    return new Date().toISOString();
  }

  const nextMonth = new Date(Date.UTC(parts.year, parts.month, 10, 14, 59, 0));

  return nextMonth.toISOString();
}

function buildDefaultSalaryScreenshotDeadlineAt(monthValue: string) {
  const parts = parseMonthValue(monthValue);

  if (!parts) {
    return new Date().toISOString();
  }

  const lastDayOfNextMonth = new Date(
    Date.UTC(parts.year, parts.month + 1, 0, 14, 59, 0)
  );

  return lastDayOfNextMonth.toISOString();
}

function parseMonthValue(monthValue: string) {
  const match = monthValue.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

function normalizeMonthValue(value: unknown) {
  const monthValue = String(value || "").slice(0, 7);

  return /^\d{4}-\d{2}$/.test(monthValue) ? monthValue : null;
}

function getDefaultRewardSelectedMonth({
  submissions = [],
  settings = [],
  now = new Date(),
}: {
  submissions?: MonthlySubmissionRow[];
  settings?: MonthlyDataSettingRow[];
  now?: Date;
} = {}) {
  const currentMonth = getTokyoMonthValue(now);
  const previousMonth = addMonthsToMonth(currentMonth, -1);
  const candidates = new Set<string>([currentMonth]);

  if (previousMonth >= monthlySubmissionStartMonth) {
    candidates.add(previousMonth);
  }

  for (const setting of settings) {
    const monthValue = normalizeMonthValue(setting.target_month);

    if (monthValue) {
      candidates.add(monthValue);
    }
  }

  for (const submission of submissions) {
    const monthValue = normalizeMonthValue(submission.target_month);

    if (monthValue) {
      candidates.add(monthValue);
    }
  }

  const settingByMonth = new Map(
    settings.flatMap((setting) => {
      const monthValue = normalizeMonthValue(setting.target_month);

      return monthValue ? [[monthValue, setting] as const] : [];
    })
  );
  const statusByMonth = new Map(
    submissions.flatMap((submission) => {
      const monthValue = normalizeMonthValue(submission.target_month);

      return monthValue
        ? [[monthValue, normalizeMonthlyStatus(submission.status)] as const]
        : [];
    })
  );
  const scoredMonths = Array.from(candidates)
    .filter((monthValue) => monthValue >= monthlySubmissionStartMonth)
    .map((monthValue) => {
      const deadlineAt =
        settingByMonth.get(monthValue)?.deadline_at ||
        buildDefaultMonthlyDeadlineAt(monthValue);
      const deadline = new Date(deadlineAt);
      const distance = Number.isNaN(deadline.getTime())
        ? Number.MAX_SAFE_INTEGER
        : Math.abs(deadline.getTime() - now.getTime());
      const status = statusByMonth.get(monthValue) || "not_submitted";

      return {
        monthValue,
        distance,
        isDone:
          status === "submitted" ||
          status === "reviewing" ||
          status === "approved",
      };
    });
  const pendingMonths = scoredMonths.filter((month) => !month.isDone);
  const targetPool = pendingMonths.length > 0 ? pendingMonths : scoredMonths;

  return (
    targetPool.sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }

      return right.monthValue.localeCompare(left.monthValue);
    })[0]?.monthValue || currentMonth
  );
}

function getTokyoMonthValue(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";

  return `${year}-${month}`;
}

function addMonthsToMonth(monthValue: string, offset: number) {
  const parts = parseMonthValue(monthValue);

  if (!parts) {
    return monthValue;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}
