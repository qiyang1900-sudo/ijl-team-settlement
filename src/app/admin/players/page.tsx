import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlayerDisplayName } from "@/lib/player-display";
import PlayerTeamSelect from "./PlayerTeamSelect";

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

async function updatePlayerTeam(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功。");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
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
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
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

  redirect("/admin/players");
}

export default async function AdminPlayersPage() {
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

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
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

            <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5">
              <h2 className="text-xl font-bold">月别名单生成</h2>
              <p className="mt-2 text-sm text-slate-400">
                转会期后先用下拉框调整选手所属俱乐部，再把当前名单同步为指定月份名单。
              </p>
              <form
                action={syncCurrentRosterToMonth}
                className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <label className="block text-sm text-slate-300">
                  目标月份
                  <input
                    type="month"
                    name="target_month"
                    defaultValue={new Date().toISOString().slice(0, 7)}
                    className="mt-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white"
                  />
                </label>
                <button className="rounded-lg bg-indigo-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-indigo-300">
                  按当前所属生成本月名单
                </button>
              </form>
            </section>

            <section className="mt-6 overflow-hidden rounded-xl border border-slate-700">
              <table className="w-full min-w-[900px] border-collapse bg-slate-900 text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">选手名</th>
                    <th className="px-4 py-3">读音</th>
                    <th className="px-4 py-3">位置</th>
                    <th className="px-4 py-3">阵营</th>
                    <th className="px-4 py-3">当前俱乐部</th>
                  </tr>
                </thead>
                <tbody>
                  {safePlayers.map((player) => (
                    <tr key={player.id} className="border-t border-slate-700">
                      <td className="px-4 py-3 font-semibold">
                        {getPlayerDisplayName(player)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {player.reading || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {player.position_label || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {player.roster_role || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <PlayerTeamSelect
                          playerId={player.id}
                          currentTeamId={player.current_team_id}
                          teams={safeTeams}
                          action={updatePlayerTeam}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-2">
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
                      <span
                        key={player.id}
                        className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200"
                      >
                        {getPlayerDisplayName(player)}
                      </span>
                    ))}
                    {teamPlayers.length === 0 ? (
                      <span className="text-sm text-slate-500">暂无选手。</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
