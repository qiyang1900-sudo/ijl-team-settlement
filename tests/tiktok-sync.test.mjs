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
test("yearless months follow consecutive tabs past September and across calendar years", () => {
  let previous = null;
  const titles = ["25年9月", "10月", "11月", "12月", "１月", "２月", "3月", "4月", "5月", "6月", "7月", "8月", "9月"];
  const months = titles.map((title) => (previous = api.tiktokMonthFromSheet(title, previous)));
  assert.equal(months[0], "2025-09");
  assert.equal(months[4], "2026-01");
  assert.equal(months.at(-1), "2026-09");
  assert.equal(api.tiktokMonthFromSheet("10月", "2026-09"), "2026-10");
  assert.equal(api.tiktokMonthFromSheet("1月", "2026-12"), "2027-01");
  assert.equal(api.tiktokMonthFromSheet("25年9月", "2026-08"), "2025-09");
  assert.equal(api.tiktokMonthFromSheet("9月", "2026-09"), "2026-09");
});
test("hidden historical September and current yearless September import into distinct months", async () => {
  const bytes = await fixture((sheet, workbook) => {
    sheet.name = "25年9月";
    sheet.state = "hidden";
    workbook.removeWorksheet(workbook.getWorksheet("26年9月").id);
    for (const title of ["10月", "11月", "12月", "１月", "２月", "3月", "4月", "5月", "6月", "7月", "8月", "9月"]) {
      const next = workbook.addWorksheet(title);
      sheet.eachRow((row) => next.addRow(row.values));
      if (title === "9月") next.getCell("H2").value = 999;
    }
  });
  const result = await api.parseTiktokWorkbook(bytes, "2026-10");
  assert.equal(result.months.length, 13);
  assert.equal(result.rows.length, 104);
  assert.equal(result.rows.find((r) => r.month === "2025-09" && r.teamShortName === "AWG").videoViews, 100);
  assert.equal(result.rows.find((r) => r.month === "2026-09" && r.teamShortName === "AWG").videoViews, 999);
});
test("actual duplicate month tabs still fail with both sheet names, including empty duplicates", async () => {
  const bytes = await fixture((sheet, workbook) => {
    sheet.name = "25年9月";
    workbook.addWorksheet("9月");
    workbook.removeWorksheet(workbook.getWorksheet("26年9月").id);
  });
  await assert.rejects(api.parseTiktokWorkbook(bytes, "2026-10"), /2025-09.*「25年9月」.*「9月」/);
  await assert.rejects(api.parseTiktokWorkbook(await fixture((_sheet, workbook) => {
    workbook.addWorksheet("9月");
  }), "2026-10"), /2026-09.*「26年9月」.*「9月」/);
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
test("TT monthly likes are read by header from October, including zero and normalized numbers", async () => {
  const bytes = await fixture((sheet) => {
    sheet.getCell("I1").value = "コメント数";
    sheet.getCell("K1").value = "いいね数";
    for (let row = 2; row <= 9; row++) {
      sheet.getCell(`I${row}`).value = 99999;
      sheet.getCell(`K${row}`).value = 10;
    }
    sheet.getCell("K2").value = "１,２３４";
    sheet.getCell("K3").value = 0;
    sheet.getCell("K4").value = { formula: "SUM(K5:K6)", result: 20 };
  }, "26年10月");
  const imported = await api.parseTiktokWorkbook(bytes, "2026-10");
  assert.equal(imported.rows[0].likeCount, 1234);
  assert.equal(imported.rows[1].likeCount, 0);
  assert.equal(imported.rows[2].likeCount, 20);
  assert.equal(imported.issues.length, 0);
});
test("new TT like columns do not backfill or alter September and older rows", async () => {
  for (const title of ["26年7月", "26年8月", "26年09月"]) {
    const make = async (likes) => api.parseTiktokWorkbook(await fixture((sheet, workbook) => {
      workbook.removeWorksheet(workbook.getWorksheet("26年9月").id);
      if (likes) {
        sheet.getCell("J1").value = "いいね数";
        sheet.getCell("J2").value = 987654;
        sheet.getCell("J3").value = { error: "#N/A" };
      }
    }, title), "2026-10");
    const before = await make(false);
    const after = await make(true);
    assert.equal(JSON.stringify(after), JSON.stringify(before));
    assert.ok(after.rows.every((row) => !Object.hasOwn(row, "likeCount")));
    const merged = api.mergeTiktokImport(before.rows, after);
    assert.equal(merged.updated, 0);
    assert.equal(JSON.stringify(merged.rows), JSON.stringify(api.mergeTiktokImport(before.rows, before).rows));
  }
});
test("missing or invalid TT likes only flag that metric and keep other current data", async () => {
  const withoutHeader = await api.parseTiktokWorkbook(await fixture(() => {}, "26年10月"), "2026-10");
  assert.equal(withoutHeader.rows.length, 8);
  assert.ok(withoutHeader.rows.every((row) => row.likeCount === null));
  assert.ok(withoutHeader.issues.every((issue) => issue.metric === "likeCount"));
  const imported = await api.parseTiktokWorkbook(await fixture((sheet) => {
    sheet.getCell("J1").value = "いいね数";
    const values = [null, { error: "#N/A" }, -1, 1.5, "-", "bad", 0, 12];
    values.forEach((value, i) => { sheet.getCell(`J${i + 2}`).value = value; });
  }, "26年10月"), "2026-10");
  assert.equal(imported.rows.length, 8);
  assert.equal(imported.issues.length, 6);
  assert.ok(imported.rows.slice(0, 6).every((row) => row.likeCount === null && row.videoViews === 100));
  assert.equal(imported.rows[6].likeCount, 0);
});
test("like-only changes count as updates, preserve invalid previous values and remain idempotent", async () => {
  const valid = await api.parseTiktokWorkbook(await fixture((sheet) => {
    sheet.getCell("J1").value = "いいね数";
    for (let i = 2; i <= 9; i++) sheet.getCell(`J${i}`).value = 20;
  }, "26年10月"), "2026-10");
  const old = valid.rows.map((row) => {
    const previous = { ...row };
    delete previous.likeCount;
    return previous;
  });
  const first = api.mergeTiktokImport(old, valid);
  assert.equal(first.updated, 8);
  assert.equal(api.mergeTiktokImport(first.rows, valid).updated, 0);
  const changed = { ...valid, rows: valid.rows.map((row, index) => ({ ...row, likeCount: index === 0 ? 0 : index === 1 ? null : 20 })) };
  const merged = api.mergeTiktokImport(first.rows, changed);
  assert.equal(merged.updated, 1);
  assert.equal(merged.rows.find((row) => row.teamShortName === "AWG").likeCount, 0);
  assert.equal(merged.rows.find((row) => row.teamShortName === "AXIZ").likeCount, 20);
  assert.equal(first.rows.find((row) => row.teamShortName === "AWG").likeCount, 20);
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
test("October likes survive workbook sync and storage loading into B without touching historical data", async () => {
  const store = mockStorage();
  const oldRows = (await api.parseTiktokWorkbook(await fixture(), "2026-09")).rows;
  store.objects.set("current.json", JSON.stringify({ version: 1, syncedAt: "2026-09-30T00:00:00Z", rows: oldRows }));
  const bytes = await fixture((sheet) => {
    sheet.insertRow(3, ["", "https://www.tiktok.com/@lizdesuyo", 2000, 0, 3, 0, 0, 100]);
    sheet.getCell("J1").value = "いいね数";
    for (let i = 2; i <= 10; i++) sheet.getCell(`J${i}`).value = i === 3 ? 200 : 99999;
  }, "26年10月");
  await sync.syncTiktokSheet(store.client, async () => new Response(bytes, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } }));
  const dataset = await load("src/lib/tiktok-dataset.ts").loadTiktokDataset(store.client);
  const afterOldRows = dataset.rows.filter((row) => row.month === "2026-06");
  assert.equal(JSON.stringify(afterOldRows), JSON.stringify(api.mergeTiktokImport(oldRows, { rows: [] }).rows));
  const monthly = load("src/lib/monthly-data.ts");
  const incentive = load("src/lib/incentive-score.ts");
  const result = incentive.buildIncentiveMonth({
    month: "2026-10", teams: [{ id: "awg", short_name: "AWG" }],
    submissions: [{ team_id: "awg", target_month: "2026-10", status: "approved", content_skipped: true,
      player_rows: [{ ...monthly.emptyMonthlyPlayerRow(0), id: "aez", playerId: "aez", playerName: "Aez", playerRole: "選手", youtubeLikeCount: "100" }] }],
    tiktokRows: dataset.rows, tiktokIssues: dataset.snapshot.issues,
  }, [{ team_id: "awg", target_month: "2026-10", status: "draft", source_hash: "fixture", inputs: {
    overrides: {}, individuals: {}, scores: { aYoutube: 30, aShorts: 15, aX: 15 }, note: "Test fixture A" } }]);
  assert.equal(result.teams[0].proposed.shortLikes, 300);
  assert.equal(result.teams[0].b.ranks.shortLikes, 1);
  assert.equal(result.teams[0].b.shorts, 3);
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
    assert.deepEqual(Array.from(result.months).slice(-3), ["2026-07", "2026-08", "2026-09"]);
    assert.ok(result.months.includes("2025-09"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(process.env.TIKTOK_SOURCE_FILE);
    for (const name of ["6月", "7月", "8月", "9月"]) {
      const month = `2026-${String(Number(name.replace("月", ""))).padStart(2, "0")}`;
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
