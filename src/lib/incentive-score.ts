import {
  isOfficialMonthlyRow,
  parseMonthlyPlayerRows,
  type MonthlyPlayerRow,
} from "./monthly-data";
import { contentWorkKey, parseMonthlyContent } from "./monthly-content";
import { parseClubActivityItems } from "./club-activities";
import type { TeamScoreTeam, TeamScoreSubmission } from "./team-score";
import type { TiktokMonthlyRow } from "./tiktok-monthly-data";

export const incentiveRuleVersion = "2026-05-v1";
export const incentiveStartMonth = "2026-05";
export const incentivePrizeStartMonth = "2026-07";
export const contentCollectionStartMonth = "2026-10";
export const rankPrizes = [600000, 400000, 300000, 200000, 160000];

export const incentiveFields = {
  officialVideos: { group: "A", label: "官方合格普通视频", target: 2 },
  designatedLong: { group: "A", label: "合格指定长视频", target: 4 },
  designatedLongEvent: {
    group: "A",
    label: "其中：游戏内活动长视频",
    target: 2,
  },
  designatedShort: { group: "A", label: "合格指定 Shorts／切片", target: 8 },
  designatedShortEvent: {
    group: "A",
    label: "其中：游戏内活动 Shorts／切片",
    target: 4,
  },
  streams: { group: "A", label: "全队 YouTube 直播次数", target: 20 },
  shortPosts: { group: "A", label: "全队 Shorts＋TT 投稿合计", target: 5 },
  officialTweets: { group: "A", label: "官方 X 投稿数", target: 15 },
  xViews: { group: "B", label: "X 曝光：官方＋选手＋教练" },
  xEngagements: { group: "B", label: "X 互动：官方＋选手＋教练" },
  officialViews: { group: "B", label: "YT 普通视频播放：官方" },
  memberViews: { group: "B", label: "YT 普通视频播放：选手＋教练" },
  videoPosts: { group: "B", label: "YT 普通视频投稿：全队" },
  shortViews: { group: "B", label: "Shorts＋TT 播放：选手＋教练" },
  shortLikes: { group: "B", label: "Shorts＋TT 点赞：选手＋教练" },
  shortReposts: { group: "B", label: "Shorts＋TT 转发：全队" },
  xGrowth: { group: "C", label: "X 增粉达标账号数" },
  ttGrowth: { group: "C", label: "TT 增粉达标账号数" },
  ytGrowth: { group: "C", label: "YT 订阅增长达标账号数" },
  hotShort: { group: "C", label: "单条短视频点赞＞2,000 的账号数" },
  hotX: { group: "C", label: "单条原创 X 点赞＞3,000 的账号数" },
  hotOfficialVideo: { group: "C", label: "官方单条视频播放＞40,000 的视频数" },
  onlineEvents: { group: "C", label: "线上单场观看＞3,000 的活动数" },
  offlineEvents: { group: "C", label: "线下单场参与＞100 的活动数" },
  tournamentUnits: { group: "C", label: "合格第三方赛事并发观看千人单位合计" },
  bonusVideos: { group: "D", label: "热门视频追加奖励达标作品数" },
} as const;
export type IncentiveField = keyof typeof incentiveFields;
export type IncentiveValues = Record<IncentiveField, number | null>;
export const rankingFields = [
  "xViews",
  "xEngagements",
  "officialViews",
  "memberViews",
  "videoPosts",
  "shortViews",
  "shortLikes",
  "shortReposts",
] as const;
export type RankingField = (typeof rankingFields)[number];
export type IncentiveSubmission = TeamScoreSubmission & {
  content_entries?: unknown;
  content_skipped?: boolean;
  club_activity_link?: string | null;
};
export type IncentiveTiktokRow = TiktokMonthlyRow & {
  likeCount?: number | null;
  repostCount?: number | null;
};
export type IncentiveContext = {
  month: string;
  teams: TeamScoreTeam[];
  submissions: IncentiveSubmission[];
  tiktokRows: IncentiveTiktokRow[];
  tiktokIssues?: Array<{ month: string; team: string }>;
};
export type IndividualOverride = {
  views?: number | null;
  posts?: number | null;
};
export type IncentiveReviewInput = {
  overrides: Partial<IncentiveValues>;
  individuals: Record<string, IndividualOverride>;
  note: string;
};
export type IncentiveReview = {
  team_id: string;
  target_month: string;
  status: "draft" | "reviewed";
  inputs: IncentiveReviewInput;
  source_hash: string;
  updated_at?: string;
};
export type IncentiveMember = {
  id: string;
  name: string;
  views: number | null;
  posts: number | null;
};
export type IncentiveTeamResult = {
  teamId: string;
  shortName: string;
  teamName: string;
  hasApprovedData: boolean;
  proposed: IncentiveValues;
  values: IncentiveValues;
  details: string[];
  members: IncentiveMember[];
  a: {
    youtube: number | null;
    shorts: number | null;
    x: number | null;
    score: number | null;
    deductions: string[];
  };
  eligible: boolean;
  b: {
    x: number;
    youtube: number;
    shorts: number;
    extra: number;
    score: number;
    ranks: Partial<Record<RankingField, number | null>>;
  };
  c: { growth: number; popular: number; events: number; score: number | null };
  total: number | null;
  rank: number | null;
  prize: {
    ranking: number;
    views: number;
    posts: number;
    popular: number;
    total: number;
    winners: string[];
  };
  missing: string[];
  scoreMissing: string[];
  prizeMissing: string[];
};
export type IncentiveMonthResult = {
  ruleVersion: string;
  month: string;
  prizeEnabled: boolean;
  teams: IncentiveTeamResult[];
  incomplete: boolean;
  scoreIncomplete: boolean;
  prizeIncomplete: boolean;
  allocated: number;
  unallocated: number;
};

