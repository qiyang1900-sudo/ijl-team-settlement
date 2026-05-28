export type PlayerDisplayTeam = {
  id?: string | null;
  short_name?: string | null;
};

export type PlayerDisplayRecord = {
  handle?: string | null;
  player_name?: string | null;
  current_team_short_name?: string | null;
  teams?: PlayerDisplayTeam | PlayerDisplayTeam[] | null;
};

export function getPlayerDisplayName(player: PlayerDisplayRecord) {
  const team = Array.isArray(player.teams) ? player.teams[0] : player.teams;
  const handle =
    String(player.handle || "").trim() ||
    getHandleFromPrefixedName(player.player_name);
  const teamShortName =
    String(team?.short_name || player.current_team_short_name || "").trim();

  if (handle && teamShortName) {
    return `${teamShortName}_${handle}`;
  }

  return String(player.player_name || handle || "-");
}

export function getHandleFromPrefixedName(value: unknown) {
  const rawValue = String(value || "").trim();
  const [, handle] = rawValue.match(/^[A-Za-z0-9]+_(.+)$/) || [];

  return handle || rawValue;
}
