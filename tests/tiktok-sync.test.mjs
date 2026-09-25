import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import ExcelJS from "exceljs";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(relative) {
  let file = path.resolve(root, relative);
  if (!path.extname(file)) file += ".ts";
  if (cache.has(file)) return cache.get(file);
  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
  const exports = {};
  cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    exports, Buffer, Uint8Array, URL, Response, AbortSignal, Date, Intl,
    require(name) {
      if (name === "server-only") return {};
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name));
      return require(name);
    },
  });
  return exports;
}
const api = load("src/lib/tiktok-sheet-import.ts");
const tt = load("src/lib/tiktok-monthly-data.ts");
const scores = load("src/lib/team-score.ts");
const summaries = load("src/lib/league-platform-summary.ts");
const sync = load("src/lib/tiktok-sheet-sync.ts");
const handles = ["awg_idv", "axizwave", "detonationfocusme_idv", "fennel.idv", "qtdig_5", "rc_identityv", "scarz_idv", "zetadivision_idv"];
async function fixture(change = () => {}, title = "6月") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title);
  sheet.addRow(["", "TikTok", "粉丝数", "配信回数", "投稿回数", "配信時間", "配信視聴回数", "動画視聴回数"]);
  api.tiktokTeams.forEach((team, index) => sheet.addRow([team, `https://www.tiktok.com/@${handles[index]}`, 1000, 0, 3, 0, 0, 100]));
  workbook.addWorksheet("26年9月");
  const aggregate = workbook.addWorksheet("月份数据");
  aggregate.addRow([9, 9999999]);
  change(sheet, workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("sheet dates do not drift with the current year and support explicit future years", () => {
  for (const [title, expected] of [["9月", "2025-09"], ["１月", "2026-01"], ["26年9月", "2026-09"], ["2027年1月", "2027-01"], ["月份数据", null], ["26年13月", null]]) assert.equal(api.tiktokMonthFromSheet(title), expected);
});
test("counts preserve true zero, commas and full-width numbers, never coerce missing to zero", () => {
  for (const value of [null, "", "-", "#N/A", "6,,936", -1, 0.5, "1e5"]) assert.equal(api.parseTiktokCount(value), null);
  assert.equal(api.parseTiktokCount("１,２３４"), 1234);
  assert.equal(api.parseTiktokCount(0), 0);
  assert.equal(api.parseTiktokCount({ formula: "SUM(A1)", result: 7 }), 7);
});
test("account identity ignores tracking parameters, supports short links and rejects other hosts", () => {
  assert.equal(api.tiktokAccountKey("www.tiktok.com/@Nameko1123?x=1"), "@nameko1123");
  assert.equal(api.tiktokAccountKey("http://www.tiktok.com/@user31067206361655"), "@user31067206361655");
  assert.equal(api.tiktokAccountKey("nameko (@nameko1123) | TikTok"), "@nameko1123");
  assert.equal(api.tiktokAccountKey("https://www.tiktok.com/search?q=%40kruger_2volt&t=2"), "@kruger_2volt");
  assert.equal(api.tiktokAccountKey("https://evil.example/@nameko1123"), null);
});
test("import skips invalid rows and empty months; official identity is independent of row order", async () => {
  const result = await api.parseTiktokWorkbook(await fixture((sheet) => {
    sheet.insertRow(2, ["AWG", "https://www.tiktok.com/@lizdesuyo", 2, 0, 1, 0, 0, 0]);
    sheet.addRow(["ZETA", "https://www.tiktok.com/@kznk3", { error: "#N/A" }, 0, 0, 0, 0, 0]);
  }), "2026-09");
  assert.equal(result.rows.length, 9);
  assert.equal(result.rows[0].isOfficial, false);
  assert.equal(result.rows[1].isOfficial, true);
  assert.equal(result.rows[1].accountName, "AWG公式");
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].account, "ZETA_Kznk");
  assert.deepEqual(Array.from(result.emptyMonths), ["2026-09"]);
  assert.deepEqual(Array.from(result.months), ["2026-06"]);
});
test("duplicate account, wrong official team, missing team or changed headers fail before saving", async () => {
  await assert.rejects(api.parseTiktokWorkbook(await fixture((s) => s.addRow(["AWG", "https://www.tiktok.com/@awg_idv?tracking=1", 1, 0, 0, 0, 0, 0])), "2026-09"), /重复/);
  await assert.rejects(api.parseTiktokWorkbook(await fixture((s) => { s.getCell("B2").value = "https://www.tiktok.com/@qtdig_5"; }), "2026-09"), /不一致/);
  await assert.rejects(api.parseTiktokWorkbook(await fixture((s) => s.spliceRows(9, 1)), "2026-09"), /缺少 ZETA/);
  await assert.rejects(api.parseTiktokWorkbook(await fixture((s) => { s.getCell("C1").value = "wrong"; }), "2026-09"), /缺少/);
});
test("sync updates instead of appending, preserves skipped historical data and zeros", async () => {
  const imported = await api.parseTiktokWorkbook(await fixture(), "2026-09");
  const baseline = [{ ...imported.rows[0], postCount: 20 }, { ...imported.rows[0], accountName: "old-player", link: "https://www.tiktok.com/@retired", postCount: 9 }];
  const first = api.mergeTiktokImport(baseline, imported);
  assert.equal(first.added, 7);
  assert.equal(first.updated, 1);
  assert.equal(first.rows.length, 9);
  const second = api.mergeTiktokImport(first.rows, imported);
  assert.equal(second.added, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 8);
  assert.equal(second.rows.length, 9);
  assert.equal(second.rows.find((r) => r.accountName === "old-player").postCount, 9);
});
test("league includes synced TT-only months, scoring uses synced TT without mutating review overrides", async () => {
  const imported = await api.parseTiktokWorkbook(await fixture(), "2026-09");
  const league = summaries.buildLeaguePlatformSummaries([], imported.rows, "2026-09");
  assert.equal(league[0].tiktok.postCount, 24);
  assert.equal(league[0].total.youtubeShortPostCount, 0);
  const score = scores.buildTeamMonthlyScores([{ id: "a", short_name: "AWG" }], [{ team_id: "a", target_month: "2026-06", status: "approved", player_rows: [] }], "2026-06", [{ team_id: "a", target_month: "2026-06", tiktok_manual_deduction: 3, tiktok_manual_note: scores.sectionScoreOverrideMarker }], imported.rows)[0];
  assert.equal(score.metrics.tiktokShortPosts, 3);
  assert.equal(score.sections.find((s) => s.key === "tiktok").score, 12);
  assert.equal(tt.getTiktokMonthlyRows("2026-06").length, 0);
});
test("source permission errors and HTML login responses never become an empty import", async () => {
  await assert.rejects(sync.fetchTiktokWorkbook(async () => new Response("login", { status: 200, headers: { "content-type": "text/html" } })), /读取失败/);
  const bytes = await fixture();
  const result = await sync.fetchTiktokWorkbook(async () => new Response(bytes, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } }));
  assert.ok(result.equals(bytes));
});

