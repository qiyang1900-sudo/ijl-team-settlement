"use client";

type TeamOption = {
  id: string;
  name: string;
  short_name: string | null;
};

export default function PlayerTeamSelect({
  playerId,
  currentTeamId,
  teams,
  action,
}: {
  playerId: string;
  currentTeamId?: string | null;
  teams: TeamOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="player_id" value={playerId} />
      <select
        name="team_id"
        defaultValue={currentTeamId || ""}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-white"
      >
        <option value="">未所属</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.short_name ? `${team.short_name} - ${team.name}` : team.name}
          </option>
        ))}
      </select>
    </form>
  );
}
