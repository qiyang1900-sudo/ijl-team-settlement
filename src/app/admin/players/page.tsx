import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlayerDisplayName } from "@/lib/player-display";
import PlayerRosterSelect from "./PlayerRosterSelect";
import RosterSyncPanel from "./RosterSyncPanel";

export const dynamic = "force-dynamic";

type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
};

type PlayerRow = {
  id: string;
  handle: string | null;
  reading: string | null;
  position_label: string | null;
  roster_role: string | null;
  current_team_id: string | null;
  current_team_short_name: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  teams: TeamRow | null;
};

type MonthOption = {
  value: string;
  label: string;
};

function getCurrentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function addMonths(monthValue: string, offset: number) {
  const [year, month] = monthValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${nextYear}-${nextMonth}`;
}

function formatMonthLabel(monthValue: string) {
  const [year, month] = monthValue.split("-");

  return `${year}年${month}月`;
}

function buildMonthOptions(): MonthOption[] {
  const currentMonth = getCurrentMonthValue();
  const months = new Set<string>([currentMonth]);

  for (let index = 1; index <= 12; index += 1) {
    months.add(addMonths(currentMonth, index));
  }

  for (let index = 1; index <= 6; index += 1) {
    months.add(addMonths(currentMonth, -index));
  }

  return Array.from(months)
    .sort()
    .reverse()
    .map((value) => ({ value, label: formatMonthLabel(value) }));
}

async function updatePlayerTeam(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功。");
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
  const playerId = String(formData.get("player_id") || "");
  const teamId = String(formData.get("team_id") || "");
  let teamShortName: string | null = null;

  if (!playerId) {
    throw new Error("未找到选手。");
  }

  if (teamId) {
    const { data: team } = await supabase
      .from("teams")
      .select("short_name")
      .eq("id", teamId)
      .maybeSingle();

    teamShortName = team?.short_name || null;
  }

  const { error } = await supabase
    .from("league_players")
    .update({
      current_team_id: teamId || null,
      current_team_short_name: teamShortName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  if (error) {
    throw new Error(error.message);
  }

  redirect("/admin/players");
}

async function syncCurrentRosterToMonth(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功。");
  }

  const targetMonth =
    String(formData.get("target_month") || "") ||
    new Date().toISOString().slice(0, 7);
  const deadlineAt = buildDeadlineAt(formData);

  if (!deadlineAt) {
    throw new Error("请选择有效的月数据提交截止时间。");
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
  const { data: players, error: playersError } = await supabase
    .from("league_players")
    .select("id, current_team_id, sort_order")
    .not("current_team_id", "is", null)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (playersError) {
    throw new Error(playersError.message);
  }

  await supabase
    .from("monthly_player_assignments")
    .delete()
    .eq("target_month", targetMonth);

  const rows = (players || []).map((player) => ({
    target_month: targetMonth,
    team_id: player.current_team_id,
    player_id: player.id,
    sort_order: player.sort_order || 0,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("monthly_player_assignments")
      .insert(rows);

    if (error) {
      throw new Error(error.message);
    }
  }

  const { error: settingError } = await supabase
    .from("monthly_data_settings")
    .upsert(
      {
        target_month: targetMonth,
        deadline_at: deadlineAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "target_month" }
    );

  if (settingError) {
    throw new Error(settingError.message);
  }

  redirect(
    `/admin/players?synced_month=${encodeURIComponent(
      targetMonth
    )}&synced_deadline=${encodeURIComponent(deadlineAt)}`
  );
}

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ synced_month?: string; synced_deadline?: string }>;
}) {
  const { synced_month: syncedMonth, synced_deadline: syncedDeadline } =
    await searchParams;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">选手管理</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, short_name")
    .order("short_name", { ascending: true });
  const { data: players, error } = await supabase
    .from("league_players")
    .select(
      `
      id,
      handle,
      reading,
      position_label,
      roster_role,
      current_team_id,
      current_team_short_name,
      sort_order,
      is_active,
      teams:current_team_id (
        id,
        name,
        short_name
      )
    `
    )
    .order("sort_order", { ascending: true });

  const safeTeams = (teams || []) as TeamRow[];
  const safePlayers = ((players || []) as unknown as PlayerRow[]).filter(
    (player) => player.is_active !== false
  );
  const groupedPlayers = safeTeams.map((team) => ({
    team,
    players: safePlayers.filter((player) => player.current_team_id === team.id),
  }));
  const freePlayers = safePlayers.filter((player) => !player.current_team_id);
  const currentMonth = getCurrentMonthValue();
  const monthOptions = buildMonthOptions();

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/admin/dashboard"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← 返回管理员后台
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-bold">选手管理</h1>
            <p className="mt-2 text-slate-400">
              管理联盟选手名单、当前所属俱乐部和战队月数据表的选手来源。
            </p>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm">
            当前框架：未生成月别名单时使用当前所属；生成后该月份使用锁定名单。
          </div>
        </div>

        {error ? (
          <section className="mt-6 rounded-xl border border-amber-500 bg-amber-950 p-5 text-amber-100">
            <h2 className="font-bold">选手管理表还没有准备好</h2>
            <p className="mt-2 text-sm">
              请先在 Supabase 执行 `supabase/player-management.sql`。
            </p>
            <p className="mt-2 text-xs">{error.message}</p>
          </section>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="总选手" value={safePlayers.length} />
              <Stat label="已归属俱乐部" value={safePlayers.length - freePlayers.length} />
              <Stat label="未所属" value={freePlayers.length} />
              <Stat label="战队数" value={safeTeams.length} />
            </div>

            <RosterSyncPanel
              action={syncCurrentRosterToMonth}
              monthOptions={monthOptions}
              defaultMonth={currentMonth}
              syncedMonth={syncedMonth}
              syncedDeadline={syncedDeadline}
            />

            <PlayerRosterSelect
              players={safePlayers}
              teams={safeTeams}
              action={updatePlayerTeam}
            />

            <details className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4">
              <summary className="cursor-pointer select-none text-lg font-bold">
                按俱乐部分组查看
              </summary>
              <section className="mt-4 grid gap-4 lg:grid-cols-2">
              {groupedPlayers.map(({ team, players: teamPlayers }) => (
                <div
                  key={team.id}
                  className="rounded-xl border border-slate-700 bg-slate-900 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-bold">
                      {team.name}（{team.short_name || "-"}）
                    </h2>
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                      {teamPlayers.length} 名
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {teamPlayers.map((player) => (
                      <Link
                        key={player.id}
                        href={`/admin/players/${player.id}`}
                        className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200"
                      >
                        {getPlayerDisplayName(player)}
                      </Link>
                    ))}
                    {teamPlayers.length === 0 ? (
                      <span className="text-sm text-slate-500">暂无选手。</span>
                    ) : null}
                  </div>
                </div>
              ))}
              </section>
            </details>
          </>
        )}
      </div>
    </main>
  );
}

function buildDeadlineAt(formData: FormData) {
  const year = Number(formData.get("deadline_year") || "");
  const month = Number(formData.get("deadline_month") || "");
  const day = Number(formData.get("deadline_day") || "");
  const hour = Number(formData.get("deadline_hour") || "");
  const minute = Number(formData.get("deadline_minute") || "");

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    year < 2020 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const date = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
