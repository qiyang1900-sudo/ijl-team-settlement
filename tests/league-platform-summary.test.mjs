import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const cache = new Map();
function load(relative) {
  let filename = path.resolve(root, relative);
  if (!path.extname(filename)) filename += fs.existsSync(filename + ".ts") ? ".ts" : ".tsx";
  if (cache.has(filename)) return cache.get(filename);
  if (filename.endsWith(".json")) return JSON.parse(fs.readFileSync(filename, "utf8"));
  const exports = {};
  cache.set(filename, exports);
  let source = fs.readFileSync(filename, "utf8");
  if (filename.endsWith("league-summary/export/route.ts")) {
    source += "\nexport const testOnly = { buildSummarySheet, createXlsxWorkbook };";
  }
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, {
    exports, Buffer, Uint8Array, URL, Response, Date,
    require(name) {
      if (name === "@/lib/supabase-server") return {};
      if (name.startsWith("@/")) return load(path.join("src", name.slice(2)));
      if (name.startsWith(".")) return load(path.resolve(path.dirname(filename), name));
      return require(name);
    },
  });
  return exports;
}
const data = load("src/lib/monthly-data.ts");
const summaries = load("src/lib/monthly-summary.ts");
const api = load("src/lib/league-platform-summary.ts");
const tt = load("src/lib/tiktok-monthly-data.ts");
const Chart = load("src/app/admin/components/MonthlyComboChart.tsx").default;
const Table = load("src/app/admin/league-summary/LeagueSummaryTable.tsx").default;
const plain = (value) => JSON.parse(JSON.stringify(value));
function youtube(month = "2026-05") {
  return summaries.buildMonthlySummary(month, [{
    ...data.createOfficialMonthlyRow("AWG"),
    youtubeVideoPostCount: "2", youtubeVideoViews: "200",
    youtubeShortPostCount: "3", youtubeShortViews: "300", youtubeLikeCount: "40",
    youtubeStreamCount: "5", youtubeStreamViews: "500", youtubeSubscriberCount: "1000",
  }], [], 1);
}
function tiktok(overrides = {}) {
  return {
    month: "2026-05", teamShortName: "AWG", accountName: "official", isOfficial: true,
    link: "https://www.tiktok.com/@awg_idv", followerCount: 90, streamCount: 7,
    postCount: 11, streamViews: 700, videoViews: 1100, ...overrides,
  };
}

test("league YT values remain YT-only and TT is independently aggregated", () => {
  const base = youtube();
  const result = api.withLeagueTiktok(base, [tiktok(), tiktok({ isOfficial: false, postCount: 9 })]);
  assert.deepEqual(plain(result.total), plain(base.total));
  assert.equal(result.total.youtubeShortPostCount, 3);
  assert.equal(result.total.youtubeShortViews, 300);
  assert.equal(result.tiktok.postCount, 20);
  assert.equal(result.tiktok.streamCount, 14);
  assert.equal(result.tiktok.followerCount, 180);
  assert.equal(result.tiktok.likeCount, null);
  assert.equal(api.withLeagueTiktok(result, [tiktok()]).tiktok.postCount, 11);
});

test("no TT rows or missing likes are unknown; real zero remains zero", () => {
  const empty = api.withLeagueTiktok(youtube(), []);
  assert.ok(Object.values(empty.tiktok).every((value) => value === null));
  const zero = api.withLeagueTiktok(youtube(), [tiktok({ likeCount: 0, streamCount: 0 })]);
  assert.equal(zero.tiktok.likeCount, 0);
  assert.equal(zero.tiktok.streamCount, 0);
  const partial = api.withLeagueTiktok(youtube(), [tiktok({ likeCount: 12 }), tiktok()]);
  assert.equal(partial.tiktok.likeCount, null);
});

test("rows from other months cannot leak into a monthly TT total", () => {
  const row = api.withLeagueTiktok(youtube(), [tiktok(), tiktok({ month: "2026-06", postCount: 100 })]);
  assert.equal(row.tiktok.postCount, 11);
});

test("period counters sum once while followers use the last month, independent of order", () => {
  const may = api.withLeagueTiktok(youtube(), [tiktok({ likeCount: 2 })]);
  const june = api.withLeagueTiktok(youtube("2026-06"), [tiktok({ month: "2026-06", followerCount: 120, postCount: 2, likeCount: 3 })]);
  const period = api.combineLeagueSummariesForPeriod("period", [june, may]);
  assert.equal(period.tiktok.postCount, 13);
  assert.equal(period.tiktok.likeCount, 5);
  assert.equal(period.tiktok.followerCount, 120);
  assert.equal(period.total.youtubeShortPostCount, 6);
  assert.equal(period.total.youtubeSubscriberCount, 1000);
});

test("missing final month does not borrow stale follower data or imply complete period totals", () => {
  const may = api.withLeagueTiktok(youtube(), [tiktok()]);
  const june = api.withLeagueTiktok(youtube("2026-06"), []);
  const period = api.combineLeagueSummariesForPeriod("period", [may, june]);
  assert.equal(period.tiktok.followerCount, null);
  assert.equal(period.tiktok.postCount, null);
});