export function previousIncentiveMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  return number === 1
    ? `${year - 1}-12`
    : `${year}-${String(number - 1).padStart(2, "0")}`;
}

export function incentiveNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const normalized = String(value).normalize("NFKC").replaceAll(",", "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function checkedSum(values: Array<number | null>): number | null {
  if (!values.length || values.some((value) => value === null)) return null;
  const result = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return Number.isSafeInteger(result) ? result : null;
}

function metric(rows: MonthlyPlayerRow[], field: keyof MonthlyPlayerRow) {
  return checkedSum(rows.map((row) => incentiveNumber(row[field])));
}

function teamKey(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toUpperCase();
}
function memberKey(row: MonthlyPlayerRow) {
  return row.playerId || row.playerHandle || row.playerName || row.id;
}
function isMember(row: MonthlyPlayerRow) {
  return (
    !isOfficialMonthlyRow(row) &&
    !/manager|マネージャー|经理|經理|運営スタッフ|运营/i.test(
      `${row.playerPosition} ${row.playerRole}`,
    )
  );
}

function accountGrowth(
  current: MonthlyPlayerRow[],
  previous: MonthlyPlayerRow[],
  field: keyof MonthlyPlayerRow,
  officialThreshold: number,
  detail: string[],
) {
  let count = 0;
  let missing = false;
  for (const row of current) {
    const official = isOfficialMonthlyRow(row);
    const prior = official
      ? previous.find(isOfficialMonthlyRow)
      : previous.find((candidate) => memberKey(candidate) === memberKey(row));
    const now = incentiveNumber(row[field]);
    const before = prior ? incentiveNumber(prior[field]) : null;
    if (now === null || before === null) {
      missing = true;
      continue;
    }
    const delta = now - before;
    if (delta > (official ? officialThreshold : 600)) {
      count++;
      detail.push(
        `${field === "xFollowerCount" ? "X" : "YT"} 增长：${row.playerName} +${delta}`,
      );
    }
  }
  return current.length && !missing ? count : null;
}

function ttAccountKey(row: IncentiveTiktokRow) {
  try {
    const url = new URL(row.link);
    return url.pathname.replace(/\/$/, "").toLowerCase();
  } catch {
    return row.accountName.normalize("NFKC").trim().toLowerCase();
  }
}

