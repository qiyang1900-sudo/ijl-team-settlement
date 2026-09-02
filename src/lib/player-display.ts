export type PlayerDisplayTeam = {
  id?: string | null;
  short_name?: string | null;
};

export type PlayerDisplayRecord = {
  handle?: string | null;
  player_name?: string | null;
  reading?: string | null;
  position_label?: string | null;
  roster_role?: string | null;
  current_team_short_name?: string | null;
  teams?: PlayerDisplayTeam | PlayerDisplayTeam[] | null;
};

type KnownPlayerMeta = {
  reading: string;
  positionLabel: string;
  rosterRole: string;
};

const knownPlayerMetaByTeamAndHandle = new Map<string, KnownPlayerMeta>([
  [
    "zeta:kznk",
    {
      reading: "カズネコ",
      positionLabel: "队员",
      rosterRole: "求生者",
    },
  ],
]);

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

export function getKnownPlayerMeta(player: PlayerDisplayRecord) {
  const team = Array.isArray(player.teams) ? player.teams[0] : player.teams;
  const handle =
    String(player.handle || "").trim() ||
    getHandleFromPrefixedName(player.player_name);
  const teamShortName =
    String(team?.short_name || player.current_team_short_name || "").trim();

  return knownPlayerMetaByTeamAndHandle.get(
    `${teamShortName.toLowerCase()}:${handle.toLowerCase()}`
  );
}

export function getPlayerReading(player: PlayerDisplayRecord) {
  return String(player.reading || "").trim() || getKnownPlayerMeta(player)?.reading || "";
}

export function getPlayerPositionLabel(player: PlayerDisplayRecord) {
  return (
    String(player.position_label || "").trim() ||
    getKnownPlayerMeta(player)?.positionLabel ||
    ""
  );
}

export function getPlayerRosterRole(player: PlayerDisplayRecord) {
  return (
    String(player.roster_role || "").trim() ||
    getKnownPlayerMeta(player)?.rosterRole ||
    ""
  );
}
