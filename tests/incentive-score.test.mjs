import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
export function compile(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
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
const api = compile("src/lib/incentive-score.ts", {
  "./monthly-data": monthly,
  "./monthly-content": content,
  "./club-activities": activities,
});
const storage = compile("src/lib/incentive-store.ts", {
  "node:crypto": crypto,
  "./monthly-data": monthly,
  "./incentive-score": api,
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
    null,
  );
  assert.equal(
    api.calculateBase({ ...full, designatedLongEvent: 1 }).youtube,
    20,
  );
  assert.equal(
    api.calculateBase({ ...full, designatedShort: 0, designatedShortEvent: 0 })
      .youtube,
    20,
  );
});
test("new rules start May; prizes and D start July", () => {
  assert.throws(() => compute(fixture(1, "2026-04")), /旧评分/);
  for (const month of ["2026-05", "2026-06"]) {
    const f = fixture(1, month);
    delete f.reviews[0].inputs.overrides.bonusVideos;
    const r = compute(f);
    assert.equal(r.allocated, 0);
    assert.equal(r.prizeEnabled, false);
    assert.equal(r.teams[0].total, 90);
  }
  assert.equal(compute(fixture()).allocated, 700000);
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
  assert.equal(r.prizeIncomplete, true);
  assert.equal(r.teams[0].prize.views, 0);
  f.reviews[0].inputs.overrides.bonusVideos = 0;
  delete f.reviews[0].inputs.overrides.shortLikes;
  r = compute(f);
  assert.equal(r.scoreIncomplete, true);
  assert.equal(r.teams[0].rank, null);
  assert.equal(r.teams[0].prize.ranking, 0);
  assert.equal(r.teams[0].prize.views, 50000);
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
    null,
  );
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
  assert.equal(values.bonusVideos, 2);
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
      platform: "youtube",
      views: "200000",
      claims: ["bonus_video"],
    }),
  ];
  values = api.proposeIncentiveValues(f.context.teams[0], f.context).values;
  assert.equal(values.bonusVideos, 0);
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
test("finalization requires all approved teams fresh-reviewed and complete", () => {
  const f = fixture();
  const w = {
    result: compute(f),
    reviews: f.reviews,
    hashes: { t0: "source" },
  };
  assert.doesNotThrow(() => storage.assertIncentiveFinalizable(w));
  w.hashes.t0 = "new";
  assert.throws(() => storage.assertIncentiveFinalizable(w), /更新人工复核/);
  w.hashes.t0 = "source";
  w.result.incomplete = true;
  assert.throws(() => storage.assertIncentiveFinalizable(w), /待补充/);
});

function routeHarness({
  session = true,
  writeError = null,
  conflict = false,
} = {}) {
  const f = fixture();
  const w = {
    context: f.context,
    result: compute(f),
    reviews: [],
    hashes: { t0: "source" },
    sourceHash: "month-source",
  };
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
      loadIncentiveWorkspace: async () => w,
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
test("API requires explicit review and supplemental provenance, preserves zero and returns save feedback", async () => {
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
test("API only confirms review after recalculating complete supplemental inputs", async () => {
  const h = routeHarness();
  const pending = await h.send({ reviewed: true, confirmed: true });
  assert.equal(pending.status, 400);
  assert.match((await pending.json()).error, /请先补齐/);
  assert.equal(h.writes.length, 0);
  const complete = await h.send({
    reviewed: true,
    confirmed: true,
    inputs: { overrides: goodValues(), note: "Verified source" },
  });
  assert.equal(complete.status, 200);
  assert.equal(h.writes[0].row.status, "reviewed");
});