function tiktokGrowth(
  current: IncentiveTiktokRow[],
  previous: IncentiveTiktokRow[],
  detail: string[],
) {
  let count = 0;
  let missing = !current.length;
  for (const row of current) {
    const prior = previous.find(
      (candidate) => ttAccountKey(candidate) === ttAccountKey(row),
    );
    const before = prior ? incentiveNumber(prior.followerCount) : null;
    const now = incentiveNumber(row.followerCount);
    if (before === null || now === null) {
      missing = true;
      continue;
    }
    if (now - before > (row.isOfficial ? 300 : 600)) {
      count++;
      detail.push(`TT 增长：${row.accountName} +${now - before}`);
    }
  }
  return missing ? null : count;
}

export function proposeIncentiveValues(
  team: TeamScoreTeam,
  context: IncentiveContext,
) {
  const current = context.submissions.filter(
    (row) =>
      row.team_id === team.id &&
      row.target_month === context.month &&
      row.status === "approved",
  );
  if (current.length > 1)
    throw new Error(`${team.short_name} 的同月已通过记录重复，请先核查。`);
  const submission = current[0];
  const rows = submission ? parseMonthlyPlayerRows(submission.player_rows) : [];
  const official = rows.filter(isOfficialMonthlyRow);
  const members = rows.filter(isMember);
  const all = [...official, ...members];
  const previous = context.submissions
    .filter(
      (row) =>
        row.target_month === previousIncentiveMonth(context.month) &&
        row.status === "approved",
    )
    .flatMap((record) =>
      parseMonthlyPlayerRows(record.player_rows).filter(
        (row) => !isOfficialMonthlyRow(row) || record.team_id === team.id,
      ),
    );
  const tt = context.tiktokRows.filter(
    (row) =>
      row.month === context.month &&
      teamKey(row.teamShortName) === teamKey(team.short_name),
  );
  const oldTT = context.tiktokRows.filter(
    (row) =>
      row.month === previousIncentiveMonth(context.month) &&
      !context.tiktokIssues?.some(
        (issue) =>
          issue.month === row.month &&
          teamKey(issue.team) === teamKey(row.teamShortName),
      ),
  );
  const hasTTIssue = context.tiktokIssues?.some(
    (issue) =>
      issue.month === context.month &&
      teamKey(issue.team) === teamKey(team.short_name),
  );
  const ttMetric = (field: keyof IncentiveTiktokRow, onlyMembers = false) =>
    hasTTIssue
      ? null
      : checkedSum(
          tt
            .filter((row) => !onlyMembers || !row.isOfficial)
            .map((row) => incentiveNumber(row[field])),
        );
  const details: string[] = [];
  if (hasTTIssue)
    details.push("TT 同步存在异常行，受影响的 TT 合计需核定，未按 0 处理。");
  const content = parseMonthlyContent(submission?.content_entries);
  const knownClaims = Boolean(
    submission && (content.length || submission.content_skipped),
  );
  const activities = parseClubActivityItems({
    link: submission?.club_activity_link,
  });
  const workKeys = new Set<string>();
  const hotShortAccounts = new Set<string>();
  const hotXAccounts = new Set<string>();
  let long = 0,
    short = 0,
    longEvent = 0,
    shortEvent = 0,
    hotVideos = 0,
    bonusVideos = 0;
  for (const work of content) {
    const key = contentWorkKey(work.url);
    if (!key || workKeys.has(key)) {
      details.push(`需人工复核重复或无效链接：${work.title}`);
      continue;
    }
    workKeys.add(key);
    const ownerExists =
      work.accountId === "official" ||
      members.some((row) => [row.playerId, row.id].includes(work.accountId));
    if (!ownerExists || !work.publishedOn.startsWith(`${context.month}-`)) {
      details.push(`需人工复核投稿者／月份：${work.title}`);
      continue;
    }
    const views = incentiveNumber(work.views),
      likes = incentiveNumber(work.likes);
    if (work.claims.includes("designated")) {
      if (work.platform === "youtube") {
        long++;
        if (work.topic === "game_event") longEvent++;
      }
      if (work.platform === "youtube_short") {
        short++;
        if (work.topic === "game_event") shortEvent++;
      }
    }
    if (
      work.claims.includes("hot_short") &&
      ["youtube_short", "tiktok"].includes(work.platform) &&
      likes !== null &&
      likes > 2000
    )
      hotShortAccounts.add(work.accountId);
    if (
      work.claims.includes("hot_x") &&
      work.platform === "x" &&
      likes !== null &&
      likes > 3000
    )
      hotXAccounts.add(work.accountId);
    if (
      work.claims.includes("hot_video") &&
      work.accountId === "official" &&
      work.platform !== "x" &&
      views !== null &&
      views > 40000
    )
      hotVideos++;
    if (
      work.claims.includes("bonus_video") &&
      views !== null &&
      ((work.platform === "youtube" && views > 200000) ||
        (["youtube_short", "tiktok"].includes(work.platform) &&
          views > 1000000))
    )
      bonusVideos++;
    details.push(
      `${work.accountName || work.accountId} · ${work.title} · ${work.platform} · 播放 ${views ?? "未填"} / 点赞 ${likes ?? "未填"}`,
    );
  }
  let online = 0,
    offline = 0,
    units = 0;
  for (const activity of activities.filter((item) => item.popular)) {
    const audience = incentiveNumber(activity.audienceCount);
    if (
      audience === null ||
      !activity.activityDate?.startsWith(`${context.month}-`)
    )
      continue;
    if (activity.popularKind === "online" && audience > 3000) online++;
    if (activity.popularKind === "offline" && audience > 100) offline++;
    if (activity.popularKind === "tournament")
      units += Math.floor(audience / 1000);
    details.push(
      `人气活动 ${activity.activityDate} · ${activity.popularKind} · ${audience}`,
    );
  }
  const ytShortPosts = metric(all, "youtubeShortPostCount");
  const combinedShortPosts = checkedSum([ytShortPosts, ttMetric("postCount")]);
  const values: IncentiveValues = {
    officialVideos: metric(official, "youtubeVideoPostCount"),
    designatedLong: knownClaims ? long : null,
    designatedLongEvent: knownClaims ? longEvent : null,
    designatedShort: knownClaims ? short : null,
    designatedShortEvent: knownClaims ? shortEvent : null,
    streams: metric(all, "youtubeStreamCount"),
    shortPosts:
      combinedShortPosts ??
      (ytShortPosts !== null && ytShortPosts >= 5 ? ytShortPosts : null),
    officialTweets: metric(official, "xTweetCount"),
    xViews: metric(all, "xImpressions"),
    xEngagements: metric(all, "xEngagements"),
    officialViews: metric(official, "youtubeVideoViews"),
    memberViews: metric(members, "youtubeVideoViews"),
    videoPosts: metric(all, "youtubeVideoPostCount"),
    shortViews: checkedSum([
      metric(members, "youtubeShortViews"),
      ttMetric("videoViews", true),
    ]),
    shortLikes: checkedSum([
      metric(members, "youtubeLikeCount"),
      ttMetric("likeCount", true),
    ]),
    shortReposts: null,
    xGrowth: accountGrowth(all, previous, "xFollowerCount", 300, details),
    ttGrowth: hasTTIssue ? null : tiktokGrowth(tt, oldTT, details),
    ytGrowth: accountGrowth(
      all,
      previous,
      "youtubeSubscriberCount",
      200,
      details,
    ),
    hotShort: knownClaims ? hotShortAccounts.size : null,
    hotX: knownClaims ? hotXAccounts.size : null,
    hotOfficialVideo: knownClaims ? hotVideos : null,
    onlineEvents: context.month >= contentCollectionStartMonth ? online : null,
    offlineEvents:
      context.month >= contentCollectionStartMonth ? offline : null,
    tournamentUnits:
      context.month >= contentCollectionStartMonth ? units : null,
    bonusVideos: knownClaims ? bonusVideos : null,
  };
  if (combinedShortPosts === null && values.shortPosts !== null)
    details.push(
      "Shorts＋TT 的完整合计尚未齐全，但仅现有 YT Shorts 已满足 5 条基准。",
    );
  return {
    hasApprovedData: Boolean(submission),
    values,
    details,
    members: members.map((row) => ({
      id: memberKey(row),
      name: row.playerName,
      views: incentiveNumber(row.youtubeVideoViews),
      posts: incentiveNumber(row.youtubeVideoPostCount),
    })),
  };
}

