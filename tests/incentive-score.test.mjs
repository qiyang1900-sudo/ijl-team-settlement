import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import crypto from "node:crypto";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";

const root = path.resolve(import.meta.dirname, "..");
export function compile(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      Error,
      URL,
      Date,
      Intl,
      Request,
      Response,
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public-key",
          SUPABASE_SERVICE_ROLE_KEY: "test-only",
        },
      },
      require: (name) => imports[name] || {},
    },
  );
  return exports;
}
const monthly = compile("src/lib/monthly-data.ts");
const content = compile("src/lib/monthly-content.ts");
const activities = compile("src/lib/club-activities.ts");
const legacy = compile("src/lib/legacy-designated.ts");
// Synthetic evidence keeps private spreadsheet identifiers out of the repo.
const archive = { sources: Object.entries({
  AWG: [[2,4], [0,0], [2,4]], AXIZ: [[1,0], [2,0], [0,0]],
  DFM: [[4,8], [5,6], [5,5]], FL: [[0,0], [0,1], [0,0]],
  QTD: [[0,0], [0,0], [0,0]], RC: [[0,0], [0,0], [1,2]],
  SZ: [[2,6], [1,4], [3,2]], ZETA: [[4,7], [12,9], [2,4]],
}).map(([team, counts]) => ({
  team, spreadsheetId: `fixture-${team}`, sheetId: 1, sheetName: "Designated",
  entries: counts.flatMap(([long, short], index) => Array.from({ length: long + short }, (_, i) => ({
    row: index * 30 + i + 3, title: i < long ? "Long" : "ショート",
    url: i < long ? `https://youtu.be/${team}-${index}-${i}` : `https://youtube.com/shorts/${team}-${index}-${i}`,
    publishedOn: index === 2 && team === "ZETA" ? "9/xx" : `2026/0${index+7}/20`,
    month: `2026-0${index+7}`,
    platform: i < long ? (team === "SZ" && index === 2 ? "youtube_live" : "youtube") : "youtube_short",
    countAsLong: team === "SZ" && index === 2 && i < long,
  }))),
})) };
archive.sources.find((source) => source.team === "ZETA").entries.push({
  ...archive.sources.find((source) => source.team === "ZETA").entries[4],
  row: 99, url: "https://youtube.com/shorts/ZETA-0-4?si=duplicate",
});
for (const team of ["RC", "QTD"])
  archive.sources.find((source) => source.team === team).entries.push({
    row: 100, title: "No month", url: `https://youtu.be/${team}-unknown`,
    month: null, publishedOn: "", platform: "youtube",
  });
const legacyForMonth = (month) => legacy.legacyDesignatedForMonth(month, archive.sources);
const api = compile("src/lib/incentive-score.ts", {
  "./monthly-data": monthly,
  "./monthly-content": content,
  "./club-activities": activities,
});
const storage = compile("src/lib/incentive-store.ts", {
  "node:crypto": crypto,
  "./monthly-data": monthly,
  "./incentive-score": api,
  "./legacy-designated": legacy,
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const fields = Object.keys(api.incentiveFields);
const goodValues = () => ({
  ...Object.fromEntries(fields.map((key) => [key, 0])),
  officialVideos: 2,
  designatedLong: 4,
  designatedLongEvent: 2,
  designatedShort: 8,
  designatedShortEvent: 4,
  streams: 20,
  shortPosts: 5,
  officialTweets: 15,
  ...Object.fromEntries(api.rankingFields.map((key) => [key, 1])),
});

function fixture(count = 1, month = "2026-07") {
  const teams = Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    name: `Team ${i}`,
    short_name: `T${i}`,
    is_active: true,
  }));
  const row = (team, official) => ({
    ...monthly.emptyMonthlyPlayerRow(0),
    id: official ? "official" : `m${team.id}`,
    playerId: official ? undefined : `p${team.id}`,
    playerName: official ? `${team.short_name}公式` : `Player ${team.id}`,
    playerRole: "選手",
    youtubeVideoViews: "100",
    youtubeVideoPostCount: "2",
    xFollowerCount: "1000",
    youtubeSubscriberCount: "1000",
  });
  const submissions = teams.map((team) => ({
    team_id: team.id,
    target_month: month,
    status: "approved",
    player_rows: [row(team, true), row(team, false)],
    content_entries: [],
    content_skipped: true,
  }));
  const reviews = teams.map((team) => ({
    team_id: team.id,
    target_month: month,
    status: "reviewed",
    inputs: {
      overrides: goodValues(),
      individuals: {},
      note: "Fixture verified",
    },
    source_hash: "source",
  }));
  return { context: { month, teams, submissions, tiktokRows: [] }, reviews };
}
const compute = (fixture) =>
  api.buildIncentiveMonth(fixture.context, fixture.reviews);

function automaticFixture(count = 1, month = "2026-10") {
  const f = fixture(count, month);
  f.reviews = [];
  for (const submission of f.context.submissions) {
    const [official, member] = submission.player_rows;
    Object.assign(official, {
      youtubeStreamCount: "10",
      youtubeShortPostCount: "5",
      xTweetCount: "15",
    });
    Object.assign(member, {
      youtubeStreamCount: "10",
      youtubeShortPostCount: "0",
    });
    submission.content_skipped = false;
    submission.content_entries = Array.from({ length: 12 }, (_, index) => ({
      ...content.emptyContentEntry(`work-${index}`, "designated"),
      title: `Work ${index}`,
      accountId: "official",
      platform: index < 4 ? "youtube" : "youtube_short",
      url: `https://youtu.be/${submission.team_id}-${index}`,
      publishedOn: `${month}-01`,
      durationSeconds: "300",
      topic: "game_event",
    }));
  }
  return f;
}

function assertNotice(result, field, kind) {
  assert.ok(
    result.notices.some((notice) =>
      notice.field === field && notice.kind === kind &&
      typeof notice.message === "string" && notice.message.trim().length > 0),
    `Expected ${kind} notice for ${field}`,
  );
}

test("Shorts repost ranking combines official, player and coach YT with TT, excluding unknowns and real zero", () => {
  const f = fixture(6, "2026-10");
  f.context.submissions.forEach((submission, index) => {
    submission.player_rows[0].youtubeShortRepostCount = String(index * 10);
    submission.player_rows[1].youtubeShortRepostCount = "0";
    submission.player_rows.push({ ...submission.player_rows[1], id: `coach-${index}`, playerId: `coach-${index}`, playerRole: "コーチ", youtubeShortRepostCount: String(index) });
    f.context.tiktokRows.push({ month: "2026-10", teamShortName: `T${index}`, isOfficial: true, repostCount: index });
    delete f.reviews[index].inputs.overrides.shortReposts;
  });
  const result = compute(f);
  for (let i = 0; i < 6; i++) {
    const proposed = api.proposeIncentiveValues(f.context.teams[i], f.context);
    assert.equal(proposed.values.shortReposts, i * 12);
    const team = result.teams.find((team) => team.teamId === `t${i}`);
    assert.equal(team.b.shorts, i === 0 ? 6 : 10);
  }
  f.context.tiktokRows[1].repostCount = undefined;
  let proposed = api.proposeIncentiveValues(f.context.teams[1], f.context);
  assert.equal(proposed.values.shortReposts, null);
  assert.ok(proposed.details.some((line) => line.includes("YT Shorts 11；TT 待补充")));
  f.context.tiktokRows[1].repostCount = 1;
  f.context.submissions[1].player_rows[0].youtubeShortRepostCount = "";
  assert.equal(api.proposeIncentiveValues(f.context.teams[1], f.context).values.shortReposts, null);
  f.context.submissions[1].player_rows[0].youtubeShortRepostCount = "10";
  f.context.tiktokIssues = [{ month: "2026-10", team: "T1" }];
  assert.equal(api.proposeIncentiveValues(f.context.teams[1], f.context).values.shortReposts, null);
  f.context.submissions[1].status = "submitted";
  proposed = api.proposeIncentiveValues(f.context.teams[1], f.context);
  assert.equal(proposed.hasApprovedData, false);
  assert.equal(proposed.values.shortReposts, null);
});

test("new repost data participates in source revisions without adding a value to historical rows", () => {
  const f = fixture(1, "2026-09");
  const before = storage.incentiveHash(storage.sourceForIncentiveTeam(f.context, "t0"));
  const source = storage.sourceForIncentiveTeam(f.context, "t0");
  assert.equal(Object.hasOwn(source.submissions[0].player_rows[0], "youtubeShortRepostCount"), false);
  f.context.submissions[0].player_rows = monthly.parseMonthlyPlayerRows(f.context.submissions[0].player_rows);
  assert.equal(storage.incentiveHash(storage.sourceForIncentiveTeam(f.context, "t0")), before);
  f.context.submissions[0].player_rows[0].youtubeShortRepostCount = "0";
  assert.notEqual(storage.incentiveHash(storage.sourceForIncentiveTeam(f.context, "t0")), before);
});

function compileScoreBoard() {
  return compile("src/app/admin/team-scores/IncentiveScoreBoard.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "lucide-react": icons,
    "@/lib/incentive-score": api,
  });
}

function renderScoreBoard(f) {
  const Board = compileScoreBoard().default;
  const result = compute(f);
  return renderToStaticMarkup(React.createElement(Board, {
    result,
    rankingHash: storage.incentiveRankingHash(result),
    reviews: f.reviews,
    hashes: Object.fromEntries(f.context.teams.map((team) => [team.id, "source"])),
    sourceHash: "month-source",
    snapshot: null,
    evidence: {},
    legacy: [],
  }));
}