test("all requested column positions use the matching platform metric", () => {
  const keys = Array.from(api.leagueSummaryColumns, (column) => column.key);
  assert.equal(keys.length, 25);
  assert.equal(keys[keys.indexOf("ytFollowers") + 1], "ttFollowers");
  assert.deepEqual(keys.slice(keys.indexOf("ytStreams") + 1, keys.indexOf("ytStreams") + 3), ["ttStreamViews", "ttStreams"]);
  assert.deepEqual(keys.slice(keys.indexOf("ytLikes") + 1), ["ttPosts", "ttViews", "ttLikes"]);
  const row = api.withLeagueTiktok(youtube(), [tiktok()]);
  const cells = Object.fromEntries(api.leagueSummaryColumns.map((column) => [column.key, column.value(row)]));
  assert.equal(cells.ytShortPosts, 3);
  assert.equal(cells.ttPosts, 11);
  assert.equal(cells.ytStreamViews, 500);
  assert.equal(cells.ttStreamViews, 700);
  assert.equal(cells.ttLikes, null);
});

test("Excel columns and monthly cells exactly match the webpage schema", () => {
  const route = load("src/app/api/admin/league-summary/export/route.ts").testOnly;
  const row = api.withLeagueTiktok(youtube(), [tiktok()]);
  const sheet = route.buildSummarySheet([row], [row], row.month);
  assert.deepEqual(plain(sheet.rows[0].cells), Array.from(api.leagueSummaryColumns, (column) => column.label));
  assert.deepEqual(plain(sheet.rows[1].cells), Array.from(api.leagueSummaryColumns, (column) => column.value(row)));
  assert.equal(sheet.widths.length, 25);
  assert.equal(sheet.rows[3].cells[0], "当前期间总计算数");
  const workbook = Buffer.from(route.createXlsxWorkbook([sheet]));
  assert.equal(workbook.subarray(0, 2).toString(), "PK");
  const xml = workbook.toString();
  assert.match(xml, /短视频投稿（TT）/);
  assert.match(xml, /r="W2"[^>]*><v>11<\/v>/);
  assert.doesNotMatch(xml, /r="Y2"[^>]*><v>0<\/v>/);
});

test("table renders unknown as a dash, real zero as zero, and totals beneath the table", () => {
  const row = api.withLeagueTiktok(youtube(), [tiktok({ streamCount: 0 })]);
  const html = renderToStaticMarkup(React.createElement(Table, { rows: [row], summary: row }));
  assert.match(html, />—<\/td>/);
  assert.match(html, />0<\/td>/);
  assert.ok(html.indexOf("当前期间总计算数") > html.indexOf("</table>"));
  assert.equal((html.match(/scope="col"/g) || []).length, 25);
});

test("monthly chart leaves missing months as gaps and renders actual zero", () => {
  const html = renderToStaticMarkup(React.createElement(Chart, {
    title: "TikTok", points: [
      { label: "5月", barValue: 10, lineValue: 1 },
      { label: "6月", barValue: null, lineValue: null },
      { label: "7月", barValue: 0, lineValue: 0 },
      { label: "8月", barValue: 30, lineValue: 3 },
    ], showInsights: true,
  }));
  const d = html.match(/<path d="([^"]+)"/)[1];
  assert.equal((d.match(/M /g) || []).length, 2);
  assert.equal((d.match(/L /g) || []).length, 1);
  assert.equal((html.match(/<circle /g) || []).length, 3);
  assert.doesNotMatch(html, /6月 的/);
});

test("empty and all-zero charts are distinguishable", () => {
  const missing = renderToStaticMarkup(React.createElement(Chart, { title: "TikTok", points: [{ label: "5月", barValue: null, lineValue: null }] }));
  const zero = renderToStaticMarkup(React.createElement(Chart, { title: "TikTok", points: [{ label: "5月", barValue: 0, lineValue: 0 }] }));
  assert.match(missing, /暂无月数据/);
  assert.doesNotMatch(missing, /<svg/);
  assert.match(zero, /<circle/);
  assert.doesNotMatch(zero, /暂无月数据/);
});

test("YoY never treats unavailable TT as a 100 percent decline", () => {
  assert.equal(api.formatLeagueComparison(null, 100), "-");
  assert.equal(api.formatLeagueComparison(100, null), "-");
  assert.equal(api.formatLeagueComparison(100, 0), "-");
  assert.equal(api.formatLeagueComparison(0, 100), "-100.0%");
});

test("scoring still combines Shorts and TT, and only accepts approved submissions", () => {
  const score = load("src/lib/team-score.ts");
  const team = { id: "awg", name: "AWG", short_name: "AWG" };
  const submission = { team_id: "awg", target_month: "2026-05", status: "approved", player_rows: youtube().officialRows };
  const approved = score.buildTeamMonthlyScores([team], [submission], "2026-05")[0];
  const ttPosts = tt.getTiktokMonthlySummary("2026-05", "AWG").total.postCount;
  assert.ok(ttPosts > 0);
  assert.equal(approved.metrics.youtubeShortPosts, 3);
  assert.equal(approved.metrics.totalShortPosts, 3 + ttPosts);
  const unapproved = score.buildTeamMonthlyScores([team], [{ ...submission, status: "draft" }], "2026-05")[0];
  assert.equal(unapproved.hasApprovedData, false);
});