export function normalizeIncentiveReview(value: unknown): IncentiveReviewInput {
  if (value == null) return { overrides: {}, individuals: {}, note: "" };
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("评分补录格式不正确。");
  const raw = value as Partial<IncentiveReviewInput>;
  const overrides: IncentiveReviewInput["overrides"] = {};
  for (const key of Object.keys(incentiveFields) as IncentiveField[]) {
    const value = raw.overrides?.[key];
    if (value == null || String(value).trim() === "") continue;
    const number = incentiveNumber(value);
    if (number === null)
      throw new Error(`${incentiveFields[key].label} 必须是 0 或正整数。`);
    overrides[key] = number;
  }
  const individuals: IncentiveReviewInput["individuals"] = {};
  const entries = Object.entries(raw.individuals || {});
  if (entries.length > 100) throw new Error("个人补录数量异常。");
  for (const [id, values] of entries) {
    if (!values || typeof values !== "object")
      throw new Error("个人补录格式不正确。");
    individuals[id] = {};
    for (const key of ["views", "posts"] as const) {
      if (values[key] == null || String(values[key]).trim() === "") continue;
      const number = incentiveNumber(values[key]);
      if (number === null)
        throw new Error("个人播放／投稿补录必须是 0 或正整数。");
      individuals[id][key] = number;
    }
  }
  const note = String(raw.note || "")
    .trim()
    .slice(0, 4000);
  return { overrides, individuals, note };
}

