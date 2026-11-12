import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";

function compile(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Error, Date, Intl, URL, Request, Response, process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only" } },
    require: (name) => imports[name] ?? {} });
  return exports;
}
const monthly = compile("src/lib/monthly-data.ts");
const content = compile("src/lib/monthly-content.ts");
const activity = compile("src/lib/club-activities.ts");
const api = compile("src/lib/operating-score.ts", { "./monthly-data": monthly, "./monthly-content": content, "./club-activities": activity });
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const store = compile("src/lib/operating-store.ts", { "./operating-score": api, "./monthly-data": monthly, "./incentive-store": { incentiveHash: hash } });
function fixture() {
  const team = { id: "t1", name: "Example Team", short_name: "EX", is_active: true };
  const official = { ...monthly.emptyMonthlyPlayerRow(0), id: "official", playerName: "EX公式", playerRole: "official_account", xTweetCount: "15", youtubeVideoPostCount: "2", youtubeShortPostCount: "99", youtubeStreamCount: "5" };
  const member = { ...monthly.emptyMonthlyPlayerRow(1), id: "p1", playerId: "id1", playerName: "Example", playerRole: "コーチ", youtubeVideoPostCount: "4", youtubeShortPostCount: "8", youtubeStreamCount: "15" };
  const works = Array.from({ length: 6 }, (_, i) => ({ ...content.emptyContentEntry("w" + i, "designated"), accountId: "id1", publishedOn: "2026-10-10", platform: i < 2 ? "youtube" : "youtube_short", url: i < 2 ? "https://youtu.be/long" + i : "https://youtube.com/shorts/short" + i, claims: ["designated"] }));
  const submission = { team_id: team.id, target_month: "2026-10", status: "submitted", player_rows: [official, member], content_entries: works, club_activity_link: JSON.stringify([{ id: "event", link: "https://example.com/event" }]) };
  const tt = { month: "2026-10", teamShortName: "EX", accountName: "example", isOfficial: false, link: "https://tiktok.com/@example", postCount: 5 };
  const context = { month: "2026-10", teams: [team], submissions: [submission], tiktokRows: [tt], tiktokIssues: [] };
  return { team, context, submission, official, member, works, tt };
}
const score = (f, inputs) => api.calculateOperatingTeam(f.team, f.context, inputs);
test("operating rules start October and submitted data can be reviewed independently", () => {
  const f = fixture();
  assert.equal(score(f).total, 100); assert.equal(score(f).grade, "S");
  for (const status of ["submitted", "reviewing", "approved"]) { f.submission.status = status; assert.equal(score(f).total, 100); }
  for (const status of ["draft", "returned", "not_submitted"]) { f.submission.status = status; assert.equal(score(f).total, null); }
  f.context.submissions = []; assert.equal(score(f).total, null);
  f.context.month = "2026-09"; assert.throws(() => score(f), /10月/);
});
test("YouTube uses member-only totals including coaches, designated counts are subsets", () => {
  const f = fixture();
  f.member.youtubeShortPostCount = "5";
  assert.equal(score(f).groups.youtube, 20, "official Shorts cannot satisfy member task");
  f.member.youtubeVideoPostCount = "3";
  assert.equal(score(f).groups.youtube, 10, "do not add designated entries to monthly total");
  f.member.youtubeShortPostCount = "8"; f.member.youtubeVideoPostCount = "4";
  assert.equal(score(f).groups.youtube, 30, "coaches are included");
});
test("member Shorts need eight total including four designated, with other rules unchanged", () => {
  const f = fixture();
  const baseline = score(f);
  for (const posts of ["6", "7"]) {
    f.member.youtubeShortPostCount = posts;
    const result = score(f);
    const item = result.items.find((entry) => entry.key === "memberShorts");
    assert.equal(item.auto, 0);
    assert.equal(result.groups.youtube, 20);
    assert.equal(result.total, 90);
    assert.match(item.reason, new RegExp(`${posts}/8 条`));
    assert.match(item.reason, /总数不足8条.*本项扣10分/);
    assert.deepEqual(result.items.filter((entry) => entry.key !== "memberShorts"), baseline.items.filter((entry) => entry.key !== "memberShorts"));
  }
  f.member.youtubeShortPostCount = "8";
  assert.equal(score(f).total, 100);
  f.works.pop();
  const item = score(f).items.find((entry) => entry.key === "memberShorts");
  assert.equal(item.auto, 0, "eight total still needs four designated Shorts");
  assert.match(item.reason, /指定 Shorts 3\/4 条.*指定Shorts不足4条/);
  assert.equal(score(f, { scores: { memberShorts: 10 }, note: "Reviewed exception" }).total, 100, "manual review remains available");
  assert.match(api.operatingFields.memberShorts.label, /8本（指定4本＋その他4本）/);
});
test("updated Shorts rule invalidates old review source without changing submissions", () => {
  const f = fixture(), before = JSON.stringify(f.context);
  const source = store.operatingTeamSource(f.context, f.team.id);
  assert.equal(source.rule, "2026-10-v2");
  assert.notEqual(hash(source), hash({ ...source, rule: "2026-10-v1" }));
  score(f);
  assert.equal(JSON.stringify(f.context), before);
});
test("designated work counts exclude official, other month, unknown owner and duplicates", () => {
  for (const invalid of [
    (w) => w.accountId = "official",
    (w) => w.publishedOn = "2026-09-10",
    (w) => w.accountId = "missing-member",
    (w, f) => w.url = f.works[0].url,
  ]) {
    const f = fixture(); invalid(f.works[1], f);
    assert.equal(score(f).groups.youtube, 20);
    assert.match(score(f).deductions.join(" "), /指定视频不足2条/);
  }
});
test("YouTube four failures floor at zero rather than deduct 40; live boundary is 20", () => {
  const f = fixture();
  f.member.youtubeStreamCount = "14"; assert.equal(score(f).groups.youtube, 20);
  f.member.youtubeVideoPostCount = "0"; f.member.youtubeShortPostCount = "0"; f.official.youtubeVideoPostCount = "0";
  assert.equal(score(f).groups.youtube, 0);
});
test("fan events use club records and accept legacy image evidence, not X player totals", () => {
  const f = fixture(); f.submission.club_activity_link = null;
  f.member.xFanEventCount = "9"; assert.equal(score(f).groups.team, 15);
  f.submission.club_activity_image_url = "https://example.com/proof.jpg"; assert.equal(score(f).groups.team, 25);
  f.submission.club_activity_image_url = null;
  f.submission.club_activity_link = JSON.stringify([{ popular: true, activityDate: "2026-10-10" }]);
  assert.equal(score(f).groups.team, 15, "empty checked activity is not evidence");
  f.submission.club_activity_link = JSON.stringify([{ link: "https://example.com/event", activityDate: "2026-09-10" }]);
  assert.equal(score(f).groups.team, 15);
});
test("TikTok uses only TT posts; likes errors do not remove valid posts; no stale error counts", () => {
  const f = fixture(); f.tt.postCount = 4; assert.equal(score(f).groups.tiktok, 5);
  f.tt.postCount = 5;
  f.context.tiktokIssues = [{ month: "2026-10", team: "EX", account: "example", metric: "likeCount" }];
  assert.equal(score(f).groups.tiktok, 15);
  delete f.context.tiktokIssues[0].metric;
  assert.equal(score(f).groups.tiktok, 5);
  assert.equal(score(f).items.find((x) => x.key === "ttPosts").missing, true);
});
test("X needs official 15 posts only, manual profile/repost deductions floor at zero", () => {
  const f = fixture(); f.member.xTweetCount = "500"; f.official.xImpressions = "5000000";
  f.official.xTweetCount = "14"; assert.equal(score(f).groups.x, 5);
  f.official.xTweetCount = "15"; assert.equal(score(f).groups.x, 15);
  assert.equal(score(f, { scores: { xProfile: -5, xReposts: -10 }, note: "Noncompliance" }).groups.x, 0);
  f.official.xTweetCount = "0";
  assert.equal(score(f, { scores: { xProfile: -5, xReposts: -10 }, note: "Noncompliance" }).groups.x, 0);
});
test("manual defaults, detailed deduction and confirmed totals preserve original data", () => {
  const f = fixture(), before = JSON.stringify(f.context);
  const result = score(f, { scores: { salary: 0, cooperation: 7 }, note: "Salary proof missing; late cooperation" });
  assert.equal(result.total, 92); assert.equal(result.grade, "S");
  assert.equal(JSON.stringify(f.context), before);
  assert.match(result.deductions.join(" "), /給与関連：扣5分.*Salary/);
});
test("missing values remain distinguishable from real zero while scores are numeric", () => {
  const f = fixture(); f.official.xTweetCount = "";
  const missing = score(f).items.find((x) => x.key === "xPosts");
  assert.equal(missing.missing, true); assert.equal(missing.auto, 0);
  f.official.xTweetCount = "0";
  assert.equal(score(f).items.find((x) => x.key === "xPosts").missing, false);
  f.official.xTweetCount = "１５"; assert.equal(score(f).groups.x, 15);
});
test("grade boundaries and duplicate source fail closed", () => {
  for (const [number, grade] of [[100,"S"],[90,"S"],[89,"A"],[85,"A"],[84,"B"],[75,"B"],[74,"C"],[65,"C"],[64,"D"],[0,"D"]]) assert.equal(api.operatingGrade(number), grade);
  const f = fixture(); f.context.submissions.push(f.submission); assert.throws(() => score(f), /重复/);
});
test("manual validation rejects out of range, missing notes, arbitrary fields and nonintegers", () => {
  for (const raw of [
    { scores: { salary: 6 }, note: "x" }, { scores: { streams: 1 }, note: "x" },
    { scores: { xProfile: -6 }, note: "x" }, { scores: { salary: 2.5 }, note: "x" },
    { scores: { salary: 0 }, note: "" }, { scores: { arbitrary: 1 }, note: "x" },
    { scores: { salary: "5" }, note: "x" },
  ]) assert.throws(() => api.normalizeOperatingInputs(raw));
  assert.equal(api.normalizeOperatingInputs({ scores: {}, note: "" }).note, "");
});
test("source revision ignores salary fields and TT likes, includes SNS and TT posts", () => {
  const f = fixture(); const original = hash(store.operatingTeamSource(f.context, f.team.id));
  f.member.salaryAmount = "500"; f.tt.likeCount = 999;
  assert.equal(hash(store.operatingTeamSource(f.context, f.team.id)), original);
  f.tt.postCount++; assert.notEqual(hash(store.operatingTeamSource(f.context, f.team.id)), original);
});
function routeFixture({ auth = true, existing = null, source = "source", writeError = null, written = true, submitted = true } = {}) {
  const f = fixture(), writes = [];
  if (!submitted) f.submission.status = "draft";
  const workspace = { context: f.context, hashes: { t1: source }, reviews: existing ? [existing] : [] };
  const db = { from: (table) => {
    const q = { insert: (record) => { writes.push({ table, record }); return q; }, update: (record) => { writes.push({ table, record }); return q; },
      eq: (key, value) => { writes.push({ key, value }); return q; }, select: () => q,
      maybeSingle: async () => ({ data: written ? { updated_at: "new-version" } : null, error: writeError }) };
    return q;
  } };
  const route = compile("src/app/api/admin/operating-scores/route.ts", {
    "@/lib/admin-auth": { getAdminSession: async () => auth },
    "@/lib/supabase-server": { createSupabaseServerClient: () => db },
    "@/lib/operating-store": { loadOperatingWorkspace: async () => workspace },
    "@/lib/operating-score": api, "next/cache": { revalidatePath: () => {} },
  });
  const send = (patch = {}, origin = "https://example.com") => route.POST(new Request("https://example.com/api/admin/operating-scores", { method: "POST", headers: { origin },
    body: JSON.stringify({ month: "2026-10", teamId: "t1", sourceHash: "source", reviewVersion: null, inputs: { scores: {}, note: "" }, status: "draft", ...patch }) }));
  return { send, writes };
}
test("save endpoint authenticates and checks origin, month and submitted state", async () => {
  assert.equal((await routeFixture({ auth: false }).send()).status, 401);
  assert.equal((await routeFixture().send({}, "https://evil.invalid")).status, 403);
  assert.equal((await routeFixture().send({ month: "2026-09" })).status, 400);
  assert.equal((await routeFixture({ submitted: false }).send()).status, 400);
});
test("save endpoint isolates operating scores and requires confirmation for review", async () => {
  const f = routeFixture();
  assert.equal((await f.send()).status, 200);
  assert.equal(f.writes[0].table, "team_operating_reviews");
  assert.equal(f.writes[0].record.result.total, 100);
  assert.equal((await f.send({ status: "reviewed" })).status, 400);
  assert.equal((await f.send({ status: "reviewed", confirmed: true })).status, 200);
});
test("stale source, stale edits and database races cannot overwrite scores", async () => {
  for (const options of [{ source: "changed" }, { existing: { team_id: "t1", updated_at: "changed" } }, { written: false }, { writeError: { code: "23505" } }]) {
    assert.equal((await routeFixture(options).send()).status, 409);
  }
  const f = routeFixture({ existing: { team_id: "t1", updated_at: "original" } });
  assert.equal((await f.send({ reviewVersion: "original" })).status, 200);
  assert.ok(f.writes.some((entry) => entry.key === "updated_at" && entry.value === "original"));
});
test("score cards and subsections default collapsed, review is one dialog", () => {
  const board = compile("src/app/admin/operating-scores/OperatingScoreBoard.tsx", {
    react: React, "react/jsx-runtime": jsxRuntime, "lucide-react": icons,
    "next/navigation": { useRouter: () => ({ refresh() {} }) }, "@/lib/operating-score": api,
  }).default;
  const f = fixture();
  const html = renderToStaticMarkup(React.createElement(board, { month: "2026-10", results: [score(f)], reviews: [], hashes: { t1: "source" } }));
  assert.equal((html.match(/<dialog/g) ?? []).length, 1);
  assert.ok(!/<details[^>]*\sopen/.test(html));
  assert.match(html, /max-h-\[60vh\]/);
  assert.match(html, /lg:grid-cols-2/);
});
test("migration creates private, month-scoped isolated tables and append-only history", () => {
  const sql = fs.readFileSync(new URL("../supabase/operating-scores.sql", import.meta.url), "utf8");
  assert.match(sql, /target_month >= '2026-10'/);
  assert.match(sql, /team_operating_reviews enable row level security/);
  assert.match(sql, /team_operating_review_history enable row level security/);
  assert.match(sql, /after insert or update on public.team_operating_reviews/);
  assert.doesNotMatch(sql, /update public.monthly_data_submissions|team_incentive_reviews|delete from/i);
  assert.match(sql, /grant select, insert on public.team_operating_review_history to service_role/);
});
