"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { getPlayerDisplayName } from "@/lib/player-display";
import PlayerTeamSelect from "./PlayerTeamSelect";

type TeamOption = {
  id: string;
  name: string;
  short_name: string | null;
};

type PlayerOption = {
  id: string;
  handle: string | null;
  reading: string | null;
  position_label: string | null;
  roster_role: string | null;
  current_team_id: string | null;
  current_team_short_name: string | null;
  teams: TeamOption | null;
};

export default function PlayerRosterSelect({
  players,
  teams,
  action,
}: {
  players: PlayerOption[];
  teams: TeamOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) || null,
    [players, selectedPlayerId]
  );

  return (
    <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
        <h2 className="text-xl font-bold">选手大名单</h2>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
          {players.length} 名
        </span>
      </div>

      <div className="p-4">
        <label className="block text-sm font-semibold text-slate-300">
          选择选手
          <select
            value={selectedPlayerId}
            onChange={(event) => setSelectedPlayerId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-white"
          >
            <option value="">请选择选手</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {getPlayerDisplayName(player)}
                {player.reading ? ` / ${player.reading}` : ""}
                {player.teams?.short_name ? ` / ${player.teams.short_name}` : ""}
              </option>
            ))}
          </select>
        </label>

        {selectedPlayer ? (
          <div className="mt-4 grid gap-3 rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm md:grid-cols-2">
            <InfoBlock label="选手名">
              <Link
                href={`/admin/players/${selectedPlayer.id}`}
                className="font-semibold text-sky-200 hover:text-sky-100 hover:underline"
              >
                {getPlayerDisplayName(selectedPlayer)}
              </Link>
            </InfoBlock>
            <InfoBlock label="读音">{selectedPlayer.reading || "-"}</InfoBlock>
            <InfoBlock label="位置">
              {selectedPlayer.position_label || "-"}
            </InfoBlock>
            <InfoBlock label="阵营">{selectedPlayer.roster_role || "-"}</InfoBlock>
            <div className="md:col-span-2">
              <p className="mb-2 text-xs text-slate-500">当前俱乐部</p>
              <PlayerTeamSelect
                playerId={selectedPlayer.id}
                currentTeamId={selectedPlayer.current_team_id}
                teams={teams}
                action={action}
              />
            </div>
            <div className="md:col-span-2">
              <Link
                href={`/admin/players/${selectedPlayer.id}`}
                className="text-sm font-semibold text-sky-200 hover:text-sky-100 hover:underline"
              >
                查看选手详细数据
              </Link>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
            从下拉框选择一个选手后，可以查看基础信息、修改所属俱乐部，并进入选手详细数据页。
          </p>
        )}
      </div>
    </section>
  );
}

function InfoBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 text-slate-100">{children}</div>
    </div>
  );
}