export function competitionRanks<
  T extends { id: string; value: number | null },
>(values: T[]) {
  const valid = values.filter(
    (row): row is T & { value: number } => row.value !== null && row.value > 0,
  );
  return new Map(
    values.map((row) => [
      row.id,
      row.value !== null && row.value > 0
        ? 1 + valid.filter((other) => other.value > row.value!).length
        : null,
    ]),
  );
}

export function calculateBase(
  values: IncentiveValues,
): IncentiveTeamResult["a"] {
  const deductions: string[] = [];
  const conditions = [
    "officialVideos",
    "designatedLong",
    "designatedShort",
    "streams",
  ] as const;
  for (const key of conditions) {
    const eventKey =
      key === "designatedLong"
        ? "designatedLongEvent"
        : key === "designatedShort"
          ? "designatedShortEvent"
          : null;
    if (
      (values[key] !== null && values[key]! < incentiveFields[key].target) ||
      (eventKey &&
        values[eventKey] !== null &&
        values[eventKey]! < incentiveFields[eventKey].target)
    )
      deductions.push(
        `${incentiveFields[key].label}未达标（${values[key] ?? "待补"}/${incentiveFields[key].target}${eventKey ? `，其中游戏内活动 ${values[eventKey] ?? "待补"}/${incentiveFields[eventKey].target}` : ""}）：扣 10 分`,
      );
  }
  const youtube = [
    ...conditions,
    "designatedLongEvent",
    "designatedShortEvent",
  ].some((key) => values[key as IncentiveField] === null)
    ? null
    : Math.max(0, 30 - deductions.length * 10);
  const shorts =
    values.shortPosts === null ? null : values.shortPosts >= 5 ? 15 : 5;
  const x =
    values.officialTweets === null
      ? null
      : values.officialTweets >= 15
        ? 15
        : 5;
  if (shorts === 5)
    deductions.push(`Shorts＋TT 投稿 ${values.shortPosts}＜5：扣 10 分`);
  if (x === 5)
    deductions.push(
      `官方 X 投稿 ${values.officialTweets}＜15：扣 10 分；标签部分保留 5 分`,
    );
  return {
    youtube,
    shorts,
    x,
    score: checkedSum([youtube, shorts, x]),
    deductions,
  };
}