function mockStorage(options = {}) {
  const objects = new Map();
  const operations = [];
  let exists = false;
  const files = {
    async download(key) { return objects.has(key) ? { data: new Blob([objects.get(key)]), error: null } : { data: null, error: { message: "Object not found", statusCode: "404" } }; },
    async upload(key, value, config) {
      operations.push(key);
      if (options.failAt === key || (objects.has(key) && !config.upsert)) return { error: { message: "conflict" } };
      objects.set(key, value);
      return { error: null };
    },
    async remove(keys) { keys.forEach((key) => objects.delete(key)); return { error: null }; },
  };
  return { objects, operations, client: { storage: {
    async getBucket() { return { data: exists ? { public: false } : null, error: exists ? null : { message: "Bucket not found" } }; },
    async createBucket(name, config) { assert.equal(config.public, false); exists = true; return { error: null }; },
    from() { return files; },
  } } };
}
test("a full sync is atomic, backed up, idempotent and releases the lock", async () => {
  const store = mockStorage();
  const bytes = await fixture();
  const fetcher = async () => new Response(bytes, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
  const first = await sync.syncTiktokSheet(store.client, fetcher);
  assert.equal(first.added, 8);
  assert.equal(store.objects.has("sync-lock.json"), false);
  assert.equal(store.operations.at(-1), "current.json");
  assert.equal([...store.objects.keys()].filter((key) => key.startsWith("history/")).length, 2);
  const second = await sync.syncTiktokSheet(store.client, fetcher);
  assert.equal(second.added, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 8);
});
test("bad source, concurrent clicks and failed write preserve the current dataset", async () => {
  const store = mockStorage({ failAt: "current.json" });
  const previous = { version: 1, syncedAt: "2026-09-01T00:00:00Z", rows: tt.tiktokMonthlyRows };
  store.objects.set("current.json", JSON.stringify(previous));
  const bytes = await fixture();
  const fetcher = async () => new Response(bytes, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
  await assert.rejects(sync.syncTiktokSheet(store.client, fetcher), /尚未确认/);
  assert.equal(store.objects.get("current.json"), JSON.stringify(previous));
  assert.equal(store.objects.has("sync-lock.json"), false);
  await assert.rejects(sync.syncTiktokSheet(store.client, async () => new Response("denied", { status: 403 })), /读取失败/);
  assert.equal(store.objects.get("current.json"), JSON.stringify(previous));
  store.objects.set("sync-lock.json", "another run");
  await assert.rejects(sync.syncTiktokSheet(store.client, fetcher), /已有同步/);
  assert.equal(store.objects.get("sync-lock.json"), "another run");
});

if (process.env.TIKTOK_SOURCE_FILE) {
  test("read-only verification against the supplied live workbook", async () => {
    const result = await api.parseTiktokWorkbook(fs.readFileSync(process.env.TIKTOK_SOURCE_FILE), "2026-09");
    const merged = api.mergeTiktokImport(tt.tiktokMonthlyRows, result);
    const totals = summaries.buildLeaguePlatformSummaries([], merged.rows, "2026-09").map((row) => ({ month: row.month, ...row.tiktok }));
    console.log(JSON.stringify({ imported: result.rows.length, skipped: result.issues.length, added: merged.added, updated: merged.updated, unchanged: merged.unchanged, emptyMonths: result.emptyMonths, totals }, null, 2));
    assert.deepEqual(Array.from(result.months).slice(-3), ["2026-06", "2026-07", "2026-08"]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(process.env.TIKTOK_SOURCE_FILE);
    for (const name of ["6月", "7月", "8月"]) {
      const month = api.tiktokMonthFromSheet(name);
      const direct = { followerCount: 0, streamCount: 0, postCount: 0, streamViews: 0, videoViews: 0 };
      workbook.getWorksheet(name).eachRow((row, index) => {
        if (index === 1) return;
        const values = [3, 4, 5, 7, 8].map((column) => row.getCell(column).value);
        if (!values.every((value) => typeof value === "number" && Number.isInteger(value))) return;
        Object.keys(direct).forEach((key, i) => { direct[key] += values[i]; });
      });
      for (const key of Object.keys(direct)) assert.equal(totals.find((row) => row.month === month)[key], direct[key], `${month} ${key}`);
    }
  });
}