test("scoreboard recognizes received review versions by timestamp rather than lexical format", () => {
  const { hasReceivedReviewVersion } = compileScoreBoard();
  const saved = "2026-11-11T01:00:00.123Z";
  for (const [label, received, pending, expected] of [
    ["equivalent PostgreSQL timestamp", "2026-11-11T01:00:00.123+00:00", saved, true],
    ["older timestamp", "2026-11-11T01:00:00.122+00:00", saved, false],
    ["newer timestamp", "2026-11-11T01:00:00.124+00:00", saved, true],
    ["missing received version", undefined, saved, false],
    ["invalid received version", "invalid", saved, false],
    ["invalid saved version", saved, "invalid", false],
    ["no saved version", saved, undefined, true],
    ["neither version present", undefined, undefined, true],
  ]) {
    assert.equal(hasReceivedReviewVersion(received, pending), expected, label);
  }
});

test("scoreboard renders an empty month without invalid numeric output", () => {
  const f = fixture(8, "2026-10");
  f.context.submissions = [];
  f.reviews = [];
  const html = renderScoreBoard(f);
  assert.ok(html.length > 0);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test("scoreboard renders automatic scores and notices without requiring review records", () => {
  const f = automaticFixture();
  const html = renderScoreBoard(f);
  assert.match(html, /T0/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test("A uses new thresholds, per-section floors and default X tag points", () => {
  const full = goodValues();
  assert.equal(api.calculateBase(full).score, 60);
  assert.equal(api.calculateBase({ ...full, officialTweets: 14 }).x, 5);
  assert.equal(api.calculateBase({ ...full, shortPosts: 4 }).shorts, 5);
  for (const key of [
    "officialVideos",
    "designatedLong",
    "designatedShort",
    "streams",
  ])
    assert.equal(api.calculateBase({ ...full, [key]: 0 }).youtube, 20);
  assert.equal(
    api.calculateBase({
      ...full,
      officialVideos: 0,
      designatedLong: 0,
      designatedShort: 0,
      streams: 0,
    }).youtube,
    0,
  );
  assert.equal(
    api.calculateBase({ ...full, officialVideos: null }).score,
    50,
  );
  assert.equal(
    api.calculateBase({ ...full, designatedLongEvent: 1 }).youtube,
    30,
  );
  assert.equal(
    api.calculateBase({ ...full, designatedShort: 0, designatedShortEvent: 0 })
      .youtube,
    20,
  );
});

test("each missing required A condition deducts only its group and leaves raw nulls intact", () => {
  for (const field of fields.filter((key) => api.incentiveFields[key].group === "A" && !("informational" in api.incentiveFields[key]))) {
    const values = { ...goodValues(), [field]: null };
    const before = structuredClone(values);
    const a = api.calculateBase(values);
    assert.equal(a.score, 50, field);
    assert.equal(a.youtube, ["shortPosts", "officialTweets"].includes(field) ? 30 : 20, field);
    assert.equal(a.shorts, field === "shortPosts" ? 5 : 15, field);
    assert.equal(a.x, field === "officialTweets" ? 5 : 15, field);
    assert.equal(a.deductions.length, 1, field);
    assert.deepEqual(values, before);
  }
  const values = Object.fromEntries(fields.map((key) => [key, null]));
  const a = api.calculateBase(values);
  assert.equal(a.youtube, 0);
  assert.equal(a.shorts, 5);
  assert.equal(a.x, 5);
  assert.equal(a.score, 10);
  assert.ok(Object.values(values).every((value) => value === null));
  assert.equal(api.calculateBase({
    ...goodValues(), designatedLong: null, designatedLongEvent: null,
  }).youtube, 20);
});

test("known TT posts meet A's Shorts threshold despite missing YT posts without filling raw blanks", () => {
  for (const posts of [4, 5, 8]) {
    const f = automaticFixture();
    for (const row of f.context.submissions[0].player_rows)
      row.youtubeShortPostCount = "";
    f.context.tiktokRows = [{
      month: "2026-10", teamShortName: "T0", accountName: "TT",
      link: "https://tiktok.com/@tt", isOfficial: false, postCount: posts,
    }];
    const before = plain(f.context);
    const team = compute(f).teams[0];
    assert.equal(team.proposed.shortPosts, posts >= 5 ? posts : null);
    assert.equal(team.values.shortPosts, posts >= 5 ? posts : null);
    assert.equal(team.a.shorts, posts >= 5 ? 15 : 5);
    assert.equal(team.a.score, posts >= 5 ? 60 : 50);
    assert.deepEqual(plain(f.context), before);
    assert.ok(f.context.submissions[0].player_rows.every((row) => row.youtubeShortPostCount === ""));
    f.context.tiktokIssues = [{ month: "2026-10", team: "T0" }];
    const flagged = compute(f).teams[0];
    assert.equal(flagged.values.shortPosts, null);
    assert.equal(flagged.a.shorts, 5);
  }
  const knownYT = automaticFixture();
  assert.equal(compute(knownYT).teams[0].values.shortPosts, 5);
  assert.equal(compute(knownYT).teams[0].a.shorts, 15);
});

test("AWG-like September claims count four explicit Shorts separately from two long videos", () => {
  const f = automaticFixture(1, "2026-09");
  const submission = f.context.submissions[0];
  submission.content_entries = submission.content_entries.slice(0, 6).map((work, index) => ({
    ...work,
    platform: "youtube",
    url: index < 2 ? `https://youtu.be/long-${index}` : `https://youtube.com/shorts/short-${index}?si=share`,
  }));
  const before = plain(f.context);
  const team = compute(f).teams[0];
  assert.equal(team.proposed.designatedLong, 2);
  assert.equal(team.proposed.designatedLongEvent, 2);
  assert.equal(team.proposed.designatedShort, 4);
  assert.equal(team.proposed.designatedShortEvent, 4);
  assert.equal(team.a.youtube, 10);
  assert.equal(team.a.score, 40);
  assert.equal(team.eligible, false);
  assert.equal(team.b.extra, 0);
  assert.deepEqual(plain(f.context), before);
});

test("misclassified Shorts cannot earn D's lower ordinary-video view threshold", () => {
  const f = fixture(1, "2026-09");
  delete f.reviews[0].inputs.overrides.bonusVideos;
  const work = {
    ...content.emptyContentEntry("short-bonus", "popular"),
    accountId: "pt0", platform: "youtube", url: "https://youtube.com/shorts/bonus",
    publishedOn: "2026-09-01", views: "200001", claims: ["bonus_video"],
  };
  f.context.submissions[0].content_entries = [work];
  assert.equal(compute(f).teams[0].prize.popular, 0);
  work.views = "1000001";
  assert.equal(compute(f).teams[0].prize.popular, 240000);
});

test("AXIZ-like TT anomalies retain other valid accounts for A's minimum but not B's complete totals", () => {
  for (const validPosts of [1, 2, 8]) {
    const f = automaticFixture(1, "2026-09");
    f.context.submissions[0].player_rows[0].youtubeShortPostCount = "3";
    f.context.submissions[0].content_entries = f.context.submissions[0].content_entries.slice(0, 2);
    f.context.tiktokRows = [
      { month: "2026-09", teamShortName: "T0", accountName: "T0_Valid", link: "https://tiktok.com/@valid", postCount: validPosts, videoViews: 100, isOfficial: false },
      { month: "2026-09", teamShortName: "T0", accountName: "T0_Kakiri", link: "https://tiktok.com/@flagged", postCount: 1000, videoViews: 999999, isOfficial: false },
    ];
    f.context.tiktokIssues = [{ month: "2026-09", team: "T0", account: " t0_kakiri " }];
    const before = plain(f.context);
    const team = compute(f).teams[0];
    assert.equal(team.proposed.shortPosts, validPosts >= 2 ? validPosts + 3 : null);
    assert.equal(team.a.shorts, validPosts >= 2 ? 15 : 5);
    assert.equal(team.a.score, validPosts >= 2 ? 40 : 30);
    assert.equal(team.proposed.shortViews, null);
    assert.equal(team.proposed.ttGrowth, null);
    if (validPosts >= 2) assert.ok(team.details.some((text) => text.includes(`至少 ${validPosts + 3} 条`)));
    assert.deepEqual(plain(f.context), before);
  }
});

test("TT post proof excludes stale link-named accounts and ignores issues from other months or teams", () => {
  const f = automaticFixture();
  f.context.submissions[0].player_rows[0].youtubeShortPostCount = "0";
  f.context.tiktokRows = [
    { month: "2026-10", teamShortName: "T0", accountName: "Invalid", link: "https://tiktok.com/@bad", postCount: 100, isOfficial: false },
    { month: "2026-10", teamShortName: "T0", accountName: "Valid", link: "https://tiktok.com/@ok", postCount: 5, isOfficial: true },
  ];
  f.context.tiktokIssues = [
    { month: "2026-10", team: "T0", account: "https://tiktok.com/@bad" },
    { month: "2026-09", team: "T0", account: "Valid" },
    { month: "2026-10", team: "T1", account: "Valid" },
  ];
  assert.equal(compute(f).teams[0].proposed.shortPosts, 5);
  f.context.tiktokRows[1].postCount = null;
  assert.equal(compute(f).teams[0].proposed.shortPosts, null);
  f.context.tiktokRows[1].postCount = 0;
  assert.equal(compute(f).teams[0].proposed.shortPosts, null);
});

test("September uncollected designated claims remain absent with the same deductions", () => {
  const f = automaticFixture(1, "2026-09");
  f.context.submissions[0].content_entries = [];
  const before = plain(f.context);
  const team = compute(f).teams[0];
  assert.equal(team.proposed.designatedLong, null);
  assert.equal(team.proposed.designatedShort, null);
  assert.equal(team.a.youtube, 10);
  assert.equal(team.a.score, 40);
  assertNotice(team, "designatedLong", "not_collected");
  assertNotice(team, "designatedShort", "not_collected");
  assert.deepEqual(plain(f.context), before);
});

test("missing required A data does not block earned B/C scores or another team's settlement", () => {
  const f = automaticFixture(2);
  f.context.submissions[0].player_rows[0].youtubeStreamCount = "";
  const before = structuredClone(f.context);
  const result = compute(f);
  const [partial, complete] = result.teams;
  assert.equal(partial.values.streams, null);
  assert.equal(partial.a.score, 50);
  assert.equal(partial.eligible, true);
  assert.equal(partial.b.score, 15);
  assert.equal(partial.total, 65);
  assert.equal(partial.rank, 2);
  assert.equal(partial.prize.ranking, 400000);
  assert.equal(complete.total, 75);
  assert.equal(complete.rank, 1);
  assert.equal(complete.prize.ranking, 600000);
  assert.equal(result.incomplete, false);
  assertNotice(partial, "streams", "missing");
  assert.deepEqual(plain(f.context), plain(before));
});

test("unknown optional metrics contribute no points without blocking automatic rankings or payouts", () => {
  const f = automaticFixture(2);
  const before = structuredClone(f.context);
  const result = compute(f);
  for (const team of result.teams) {
    for (const field of ["shortViews", "shortLikes", "shortReposts", "xGrowth", "ttGrowth", "ytGrowth"]) {
      assert.equal(team.proposed[field], null, field);
      assert.equal(team.values[field], null, field);
      assertNotice(team, field, "missing");
    }
    assert.equal(team.a.score, 60);
    assert.equal(team.b.shorts, 0);
    assert.equal(team.c.score, 0);
    assert.equal(team.total, 75);
    assert.equal(team.rank, 1);
    assert.equal(team.prize.ranking, 500000);
    assert.equal(team.prize.views, 25000);
    assert.equal(team.prize.posts, 25000);
  }
  assert.equal(result.scoreIncomplete, false);
  assert.equal(result.prizeIncomplete, false);
  assert.equal(result.incomplete, false);
  assert.equal(result.allocated, 1100000);
  assert.deepEqual(plain(f.context), plain(before));
});

test("league calculation and prizes only start July, retaining June as growth baseline", () => {
  assert.equal(api.incentiveStartMonth, "2026-07");
  assert.equal(api.incentiveRuleVersion, "2026-07-v4");
  assert.equal(compute(fixture()).ruleVersion, "2026-07-v4");
  for (const month of ["2026-04", "2026-05", "2026-06"])
    assert.throws(() => compute(fixture(1, month)), /7 月/);
  assert.equal(api.previousIncentiveMonth("2026-07"), "2026-06");
  assert.equal(compute(fixture()).allocated, 700000);
});
test("legacy designated archive counts verified months, titles, accepted streams and duplicate video IDs", () => {
  const expected = {
    AWG: [[2,4], [null,null], [2,4]],
    AXIZ: [[1,0], [2,0], [null,null]],
    DFM: [[4,8], [5,6], [5,5]],
    FL: [[null,null], [0,1], [null,null]],
    QTD: [[null,null], [null,null], [null,null]],
    RC: [[null,null], [null,null], [1,2]],
    SZ: [[2,6], [1,4], [3,2]],
    ZETA: [[4,7], [12,9], [2,4]],
  };
  for (const [name, months] of Object.entries(expected)) {
    months.forEach(([long, short], index) => {
      const month = `2026-0${index + 7}`;
      const f = automaticFixture(1, month);
      f.context.teams[0].short_name = name;
      f.context.submissions[0].content_entries = [];
      f.context.designatedSources = legacyForMonth(month);
      const before = plain(f.context);
      const result = compute(f).teams[0];
      assert.equal(result.proposed.designatedLong, long, `${name} ${month} long`);
      assert.equal(result.proposed.designatedShort, short, `${name} ${month} short`);
      assert.equal(result.proposed.hotOfficialVideo, null);
      assert.equal(result.proposed.bonusVideos, null);
      assert.deepEqual(plain(f.context), before);
      if (long !== null) {
        assert.ok(!result.notices.some((notice) => notice.field === "designatedLong"));
        assert.equal(result.b.extra, result.eligible ? Math.min(20, Math.max(0,long-4)*5+Math.max(0,short-8)*3) : 0);
      }
    });
  }
});

test("archive only supplements designated claims without changing existing website records or other months", () => {
  for (const month of ["2026-06", "2026-10", "2027-07"])
    assert.deepEqual(plain(legacyForMonth(month)), []);
  const f = automaticFixture(1, "2026-09");
  f.context.teams[0].short_name = "AWG";
  f.context.designatedSources = legacyForMonth("2026-09");
  const works = f.context.designatedSources.find((source) => source.team === "AWG" && source.entries.length).entries;
  f.context.submissions[0].content_entries = works.map((entry, i) => ({
    ...content.emptyContentEntry(`existing-${i}`, "designated"),
    accountId: "official", title: entry.title, platform: "youtube",
    url: i === 4 ? entry.url + "?si=other" : entry.url,
    publishedOn: "2026-09-30",
  }));
  const before = plain(f.context.submissions);
  const result = compute(f).teams[0];
  assert.equal(result.values.designatedLong, 2);
  assert.equal(result.values.designatedShort, 4);
  assert.deepEqual(plain(f.context.submissions), before);
  assert.ok(result.details.some((line) => line.includes("去重")));
  f.context.submissions[0].status = "submitted";
  assert.equal(compute(f).teams[0].hasApprovedData, false);
  assert.equal(compute(f).teams[0].total, null);
  f.context.submissions[0].status = "approved";
  f.context.month = "2026-10";
  f.context.submissions[0].target_month = "2026-10";
  f.context.submissions[0].content_entries = [];
  assert.equal(compute(f).teams[0].values.designatedLong, 0);
});

test("archive sources participate in team revision hashes and preserve manual score adjustments", () => {
  const f = automaticFixture(1, "2026-07");
  f.context.teams[0].short_name = "DFM";
  f.context.submissions[0].content_entries = [];
  const before = storage.incentiveHash(storage.sourceForIncentiveTeam(f.context, "t0"));
  f.context.designatedSources = legacyForMonth("2026-07");
  assert.notEqual(storage.incentiveHash(storage.sourceForIncentiveTeam(f.context, "t0")), before);
  const reviewed = fixture().reviews[0];
  reviewed.inputs = { overrides: {}, individuals: {}, scores: { aYoutube: 25 }, note: "Preserved manual adjustment" };
  f.reviews = [reviewed];
  const team = compute(f).teams[0];
  assert.equal(team.automaticScores.aYoutube, 30);
  assert.equal(team.a.youtube, 25);
});

test("workspace reads private designated sources for July-September only and fails closed on source errors", async () => {
  const f = automaticFixture(1, "2026-07");
  f.context.teams[0].short_name = "DFM";
  f.context.submissions[0].content_entries = [];
  const tables = {
    teams: f.context.teams, monthly_data_submissions: f.context.submissions,
    team_incentive_reviews: [], monthly_incentive_results: [], team_monthly_scores: [],
    team_incentive_designated_sources: [{
      team_id: "t0", target_month: "2026-07",
      sources: archive.sources.filter((source) => source.team === "DFM"),
    }],
  };
  let sourceError = null;
  const reads = [];
  const client = { from(table) {
    reads.push(table);
    const chain = {
      select() { return chain; }, eq() { return chain; }, in() { return chain; },
      order() { return chain; }, limit() { return chain; },
      then(resolve) { return Promise.resolve({
        data: tables[table], error: table === "team_incentive_designated_sources" ? sourceError : null,
      }).then(resolve); },
    };
    return chain;
  }};
  const loader = compile("src/lib/incentive-store.ts", {
    "node:crypto": crypto, "./monthly-data": monthly, "./incentive-score": api,
    "./legacy-designated": legacy, "./tiktok-dataset": { loadTiktokDataset: async () => ({ rows: [] }) },
  });
  const before = plain(tables);
  const workspace = await loader.loadIncentiveWorkspace(client, "2026-07");
  assert.equal(workspace.result.teams[0].proposed.designatedLong, 4);
  assert.equal(workspace.result.teams[0].proposed.designatedShort, 8);
  assert.deepEqual(plain(tables), before);
  sourceError = { message: "private source unavailable" };
  await assert.rejects(loader.loadIncentiveWorkspace(client, "2026-07"), /未按零分继续计算/);
  reads.length = 0;
  await loader.loadIncentiveWorkspace(client, "2026-10");
  assert.equal(reads.includes("team_incentive_designated_sources"), false);
});

test("score page excludes pre-July months and redirects old URLs without querying or writing", async () => {
  let reads = 0;
  const query = {
    select() { return query; }, eq() { return query; }, gte() { return query; }, lte() { return query; },
    order: async () => ({ data: [{ target_month: "2026-06" }, { target_month: "2026-09" }] }),
  };
  const page = compile("src/app/admin/team-scores/page.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "@/lib/admin-auth": { getAdminSession: async () => true },
    "@/lib/incentive-score": api,
    "@/lib/month-options": {
      getCurrentMonthValue: () => "2026-11",
      buildMonthOptions: () => ["2026-05","2026-06","2026-07","2026-08","2026-09","2026-10","2026-11"].map((value) => ({ value,label:value })),
    },
    "@/lib/supabase-server": { createSupabaseServerClient: () => ({ from() { reads++; return query; } }) },
    "next/navigation": { redirect: (url) => { throw new Error(url); } },
    "./IncentiveScoresPage": { default: () => null },
  }).default;
  await assert.rejects(page({ searchParams: Promise.resolve({ month: "2026-06" }) }), /month=2026-07/);
  assert.equal(reads, 0);
  const element = await page({ searchParams: Promise.resolve({}) });
  assert.equal(element.props.month, "2026-09");
  assert.deepEqual(plain(element.props.months.map((item) => item.value)),
    ["2026-07","2026-08","2026-09","2026-10","2026-11"]);
});

test("API refuses calculation, review saves and settlement before July without writing", async () => {
  const h = routeHarness();
  for (const month of ["2026-05", "2026-06"])
    for (const action of ["save", "finalize"]) {
      const response = await h.send({ month, action });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /7 月/);
    }
  assert.equal(h.writes.length, 0);
});

test("B only ranks eligible teams, scores each qualifying criterion and caps extras at20", () => {
  const f = fixture(7);
  f.reviews.forEach((row, index) => {
    for (const key of api.rankingFields)
      row.inputs.overrides[key] = 100 - index;
  });
  f.reviews[0].inputs.overrides.officialVideos = 0;
  f.reviews[0].inputs.overrides.streams = 0;
  f.reviews[1].inputs.overrides.designatedLong = 100;
  const r = compute(f);
  assert.equal(r.teams[0].eligible, false);
  assert.equal(r.teams[0].b.score, 0);
  assert.equal(r.teams[1].b.ranks.xViews, 1);
  assert.equal(r.teams[1].b.score, 50);
  assert.equal(r.teams[5].b.score, 30);
  assert.equal(r.teams[6].b.score, 0);
  assert.equal(r.teams[0].prize.total, 0);
});
test("B ties at fifth all count, zero never ranks and null never becomes zero", () => {
  assert.deepEqual(
    plain([
      ...api
        .competitionRanks(
          [10, 9, 8, 7, 6, 6, 0, null].map((value, i) => ({
            id: String(i),
            value,
          })),
        )
        .values(),
    ]),
    [1, 2, 3, 4, 5, 5, null, null],
  );
  const f = fixture();
  for (const key of api.rankingFields) f.reviews[0].inputs.overrides[key] = 0;
  assert.equal(compute(f).teams[0].b.score, 0);
  f.reviews[0].inputs.overrides.xViews = 1;
  f.reviews[0].inputs.overrides.shortViews = 1;
  f.reviews[0].inputs.overrides.shortLikes = 1;
  const r = compute(f);
  assert.equal(r.teams[0].b.x, 2);
  assert.equal(r.teams[0].b.shorts, 6);
});
test("C uses per-account growth, per-work popular caps, and uncapped events", () => {
  const f = fixture();
  Object.assign(f.reviews[0].inputs.overrides, {
    xGrowth: 2,
    ttGrowth: 3,
    ytGrowth: 4,
    hotShort: 10,
    hotX: 6,
    hotOfficialVideo: 8,
    onlineEvents: 2,
    offlineEvents: 3,
    tournamentUnits: 7,
  });
  const c = compute(f).teams[0].c;
  assert.deepEqual(plain(c), {
    growth: 22,
    popular: 30,
    events: 54,
    score: 106,
  });
});
test("final prize ties share occupied positions; fifth tie shares only fifth prize", () => {
  const f = fixture(6);
  [10, 10, 8, 6, 4, 4].forEach(
    (value, i) => (f.reviews[i].inputs.overrides.onlineEvents = value),
  );
  const r = compute(f);
  assert.deepEqual(plain(r.teams.map((t) => t.rank)), [1, 1, 3, 4, 5, 5]);
  assert.deepEqual(
    plain(r.teams.map((t) => t.prize.ranking)),
    [500000, 500000, 300000, 200000, 80000, 80000],
  );
});
test("vacant places unpaid, awards floor equally, same member can win both", () => {
  const one = compute(fixture());
  assert.equal(one.teams[0].prize.views, 50000);
  assert.equal(one.teams[0].prize.posts, 50000);
  assert.equal(one.teams[0].prize.popular, 0);
  assert.equal(one.unallocated, 1300000);
  const three = compute(fixture(3));
  assert.ok(
    three.teams.every(
      (t) => t.prize.views === 16666 && t.prize.posts === 16666,
    ),
  );
  assert.equal(three.allocated, 1399995);
  const four = fixture(4);
  four.reviews.forEach((r, i) => (r.inputs.overrides.onlineEvents = i));
  assert.equal(
    compute(four).teams.reduce((sum, t) => sum + t.prize.ranking, 0),
    1500000,
  );
});
test("D popular bonus splits by club, not number of videos", () => {
  const f = fixture(3);
  f.reviews[0].inputs.overrides.bonusVideos = 100;
  f.reviews[1].inputs.overrides.bonusVideos = 1;
  assert.deepEqual(
    plain(compute(f).teams.map((t) => t.prize.popular)),
    [120000, 120000, 0],
  );
});
test("missing D leaves ABC score/rank intact; missing B leaves independent D intact", () => {
  const f = fixture();
  f.context.submissions[0].content_skipped = false;
  delete f.reviews[0].inputs.overrides.bonusVideos;
  let r = compute(f);
  assert.equal(r.teams[0].total, 90);
  assert.equal(r.teams[0].rank, 1);
  assert.equal(r.scoreIncomplete, false);
  assert.equal(r.prizeIncomplete, false);
  assert.equal(r.teams[0].values.bonusVideos, null);
  assert.equal(r.teams[0].prize.views, 50000);
  assert.equal(r.teams[0].prize.posts, 50000);
  f.reviews[0].inputs.overrides.bonusVideos = 0;
  delete f.reviews[0].inputs.overrides.shortLikes;
  r = compute(f);
  assert.equal(r.scoreIncomplete, false);
  assert.equal(r.teams[0].values.shortLikes, null);
  assert.equal(r.teams[0].total, 86);
  assert.equal(r.teams[0].rank, 1);
  assert.equal(r.teams[0].prize.ranking, 600000);
  assert.equal(r.teams[0].prize.views, 50000);
});

test("missing personal metrics omit only their corresponding award across teams", () => {
  const f = fixture(2);
  f.context.submissions[0].player_rows[1].youtubeVideoViews = "";
  f.context.submissions[1].player_rows[1].youtubeVideoPostCount = "";
  f.context.submissions[1].content_skipped = false;
  f.reviews[0].inputs.overrides.bonusVideos = 1;
  delete f.reviews[1].inputs.overrides.bonusVideos;
  const before = structuredClone(f.context);
  const result = compute(f);
  const [first, second] = result.teams;
  assert.equal(first.members[0].views, null);
  assert.equal(second.members[0].posts, null);
  assert.equal(second.values.bonusVideos, null);
  assert.equal(first.prize.views, 0);
  assert.equal(first.prize.posts, 50000);
  assert.equal(first.prize.popular, 240000);
  assert.equal(second.prize.views, 50000);
  assert.equal(second.prize.posts, 0);
  assert.equal(second.prize.popular, 0);
  assert.equal(result.allocated, 1340000);
  assert.equal(result.incomplete, false);
  assertNotice(first, "member:pt0:views", "missing");
  assertNotice(second, "member:pt1:posts", "missing");
  assert.deepEqual(plain(f.context), plain(before));
});

test("all missing views leave their pool unpaid without withholding posts or popular bonuses", () => {
  const f = fixture(2);
  for (const submission of f.context.submissions)
    submission.player_rows[1].youtubeVideoViews = "";
  f.reviews[0].inputs.overrides.bonusVideos = 1;
  const result = compute(f);
  assert.deepEqual(plain(result.teams.map((team) => team.prize.views)), [0, 0]);
  assert.deepEqual(plain(result.teams.map((team) => team.prize.posts)), [25000, 25000]);
  assert.equal(result.teams[0].prize.popular, 240000);
  assert.equal(result.allocated, 1290000);
});

test("pending monthly submissions never earn points/prizes; coaches and historical members do", () => {
  const f = fixture(2);
  f.context.submissions[0].status = "submitted";
  f.context.teams[1].is_active = false;
  f.context.submissions[1].player_rows[1].playerRole = "コーチ";
  const r = compute(f);
  assert.equal(r.teams[0].hasApprovedData, false);
  assert.equal(r.teams[0].prize.total, 0);
  assert.equal(r.teams[1].members.length, 1);
  assert.equal(r.teams[1].prize.views, 50000);
});
test("invalid/empty manual input is not coerced to zero, explicit zero is preserved", () => {
  for (const value of [
    "",
    null,
    "#N/A",
    "-1",
    "1.2",
    "Infinity",
    "9007199254740992",
  ])
    assert.equal(api.incentiveNumber(value), null);
  assert.equal(api.incentiveNumber("０"), 0);
  assert.equal(api.incentiveNumber("1,234"), 1234);
  assert.throws(() =>
    api.normalizeIncentiveReview({ overrides: { shortLikes: "bad" } }),
  );
  assert.deepEqual(
    plain(
      api.normalizeIncentiveReview({
        overrides: { shortLikes: "", shortReposts: "0" },
      }).overrides,
    ),
    { shortReposts: 0 },
  );
});

test("manual score fields expose A3 B4 C3 with enforced caps and uncapped growth/events", () => {
  const expected = {
    aYoutube: ["A", 30], aShorts: ["A", 15], aX: ["A", 15],
    bX: ["B", 5], bYoutube: ["B", 15], bShorts: ["B", 10], bExtra: ["B", 20],
    cGrowth: ["C", null], cPopular: ["C", 30], cEvents: ["C", null],
  };
  assert.deepEqual(plain(Object.fromEntries(Object.entries(api.incentiveScoreFields)
    .map(([key, field]) => [key, [field.group, field.max]]))), expected);
  for (const [field, [, max]] of Object.entries(expected)) {
    for (const value of [0, max ?? 1000000]) {
      const normalized = api.normalizeIncentiveReview({ scores: { [field]: String(value) } });
      assert.equal(normalized.scores[field], value, field);
    }
    for (const value of [-1, 1.5, "bad", "Infinity", "9007199254740992", ...(max === null ? [] : [max + 1])]) {
      assert.throws(() => api.normalizeIncentiveReview({ scores: { [field]: value } }), undefined, `${field}: ${value}`);
    }
    for (const value of ["", " ", null, undefined]) {
      const normalized = api.normalizeIncentiveReview({ scores: { [field]: value } });
      assert.equal(Object.hasOwn(normalized.scores, field), false, field);
    }
  }
});

test("correction detection ignores notes and blanks but treats explicit zero as a correction", () => {
  for (const inputs of [
    undefined, {}, { note: "Read only note" },
    { overrides: { shortLikes: null }, scores: { bX: "" }, individuals: { pt0: {} } },
    { individuals: { pt0: { views: null, posts: " " } } },
  ]) assert.equal(api.hasIncentiveCorrections(inputs), false);
  for (const inputs of [
    { overrides: { shortLikes: 0 } },
    { scores: { bX: 0 } },
    { individuals: { pt0: { views: 0 } } },
  ]) {
    assert.equal(api.hasIncentiveCorrections(inputs), true);
    assert.equal(api.hasIncentiveCorrections(api.normalizeIncentiveReview(inputs)), true);
  }
});

test("only direct B ranking scores depend on the ranking hash, including explicit zero", () => {
  for (const field of ["bX", "bYoutube", "bShorts"]) {
    for (const value of [0, 1])
      assert.equal(api.hasIncentiveRankingCorrections({ scores: { [field]: value } }), true, field);
    for (const value of [null, undefined, "", " "])
      assert.equal(api.hasIncentiveRankingCorrections({ scores: { [field]: value } }), false, field);
  }
  for (const inputs of [
    undefined, {}, { scores: { bExtra: 5 } }, { scores: { cGrowth: 2, cEvents: 3 } },
    { scores: { aYoutube: 30 } }, { overrides: { xViews: 10 } },
    { individuals: { pt0: { views: 0 } } }, { rankingSourceHash: "old" },
  ]) assert.equal(api.hasIncentiveRankingCorrections(inputs), false);
});

test("review staleness checks local source plus ranking source only for direct B corrections", () => {
  assert.equal(api.isIncentiveReviewStale(undefined, "source", "ranking"), false);
  const review = {
    team_id: "t0", target_month: "2026-10", status: "draft", source_hash: "source",
    inputs: { scores: { bX: 0 }, rankingSourceHash: "ranking" },
  };
  assert.equal(api.isIncentiveReviewStale(review, "source", "ranking"), false);
  assert.equal(api.isIncentiveReviewStale(review, "changed-source", "ranking"), true);
  assert.equal(api.isIncentiveReviewStale(review, "source", "changed-ranking"), true);
  delete review.inputs.rankingSourceHash;
  assert.equal(api.isIncentiveReviewStale(review, "source", "ranking"), true);
  for (const scores of [{ bExtra: 0 }, { cGrowth: 1 }, { cPopular: 2 }, { cEvents: 3 }]) {
    review.inputs = { scores, rankingSourceHash: "old" };
    assert.equal(api.isIncentiveReviewStale(review, "source", "ranking"), false);
    assert.equal(api.isIncentiveReviewStale(review, "changed-source", "ranking"), true);
  }
  review.inputs = { scores: { bX: null }, note: "Note only", rankingSourceHash: "old" };
  assert.equal(api.isIncentiveReviewStale(review, "changed-source", "ranking"), false);
});

test("manual A/B/C scores change totals while retaining automatic scores and raw metric values", () => {
  const f = fixture();
  const automatic = compute(f).teams[0];
  f.reviews[0].inputs.scores = {
    aYoutube: 25, aShorts: 10, aX: 10,
    bX: 1, bYoutube: 2, bShorts: 3, bExtra: 4,
    cGrowth: 5, cPopular: 6, cEvents: 7,
  };
  const result = compute(f).teams[0];
  assert.equal(result.a.score, 45);
  assert.equal(result.eligible, true);
  assert.equal(result.b.score, 10);
  assert.equal(result.c.score, 18);
  assert.equal(result.total, 73);
  assert.deepEqual(plain(result.automaticScores), plain(automatic.automaticScores));
  assert.deepEqual(plain(result.values), plain(automatic.values));
  assert.deepEqual(plain(result.proposed), plain(automatic.proposed));
  assert.deepEqual(plain([
    result.a.youtube, result.a.shorts, result.a.x,
    result.b.x, result.b.youtube, result.b.shorts, result.b.extra,
    result.c.growth, result.c.popular, result.c.events,
  ]), [25, 10, 10, 1, 2, 3, 4, 5, 6, 7]);
  f.reviews[0].inputs.scores = { bX: 0, aX: "", cEvents: null };
  const zero = compute(f).teams[0];
  assert.equal(zero.b.x, 0);
  assert.equal(zero.automaticScores.bX, 5);
  assert.equal(zero.a.x, 15);
  assert.equal(zero.c.events, 0);
  assert.equal(zero.total, 85);
});

test("manual A corrections determine eligibility and cannot pay B/C/D to an ineligible team", () => {
  const f = fixture();
  f.reviews[0].inputs.scores = { aYoutube: 0, bX: 5, cEvents: 100 };
  f.reviews[0].inputs.overrides.bonusVideos = 1;
  const result = compute(f).teams[0];
  assert.equal(result.automaticScores.aYoutube, 30);
  assert.equal(result.a.score, 30);
  assert.equal(result.eligible, false);
  assert.equal(result.b.score, 0);
  assert.equal(result.c.score, 0);
  assert.equal(result.total, 30);
  assert.equal(result.rank, null);
  assert.equal(result.prize.total, 0);
});

test("growth uses previous month per account with strict boundaries and missing baselines", () => {
  const f = fixture();
  const before = structuredClone(f.context.submissions[0]);
  before.target_month = "2026-06";
  f.context.submissions.push(before);
  const rows = f.context.submissions[0].player_rows;
  rows[0].xFollowerCount = "1300";
  rows[1].xFollowerCount = "1600";
  rows[0].youtubeSubscriberCount = "1201";
  rows[1].youtubeSubscriberCount = "1601";
  let values = api.proposeIncentiveValues(f.context.teams[0], f.context).values;
  assert.equal(values.xGrowth, 0);
  assert.equal(values.ytGrowth, 2);
  rows[1].xFollowerCount = "1601";
  assert.equal(
    api.proposeIncentiveValues(f.context.teams[0], f.context).values.xGrowth,
    1,
  );
  before.player_rows.pop();
  assert.equal(
    api.proposeIncentiveValues(f.context.teams[0], f.context).values.xGrowth,
    0,
  );
  assertNotice(api.proposeIncentiveValues(f.context.teams[0], f.context), "xGrowth", "missing");
});

test("C retains known X, YT and TT growth accounts when other accounts lack baselines or current values", () => {
  const f = fixture(1, "2026-10");
  const submission = f.context.submissions[0];
  const previous = structuredClone(submission);
  previous.target_month = "2026-09";
  previous.player_rows.shift();
  f.context.submissions.push(previous);
  const member = submission.player_rows[1];
  member.xFollowerCount = "1601";
  member.youtubeSubscriberCount = "1601";
  submission.player_rows.push({
    ...member, id: "coach", playerId: "coach", playerRole: "コーチ",
    xFollowerCount: "", youtubeSubscriberCount: "",
  });
  const tt = {
    teamShortName: "T0", accountName: "Known TT", link: "https://tiktok.com/@known",
    isOfficial: false, followerCount: 1000,
  };
  f.context.tiktokRows = [
    { ...tt, month: "2026-09" },
    { ...tt, month: "2026-10", followerCount: 1601 },
    { ...tt, month: "2026-10", accountName: "Missing TT", link: "https://tiktok.com/@missing", followerCount: null },
  ];
  for (const field of ["xGrowth", "ytGrowth", "ttGrowth"])
    delete f.reviews[0].inputs.overrides[field];
  const before = structuredClone(f.context);
  const result = compute(f).teams[0];
  for (const field of ["xGrowth", "ytGrowth", "ttGrowth"]) {
    assert.equal(result.values[field], 1, field);
    assertNotice(result, field, "missing");
  }
  assert.equal(result.c.growth, 7);
  assert.equal(result.c.score, 7);
  assert.equal(result.total, 97);
  assert.deepEqual(plain(f.context), plain(before));
});

test("TT anomalies do not use preserved stale rows for totals or previous-month growth", () => {
  const f = fixture();
  const base = {
    teamShortName: "T0",
    accountName: "TT",
    link: "https://tiktok.com/@tt",
    isOfficial: false,
    followerCount: 1000,
    postCount: 10,
    videoViews: 20,
    streamCount: 0,
    streamViews: 0,
  };
  f.context.tiktokRows = [
    { ...base, month: "2026-06" },
    { ...base, month: "2026-07", followerCount: 2000 },
  ];
  assert.equal(
    api.proposeIncentiveValues(f.context.teams[0], f.context).values.ttGrowth,
    1,
  );
  f.context.tiktokIssues = [{ team: "T0", month: "2026-06" }];
  assert.equal(
    api.proposeIncentiveValues(f.context.teams[0], f.context).values.ttGrowth,
    null,
  );
  f.context.tiktokIssues = [{ team: "T0", month: "2026-07" }];
  assert.equal(
    api.proposeIncentiveValues(f.context.teams[0], f.context).values.shortViews,
    null,
  );
});
test("single-work thresholds, duplicate links and account caps are distinct from monthly totals", () => {
  const f = fixture(1, "2026-10");
  const work = (id, change = {}) => ({
    ...content.emptyContentEntry(id, "popular"),
    title: id,
    platform: "youtube_short",
    url: `https://youtu.be/${id}`,
    accountId: "official",
    publishedOn: "2026-10-01",
    likes: "2001",
    views: "1000001",
    claims: ["hot_short", "hot_video", "bonus_video"],
    ...change,
  });
  f.context.submissions[0].content_entries = [
    work("w1"),
    work("w2"),
    work("w3", { likes: "2000", views: "40000" }),
    work("dup", { url: "https://youtube.com/watch?v=w1" }),
  ];
  let values = api.proposeIncentiveValues(f.context.teams[0], f.context).values;
  assert.equal(values.hotShort, 1);
  assert.equal(values.hotOfficialVideo, 2);
  assert.equal(values.bonusVideos, 0);
  f.context.submissions[0].content_entries.push(
    work("tt", {
      platform: "tiktok",
      url: "https://www.tiktok.com/@official/video/12345",
      claims: ["hot_short"],
    }),
  );
  assert.equal(
    api.proposeIncentiveValues(f.context.teams[0], f.context).values.hotShort,
    2,
  );
  f.context.submissions[0].content_entries = [
    work("long", {
      accountId: "pt0",
      platform: "youtube",
      views: "200000",
      claims: ["bonus_video"],
    }),
  ];
  values = api.proposeIncentiveValues(f.context.teams[0], f.context).values;
  assert.equal(values.bonusVideos, 0);
});

test("D work bonuses exclude official and manager accounts and include players and coaches at strict thresholds", () => {
  for (const platform of ["youtube", "youtube_short", "tiktok"]) {
    const threshold = platform === "youtube" ? 200000 : 1000000;
    for (const role of ["official", "選手", "コーチ", "manager"]) {
      for (const views of [threshold, threshold + 1]) {
        const f = fixture(1, "2026-10");
        const submission = f.context.submissions[0];
        submission.player_rows[1].playerRole = role;
        submission.content_entries = [{
          ...content.emptyContentEntry("bonus", "popular"),
          title: "Bonus work", platform,
          accountId: role === "official" ? "official" : "pt0",
          url: platform === "tiktok" ? "https://tiktok.com/@account/video/123" : "https://youtu.be/bonus",
          publishedOn: "2026-10-01", views: String(views), claims: ["bonus_video"],
        }];
        delete f.reviews[0].inputs.overrides.bonusVideos;
        const expected = ["選手", "コーチ"].includes(role) && views > threshold ? 1 : 0;
        const team = compute(f).teams[0];
        assert.equal(team.values.bonusVideos, expected, `${platform}/${role}/${views}`);
        assert.equal(team.prize.popular, expected ? 240000 : 0);
      }
    }
  }
});

test("notices distinguish modern unclaimed content, historical uncollected data, missing metrics and measured zero", () => {
  const claimFields = [
    "designatedLong", "designatedLongEvent", "designatedShort", "designatedShortEvent",
    "hotShort", "hotX", "hotOfficialVideo", "bonusVideos",
    "onlineEvents", "offlineEvents", "tournamentUnits",
  ];
  for (const skipped of [false, true]) {
    const f = fixture(1, "2026-10");
    f.context.submissions[0].content_skipped = skipped;
    const proposed = api.proposeIncentiveValues(f.context.teams[0], f.context);
    for (const field of claimFields) {
      assert.equal(proposed.values[field], 0, field);
      assertNotice(proposed, field, "unclaimed");
    }
    assert.equal(proposed.values.xViews, null);
    assertNotice(proposed, "xViews", "missing");
    for (const row of f.context.submissions[0].player_rows) row.xImpressions = "0";
    const zero = api.proposeIncentiveValues(f.context.teams[0], f.context);
    assert.equal(zero.values.xViews, 0);
    assert.equal(zero.notices.some((notice) => notice.field === "xViews"), false);
  }
  const old = fixture(1, "2026-09");
  old.context.submissions[0].content_skipped = false;
  const proposed = api.proposeIncentiveValues(old.context.teams[0], old.context);
  for (const field of [...claimFields, "shortLikes", "shortReposts"]) {
    assert.equal(proposed.values[field], null, field);
    assertNotice(proposed, field, "not_collected");
    assert.equal(proposed.notices.some((notice) => notice.field === field && notice.kind === "unclaimed"), false);
  }
});

test("claimed work with missing evidence is marked missing, not unclaimed", () => {
  const f = fixture(1, "2026-10");
  f.context.submissions[0].content_entries = [{
    ...content.emptyContentEntry("missing", "popular"),
    title: "Awaiting evidence", accountId: "pt0", platform: "youtube_short",
    url: "https://youtu.be/missing", publishedOn: "2026-10-01",
    claims: ["hot_short", "bonus_video"], views: "", likes: "",
  }];
  const proposed = api.proposeIncentiveValues(f.context.teams[0], f.context);
  for (const field of ["hotShort", "bonusVideos"]) {
    assertNotice(proposed, field, "missing");
    assert.equal(proposed.notices.some((notice) => notice.field === field && notice.kind === "unclaimed"), false);
  }
  assert.equal(f.context.submissions[0].content_entries[0].views, "");
  assert.equal(f.context.submissions[0].content_entries[0].likes, "");
});

test("invalid claimed work URL, month or owner emits missing notices without awarding the work", () => {
  for (const change of [
    { url: "invalid" }, { publishedOn: "2026-09-30" }, { accountId: "unknown" },
  ]) {
    const f = fixture(1, "2026-10");
    f.context.submissions[0].content_entries = [{
      ...content.emptyContentEntry("invalid", "popular"),
      title: "Invalid evidence", accountId: "pt0", platform: "youtube_short",
      url: "https://youtu.be/invalid", publishedOn: "2026-10-01",
      claims: ["hot_short", "bonus_video"], views: "1000001", likes: "2001", ...change,
    }];
    const proposed = api.proposeIncentiveValues(f.context.teams[0], f.context);
    for (const field of ["hotShort", "bonusVideos"]) {
      assert.equal(proposed.values[field], 0, field);
      assertNotice(proposed, field, "missing");
    }
  }
});

test("event thresholds and tournament floor apply per event; old uncollected data is unknown", () => {
  const f = fixture(1, "2026-10");
  const items = [
    ["online", 3000],
    ["online", 3001],
    ["offline", 100],
    ["offline", 101],
    ["tournament", 1999],
    ["tournament", 1999],
  ].map(([popularKind, audienceCount], i) => ({
    ...activities.emptyClubActivityItem(i),
    popular: true,
    popularKind,
    audienceCount: String(audienceCount),
    activityDate: "2026-10-01",
  }));
  f.context.submissions[0].club_activity_link =
    activities.serializeClubActivityItems(items);
  const values = api.proposeIncentiveValues(
    f.context.teams[0],
    f.context,
  ).values;
  assert.equal(values.onlineEvents, 1);
  assert.equal(values.offlineEvents, 1);
  assert.equal(values.tournamentUnits, 2);
  const old = fixture();
  assert.equal(
    api.proposeIncentiveValues(old.context.teams[0], old.context).values
      .onlineEvents,
    null,
  );
});

test("invalid event evidence leaves known qualifying events counted and emits missing notices", () => {
  const f = fixture(1, "2026-10");
  const items = [
    { popularKind: "online", audienceCount: "3001", activityDate: "2026-10-01" },
    { popularKind: "online", audienceCount: "", activityDate: "2026-10-02" },
    { popularKind: "offline", audienceCount: "101", activityDate: "" },
    { popularKind: "tournament", audienceCount: "2000", activityDate: "2026-09-30" },
  ].map((item, index) => ({ ...activities.emptyClubActivityItem(index), popular: true, ...item }));
  f.context.submissions[0].club_activity_link = activities.serializeClubActivityItems(items);
  for (const field of ["onlineEvents", "offlineEvents", "tournamentUnits"])
    delete f.reviews[0].inputs.overrides[field];
  const result = compute(f).teams[0];
  assert.equal(result.values.onlineEvents, 1);
  assert.equal(result.values.offlineEvents, 0);
  assert.equal(result.values.tournamentUnits, 0);
  assert.equal(result.c.events, 2);
  for (const field of ["onlineEvents", "offlineEvents", "tournamentUnits"])
    assertNotice(result, field, "missing");
});

test("duplicate approved records and duplicate individual memberships fail closed", () => {
  const f = fixture(2);
  f.context.submissions[1].player_rows[1].playerId = "pt0";
  assert.throws(() => compute(f), /重复成员/);
  f.context.submissions.push(f.context.submissions[0]);
  assert.throws(() => compute(f), /记录重复/);
});
test("review hashes ignore independent salary edits but track scoring inputs", () => {
  const f = fixture();
  const hash = () =>
    storage.incentiveHash(storage.sourceForIncentiveTeam(f.context, "t0"));
  const initial = hash();
  f.context.submissions[0].player_rows[1].salaryAmount = "50000";
  assert.equal(hash(), initial);
  f.context.submissions[0].player_rows[1].xTweetCount = "123";
  assert.notEqual(hash(), initial);
});

test("ranking hashes track all eligible ranking inputs and eligibility but ignore order and unrelated scores", () => {
  const result = compute(automaticFixture(2));
  const initial = storage.incentiveRankingHash(result);
  const reversed = plain(result);
  reversed.teams.reverse();
  assert.equal(storage.incentiveRankingHash(reversed), initial);
  for (const field of api.rankingFields) {
    const changed = plain(result);
    changed.teams[1].values[field] = (changed.teams[1].values[field] ?? 0) + 1;
    assert.notEqual(storage.incentiveRankingHash(changed), initial, field);
  }
  const unrelated = plain(result);
  unrelated.teams[1].c.score = 100;
  unrelated.teams[1].b.x = 0;
  unrelated.teams[1].b.extra = 20;
  unrelated.teams[1].values.onlineEvents = 50;
  unrelated.teams[1].values.bonusVideos = 10;
  assert.equal(storage.incentiveRankingHash(unrelated), initial);
  const ineligible = plain(result);
  ineligible.teams[1].eligible = false;
  const excludedHash = storage.incentiveRankingHash(ineligible);
  assert.notEqual(excludedHash, initial);
  ineligible.teams[1].values.xViews = 999999;
  assert.equal(storage.incentiveRankingHash(ineligible), excludedHash);
});

test("another team's A eligibility or ranking data invalidates B corrections but not unrelated C corrections", () => {
  for (const change of ["eligibility", "ranking data"]) {
    const f = automaticFixture(2);
    const source = () => storage.incentiveHash(storage.sourceForIncentiveTeam(f.context, "t0"));
    const originalSource = source();
    const originalRanking = storage.incentiveRankingHash(compute(f));
    const review = {
      team_id: "t0", target_month: "2026-10", status: "draft", source_hash: originalSource,
      inputs: { scores: { bYoutube: 5 }, rankingSourceHash: originalRanking, note: "Verified ranking" },
    };
    f.reviews = [review];
    if (change === "eligibility") {
      f.reviews.push({
        team_id: "t1", target_month: "2026-10", status: "draft",
        source_hash: storage.incentiveHash(storage.sourceForIncentiveTeam(f.context, "t1")),
        inputs: { scores: { aYoutube: 0 }, note: "Verified A correction" },
      });
    } else {
      f.context.submissions[1].player_rows[1].youtubeVideoViews = "999";
    }
    const result = compute(f);
    const rankingHash = storage.incentiveRankingHash(result);
    assert.equal(source(), originalSource, change);
    assert.notEqual(rankingHash, originalRanking, change);
    const workspace = {
      result, reviews: f.reviews, rankingHash,
      hashes: Object.fromEntries(f.context.teams.map((team) => [team.id,
        storage.incentiveHash(storage.sourceForIncentiveTeam(f.context, team.id))])),
    };
    assert.equal(api.isIncentiveReviewStale(review, source(), rankingHash), true);
    assert.throws(() => storage.assertIncentiveFinalizable(workspace));
    for (const scores of [{ cEvents: 2 }, { bExtra: 0 }]) {
      review.inputs.scores = scores;
      workspace.result = compute(f);
      assert.equal(api.isIncentiveReviewStale(review, source(), rankingHash), false);
      assert.doesNotThrow(() => storage.assertIncentiveFinalizable(workspace));
    }
  }
});

test("finalization accepts approved automatic results with missing data and no reviews", () => {
  const f = automaticFixture();
  const w = {
    result: compute(f),
    reviews: f.reviews,
    hashes: { t0: "source" },
  };
  w.rankingHash = storage.incentiveRankingHash(w.result);
  assert.ok(w.result.teams[0].missing.length > 0);
  assert.doesNotThrow(() => storage.assertIncentiveFinalizable(w));
  w.hashes.t0 = "new";
  assert.doesNotThrow(() => storage.assertIncentiveFinalizable(w));
  w.result.incomplete = true;
  assert.doesNotThrow(() => storage.assertIncentiveFinalizable(w));
  f.context.submissions = [];
  w.result = compute(f);
  w.rankingHash = storage.incentiveRankingHash(w.result);
  assert.throws(() => storage.assertIncentiveFinalizable(w), /月数据/);
});

test("only stale actual corrections block finalization, not draft status or stale empty reviews", () => {
  const f = automaticFixture();
  const w = { result: compute(f), reviews: [], hashes: { t0: "source" } };
  w.rankingHash = storage.incentiveRankingHash(w.result);
  for (const inputs of [
    { overrides: { shortLikes: 0 } },
    { scores: { bX: 0 } },
    { individuals: { pt0: { views: 0 } } },
  ]) {
    for (const status of ["draft", "reviewed"]) {
      const review = {
        team_id: "t0", target_month: "2026-10", status, source_hash: "source",
        inputs: api.normalizeIncentiveReview({ ...inputs, note: "Verified correction" }),
      };
      review.inputs.rankingSourceHash = w.rankingHash;
      w.reviews = [review];
      assert.doesNotThrow(() => storage.assertIncentiveFinalizable(w));
      review.source_hash = "stale";
      assert.throws(() => storage.assertIncentiveFinalizable(w));
    }
  }
  for (const inputs of [{}, { note: "Historical note" }, { individuals: { pt0: {} }, scores: { bX: null } }]) {
    w.reviews = [{ team_id: "t0", status: "draft", source_hash: "stale", inputs }];
    assert.doesNotThrow(() => storage.assertIncentiveFinalizable(w));
  }
});

function routeHarness({
  session = true,
  writeError = null,
  conflict = false,
  count = 1,
} = {}) {
  const f = automaticFixture(count, "2026-07");
  const w = {
    context: f.context,
    result: compute(f),
    reviews: [],
    hashes: Object.fromEntries(f.context.teams.map((team) => [team.id, "source"])),
    sourceHash: "month-source",
  };
  w.rankingHash = storage.incentiveRankingHash(w.result);
  const writes = [];
  const client = {
    from(table) {
      const chain = {
        insert(row) {
          writes.push({ table, row });
          return chain;
        },
        update(row) {
          writes.push({ table, row });
          return chain;
        },
        eq() {
          return chain;
        },
        select() {
          return chain;
        },
        async maybeSingle() {
          return {
            data: conflict ? null : { team_id: "t0" },
            error: writeError,
          };
        },
        async upsert(row, options) {
          writes.push({ table, row, options });
          return { error: writeError };
        },
      };
      return chain;
    },
  };
  const route = compile("src/app/api/admin/incentive-scores/route.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/admin-auth": { getAdminSession: async () => session },
    "@/lib/supabase-server": { createSupabaseServerClient: () => client },
    "@/lib/incentive-store": {
      ...storage,
      loadIncentiveWorkspace: async () => {
        const result = api.buildIncentiveMonth(w.context, w.reviews);
        return { ...w, result, rankingHash: storage.incentiveRankingHash(result) };
      },
    },
    "@/lib/incentive-score": api,
  });
  const send = (change = {}, origin = "https://test.invalid") =>
    route.POST(
      new Request("https://test.invalid/api/admin/incentive-scores", {
        method: "POST",
        headers: { origin },
        body: JSON.stringify({
          action: "save",
          month: "2026-07",
          teamId: "t0",
          sourceHash: "source",
          rankingHash: w.rankingHash,
          inputs: { overrides: {}, individuals: {}, note: "" },
          ...change,
        }),
      }),
    );
  return { w, writes, send };
}
test("API rejects unauthenticated, cross-origin, stale source and concurrent reviews", async () => {
  assert.equal((await routeHarness({ session: false }).send()).status, 401);
  const h = routeHarness();
  assert.equal((await h.send({}, "https://other.invalid")).status, 403);
  assert.equal((await h.send({ sourceHash: "stale" })).status, 409);
  h.w.reviews = [{ updated_at: "changed", team_id: "t0" }];
  assert.equal((await h.send()).status, 409);
  assert.equal(h.writes.length, 0);
});
test("API requires confirmation only for explicit review and provenance for corrections", async () => {
  const h = routeHarness();
  assert.equal((await h.send({ reviewed: true })).status, 400);
  assert.equal(
    (await h.send({ inputs: { overrides: { shortLikes: 0 } } })).status,
    400,
  );
  const response = await h.send({
    inputs: { overrides: { shortLikes: 0 }, note: "Verified sheet" },
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(result.reviewVersion);
  assert.equal(h.writes[0].table, "team_incentive_reviews");
  assert.equal(h.writes[0].row.inputs.overrides.shortLikes, 0);
});
test("API reports DB failures; finalization is append-only and never touches old scores", async () => {
  assert.equal(
    (await routeHarness({ writeError: { message: "offline" } }).send()).status,
    400,
  );
  assert.equal((await routeHarness({ conflict: true }).send()).status, 400);
  const h = routeHarness();
  h.w.reviews = fixture().reviews;
  const response = await h.send({
    action: "finalize",
    sourceHash: "month-source",
    confirmed: true,
  });
  assert.equal(response.status, 200);
  assert.equal(h.writes[0].table, "monthly_incentive_results");
  assert.equal(h.writes[0].options.ignoreDuplicates, true);
  assert.equal(
    h.writes.some((write) => write.table === "team_monthly_scores"),
    false,
  );
});
test("API saves and explicitly confirms reviews without requiring complete source metrics", async () => {
  const h = routeHarness();
  assert.ok(h.w.result.teams[0].missing.length > 0);
  const draft = await h.send();
  assert.equal(draft.status, 200);
  assert.equal(h.writes[0].row.status, "draft");
  const reviewed = await h.send({ reviewed: true, confirmed: true });
  assert.equal(reviewed.status, 200);
  assert.equal(h.writes[1].row.status, "reviewed");
});

test("API validates score caps and requires a note for every correction type including zero", async () => {
  for (const inputs of [
    { overrides: { shortLikes: 0 } },
    { scores: { bX: 0 } },
    { individuals: { pt0: { views: 0 } } },
  ]) {
    const h = routeHarness();
    assert.equal((await h.send({ inputs })).status, 400);
    assert.equal(h.writes.length, 0);
    assert.equal((await h.send({ inputs: { ...inputs, note: "Verified source" } })).status, 200);
    assert.equal(h.writes[0].row.status, "draft");
    assert.equal(api.hasIncentiveCorrections(h.writes[0].row.inputs), true);
  }
  for (const scores of [{ aYoutube: 31 }, { bExtra: 21 }, { cPopular: 31 }, { cGrowth: -1 }, { cEvents: 1.5 }]) {
    const h = routeHarness();
    assert.equal((await h.send({ inputs: { scores, note: "Verified source" } })).status, 400);
    assert.equal(h.writes.length, 0);
  }
  const blank = routeHarness();
  assert.equal((await blank.send({ inputs: { scores: { bX: "" }, individuals: { pt0: {} } } })).status, 200);
  assert.equal(api.hasIncentiveCorrections(blank.writes[0].row.inputs), false);
});

test("API recalculates draft score corrections and rejects unsafe totals before writing", async () => {
  const h = routeHarness();
  const response = await h.send({
    inputs: { scores: { cGrowth: Number.MAX_SAFE_INTEGER, cEvents: 1 }, note: "Verified source" },
  });
  assert.equal(response.status, 400);
  assert.equal(h.writes.length, 0);
  const saved = await h.send({
    inputs: { scores: { bX: 0, cEvents: 10 }, note: "Verified source" },
  });
  assert.equal(saved.status, 200);
  assert.equal(h.writes[0].row.status, "draft");
  assert.deepEqual(plain(h.writes[0].row.inputs.scores), { bX: 0, cEvents: 10 });
  h.w.reviews = [h.writes[0].row];
  h.w.sourceHash = "corrected-month";
  assert.equal((await h.send({ action: "finalize", sourceHash: "corrected-month", confirmed: true })).status, 200);
  const snapshot = h.writes[1].row.result.teams[0];
  assert.equal(snapshot.automaticScores.cEvents, 0);
  assert.equal(snapshot.c.events, 10);
  assert.equal(snapshot.total, 85);
});

test("API finalizes missing-data automatic results without reviews, preserving nulls and append-only snapshots", async () => {
  const h = routeHarness();
  const before = structuredClone(h.w.context);
  const request = { action: "finalize", sourceHash: "month-source", confirmed: true };
  assert.equal((await h.send(request)).status, 200);
  assert.equal((await h.send(request)).status, 200);
  assert.equal(h.writes.length, 2);
  for (const write of h.writes) {
    assert.equal(write.table, "monthly_incentive_results");
    assert.equal(write.row.rule_version, "2026-07-v4");
    assert.equal(write.options.onConflict, "target_month,source_hash");
    assert.equal(write.options.ignoreDuplicates, true);
    assert.deepEqual(plain(write.row.reviews), []);
    assert.equal(write.row.result.incomplete, false);
    assert.equal(write.row.result.teams[0].total, 75);
    assert.equal(write.row.result.teams[0].prize.total, 700000);
    assert.equal(write.row.result.teams[0].values.shortLikes, null);
    assert.equal(write.row.result.teams[0].proposed.shortLikes, null);
    assertNotice(write.row.result.teams[0], "shortLikes", "not_collected");
  }
  assert.deepEqual(plain(h.writes[0].row), plain(h.writes[1].row));
  assert.deepEqual(plain(h.w.context), plain(before));
  const firstSnapshot = plain(h.writes[0].row);
  h.w.context.submissions[0].player_rows[1].youtubeVideoViews = "200";
  h.w.sourceHash = "updated-month";
  assert.equal((await h.send({ ...request, sourceHash: "updated-month" })).status, 200);
  assert.equal(h.writes[2].table, "monthly_incentive_results");
  assert.equal(h.writes[2].row.source_hash, "updated-month");
  assert.equal(h.writes[2].row.result.teams[0].members[0].views, 200);
  assert.deepEqual(plain(h.writes[0].row), firstSnapshot);
});

test("API finalization retains explicit confirmation, stale-source and approved-submission guards", async () => {
  const h = routeHarness();
  const request = { action: "finalize", sourceHash: "month-source", confirmed: true };
  assert.equal((await h.send({ ...request, confirmed: false })).status, 400);
  assert.equal((await h.send({ ...request, sourceHash: "stale" })).status, 409);
  h.w.context.submissions[0].status = "submitted";
  assert.equal((await h.send(request)).status, 400);
  assert.equal(h.writes.length, 0);
});

test("API finalizes fresh draft corrections but rejects stale corrections and ignores stale empty reviews", async () => {
  const request = { action: "finalize", sourceHash: "month-source", confirmed: true };
  for (const sourceHash of ["source", "stale"]) {
    const h = routeHarness();
    h.w.reviews = [{
      team_id: "t0", target_month: "2026-07", status: "draft", source_hash: sourceHash,
      inputs: { scores: { bX: 0 }, rankingSourceHash: h.w.rankingHash, note: "Verified source" },
    }];
    assert.equal((await h.send(request)).status, sourceHash === "source" ? 200 : 400);
    assert.equal(h.writes.length, sourceHash === "source" ? 1 : 0);
  }
  const h = routeHarness();
  h.w.reviews = [{
    team_id: "t0", target_month: "2026-07", status: "draft", source_hash: "stale",
    inputs: { scores: {}, individuals: { pt0: {} }, note: "Note only" },
  }];
  assert.equal((await h.send(request)).status, 200);
});

test("API rejects old or missing ranking hashes only for direct B ranking corrections", async () => {
  for (const field of ["bX", "bYoutube", "bShorts"]) {
    for (const rankingHash of ["old-ranking", undefined]) {
      const h = routeHarness();
      const response = await h.send({
        rankingHash,
        inputs: { scores: { [field]: 0 }, rankingSourceHash: h.w.rankingHash, note: "Verified source" },
      });
      assert.equal(response.status, 409, field);
      assert.equal(h.writes.length, 0);
    }
  }
  for (const scores of [{ bExtra: 0 }, { cEvents: 2 }]) {
    const h = routeHarness();
    assert.equal((await h.send({ rankingHash: "old-ranking", inputs: { scores, note: "Verified source" } })).status, 200);
  }
});

test("API detects another team's ranking changes even when the corrected team's source is unchanged", async () => {
  for (const change of ["eligibility", "ranking data"]) {
    const h = routeHarness({ count: 2 });
    const oldHash = h.w.rankingHash;
    const ownSource = storage.incentiveHash(storage.sourceForIncentiveTeam(h.w.context, "t0"));
    if (change === "eligibility") {
      h.w.reviews = [{
        team_id: "t1", target_month: "2026-07", status: "draft", source_hash: "source",
        inputs: { scores: { aYoutube: 0 }, note: "Updated A score" },
      }];
    } else {
      h.w.context.submissions[1].player_rows[1].youtubeVideoViews = "999";
    }
    const currentHash = storage.incentiveRankingHash(api.buildIncentiveMonth(h.w.context, h.w.reviews));
    assert.notEqual(currentHash, oldHash);
    assert.equal(storage.incentiveHash(storage.sourceForIncentiveTeam(h.w.context, "t0")), ownSource);
    const inputs = { scores: { bYoutube: 5 }, note: "Verified ranking" };
    assert.equal((await h.send({ rankingHash: oldHash, inputs })).status, 409);
    assert.equal(h.writes.length, 0);
    assert.equal((await h.send({ rankingHash: currentHash, inputs })).status, 200);
    assert.equal(h.writes[0].row.inputs.rankingSourceHash, currentHash);
  }
});

test("API stamps the authoritative post-edit ranking hash for own A+B changes and ignores forged input", async () => {
  const h = routeHarness();
  h.w.reviews = [{
    team_id: "t0", target_month: "2026-07", status: "draft", source_hash: "source",
    inputs: { scores: { aYoutube: 0 }, note: "Existing A correction" },
  }];
  h.w.result = api.buildIncentiveMonth(h.w.context, h.w.reviews);
  h.w.rankingHash = storage.incentiveRankingHash(h.w.result);
  assert.equal(h.w.result.teams[0].eligible, false);
  const oldHash = h.w.rankingHash;
  const response = await h.send({
    inputs: { scores: { aYoutube: 30, bYoutube: 5 }, rankingSourceHash: "forged", note: "Verified A and B" },
  });
  assert.equal(response.status, 200);
  const record = h.writes[0].row;
  const recalculated = api.buildIncentiveMonth(h.w.context, [record]);
  const newHash = storage.incentiveRankingHash(recalculated);
  assert.equal(recalculated.teams[0].eligible, true);
  assert.notEqual(newHash, oldHash);
  assert.equal(record.inputs.rankingSourceHash, newHash);
  assert.notEqual(record.inputs.rankingSourceHash, "forged");
  assert.equal(api.isIncentiveReviewStale(record, "source", newHash), false);
  h.w.reviews = [record];
  h.w.sourceHash = "updated-month";
  assert.equal((await h.send({ action: "finalize", sourceHash: "updated-month", confirmed: true })).status, 200);
  assert.equal(h.writes[1].row.reviews[0].inputs.rankingSourceHash, newHash);
});