export function buildIncentiveMonth(
  context: IncentiveContext,
  reviews: IncentiveReview[] = [],
): IncentiveMonthResult {
  if (context.month < incentiveStartMonth)
    throw new Error("2026 年 5 月前应使用旧评分制度。");
  const prizeEnabled = context.month >= incentivePrizeStartMonth;
  const teams: IncentiveTeamResult[] = context.teams.map((team) => {
    const proposed = proposeIncentiveValues(team, context);
    const review = reviews.find(
      (row) => row.team_id === team.id && row.target_month === context.month,
    );
    const inputs = normalizeIncentiveReview(review?.inputs);
    const values = { ...proposed.values, ...inputs.overrides };
    const a = calculateBase(values);
    const eligible =
      proposed.hasApprovedData && a.score !== null && a.score >= 45;
    const members = proposed.members.map((member) => ({
      ...member,
      ...inputs.individuals[member.id],
    }));
    const cFields = (Object.keys(incentiveFields) as IncentiveField[]).filter(
      (key) => incentiveFields[key].group === "C",
    );
    const growth =
      (values.xGrowth ?? 0) * 2 +
      (values.ttGrowth ?? 0) * 2 +
      (values.ytGrowth ?? 0) * 3;
    const popular =
      Math.min(10, (values.hotShort ?? 0) * 2) +
      Math.min(10, (values.hotX ?? 0) * 2) +
      Math.min(10, (values.hotOfficialVideo ?? 0) * 2);
    const events =
      (values.onlineEvents ?? 0) * 2 +
      (values.offlineEvents ?? 0) * 5 +
      (values.tournamentUnits ?? 0) * 5;
    const cScore = !eligible
      ? 0
      : cFields.some((key) => values[key] === null)
        ? null
        : growth + popular + events;
    const scoreMissing = proposed.hasApprovedData
      ? (Object.keys(incentiveFields) as IncentiveField[])
          .filter((key) => {
            const group = incentiveFields[key].group;
            return (
              values[key] === null &&
              (group === "A" || (eligible && group !== "D"))
            );
          })
          .map((key) => incentiveFields[key].label)
      : [];
    const prizeMissing: string[] = [];
    if (eligible && prizeEnabled && values.bonusVideos === null)
      prizeMissing.push(incentiveFields.bonusVideos.label);
    if (eligible && prizeEnabled)
      for (const member of members) {
        if (member.views === null || member.posts === null)
          prizeMissing.push(`${member.name} 个人普通视频播放／投稿`);
      }
    return {
      teamId: team.id,
      shortName: team.short_name || team.name || "-",
      teamName: team.name || "-",
      hasApprovedData: proposed.hasApprovedData,
      proposed: proposed.values,
      values,
      details: proposed.details,
      members,
      a,
      eligible,
      b: { x: 0, youtube: 0, shorts: 0, extra: 0, score: 0, ranks: {} },
      c: {
        growth: eligible ? growth : 0,
        popular: eligible ? popular : 0,
        events: eligible ? events : 0,
        score: cScore,
      },
      total: null,
      rank: null,
      prize: {
        ranking: 0,
        views: 0,
        posts: 0,
        popular: 0,
        total: 0,
        winners: [],
      },
      missing: [...scoreMissing, ...prizeMissing],
      scoreMissing,
      prizeMissing,
    };
  });
  const eligible = teams.filter((team) => team.eligible);
  for (const field of rankingFields) {
    const ranks = competitionRanks(
      eligible.map((team) => ({ id: team.teamId, value: team.values[field] })),
    );
    for (const team of eligible)
      team.b.ranks[field] = ranks.get(team.teamId) ?? null;
  }
  for (const team of eligible) {
    const hit = (field: RankingField) =>
      team.b.ranks[field] != null && team.b.ranks[field]! <= 5 ? 1 : 0;
    const xHits = hit("xViews") + hit("xEngagements");
    const shortHits =
      hit("shortViews") + hit("shortLikes") + hit("shortReposts");
    team.b.x = xHits === 2 ? 5 : xHits * 2;
    team.b.youtube =
      5 * (hit("officialViews") + hit("memberViews") + hit("videoPosts"));
    team.b.shorts = shortHits === 3 ? 10 : shortHits * 3;
    team.b.extra = Math.min(
      20,
      Math.max(0, (team.values.designatedLong ?? 0) - 4) * 5 +
        Math.max(0, (team.values.designatedShort ?? 0) - 8) * 3,
    );
    team.b.score = team.b.x + team.b.youtube + team.b.shorts + team.b.extra;
    team.total = team.scoreMissing.length
      ? null
      : (team.a.score ?? 0) + team.b.score + (team.c.score ?? 0);
  }
  for (const team of teams.filter((team) => !team.eligible))
    team.total = team.hasApprovedData ? team.a.score : null;
  // An incomplete eligible team can alter everyone else's rank and payout.
  const scoreIncomplete = teams.some(
    (team) => team.hasApprovedData && team.scoreMissing.length > 0,
  );
  const prizeIncomplete =
    prizeEnabled &&
    teams.some(
      (team) =>
        team.hasApprovedData &&
        (team.a.score === null || team.prizeMissing.length > 0),
    );
  const incomplete = scoreIncomplete || prizeIncomplete;
  if (!scoreIncomplete) {
    const ranks = competitionRanks(
      eligible.map((team) => ({ id: team.teamId, value: team.total })),
    );
    for (const team of eligible) {
      const rank = ranks.get(team.teamId) ?? null;
      team.rank = rank !== null && rank <= 5 ? rank : null;
      if (!prizeEnabled || team.rank === null) continue;
      const tied = eligible.filter((other) => other.total === team.total);
      const pool = rankPrizes
        .slice(team.rank - 1, team.rank - 1 + tied.length)
        .reduce((sum, prize) => sum + prize, 0);
      team.prize.ranking = Math.floor(pool / tied.length);
    }
  }
  if (prizeEnabled && !prizeIncomplete) {
    const members = eligible.flatMap((team) =>
      team.members.map((member) => ({ ...member, teamId: team.teamId })),
    );
    if (new Set(members.map((member) => member.id)).size !== members.length)
      throw new Error("同月个人奖励名单存在重复成员，请先核查所属战队。");
    for (const field of ["views", "posts"] as const) {
      const max = Math.max(0, ...members.map((member) => member[field] ?? 0));
      const winners =
        max > 0 ? members.filter((member) => member[field] === max) : [];
      for (const winner of winners) {
        const team = eligible.find((team) => team.teamId === winner.teamId)!;
        team.prize[field] += Math.floor(50000 / winners.length);
        team.prize.winners.push(
          `${winner.name} · YT ${field === "views" ? "播放量" : "投稿数"}第一 · ¥${Math.floor(50000 / winners.length).toLocaleString("ja-JP")}`,
        );
      }
    }
    const popular = eligible.filter(
      (team) => (team.values.bonusVideos ?? 0) > 0,
    );
    for (const team of popular)
      team.prize.popular = Math.floor(240000 / popular.length);
  }
  for (const team of teams)
    team.prize.total =
      team.prize.ranking +
      team.prize.views +
      team.prize.posts +
      team.prize.popular;
  const allocated = teams.reduce((sum, team) => sum + team.prize.total, 0);
  if (
    allocated > 2000000 ||
    teams.some(
      (team) => team.total !== null && !Number.isSafeInteger(team.total),
    )
  )
    throw new Error("评分或奖金超出安全范围，请核对补录数字。");
  return {
    ruleVersion: incentiveRuleVersion,
    month: context.month,
    prizeEnabled,
    teams,
    incomplete,
    scoreIncomplete,
    prizeIncomplete,
    allocated,
    unallocated: prizeEnabled ? 2000000 - allocated : 0,
  };
}
