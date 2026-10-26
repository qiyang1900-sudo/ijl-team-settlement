import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, Intl, require: (name) => load(path.posix.join(path.posix.dirname(file), `${name}.ts`)) });
  cache.set(file, exports);
  return exports;
}
const review = load("src/lib/monthly-review-list.ts");
const monthly = load("src/lib/monthly-data.ts");
const { readAllRows } = load("src/lib/read-all-rows.ts");
const names = ["AWG", "AXIZ", "DFM", "FL", "QTD", "RC", "SZ", "ZETA"];
const teams = names.map((name) => ({ id: name, short_name: name, name, is_active: true }));
const now = new Date("2026-10-26T08:00:00Z");
const settings = (options = {}) => review.buildMonthlyReviewSettings({ settings: [], now, ...options });
const complete = (submissions = [], options = {}) => review.buildCompleteMonthlyReviewRows({ submissions, teams, settings: settings(), ...options });
const row = (team, status, salary_status = "not_submitted", month = "2026-10") => ({
  id: `${team}-${month}`, team_id: team, target_month: month, status, salary_status,
  teams: teams.find((item) => item.id === team), player_rows: [], submitted_at: null,
});
const inMonth = (rows, month = "2026-10") => rows.filter((item) => item.target_month === month);
const ids = (rows) => Array.from(rows, (item) => item.team_id).sort();

test("October is complete before the reminder window, including when nobody has saved", () => {
  assert.equal(inMonth(complete()).length, 8);
  const actual = inMonth(complete([row("AWG", "not_submitted")]));
  assert.deepEqual(ids(actual), names.slice().sort());
  assert.equal(actual.filter((item) => item.isSynthetic).length, 7);
  assert.equal(actual.filter((item) => !item.isSynthetic).length, 1);
});

test("all-month and selected-month views contain the same records and counts", () => {
  const submissions = [row("AWG", "draft"), row("RC", "approved", "submitted")];
  const all = complete(submissions);
  const selected = complete(submissions, { settings: settings({ selectedMonth: "2026-10" }) });
  assert.deepEqual(JSON.parse(JSON.stringify(inMonth(all))), JSON.parse(JSON.stringify(inMonth(selected))));
  assert.equal(all.length, 8 * 5);
});

test("each status appears in exactly one group; saved drafts remain unsubmitted", () => {
  const statuses = ["not_submitted", "draft", "submitted", "reviewing", "returned", "approved", "submitted", "approved"];
  const submissions = teams.map((team, i) => row(team.id, statuses[i], "approved"));
  const groups = review.groupMonthlyReviewRecords(inMonth(complete(submissions)), "monthly");
  assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])), { notSubmitted: 2, draft: 0, submitted: 2, reviewing: 1, returned: 1, approved: 2 });
  assert.equal(new Set(Object.values(groups).flat().map((item) => item.id)).size, 8);
});

test("salary-only submission or approval does not hide unsubmitted monthly data", () => {
  const rows = inMonth(complete([row("RC", "not_submitted", "approved"), row("AWG", "draft", "submitted")]));
  assert.equal(review.groupMonthlyReviewRecords(rows, "monthly").notSubmitted.length, 8);
  const salary = review.groupMonthlyReviewRecords(rows, "salary");
  assert.equal(salary.approved.length, 1);
  assert.equal(salary.submitted.length, 1);
  assert.equal(salary.notSubmitted.length, 6);
});

test("monthly approval does not imply salary approval and no existing record is replaced", () => {
  const input = row("AWG", "approved", "draft");
  input.player_rows = [{ salaryScreenshotUrl: "retained", xTweetCount: "0" }];
  const before = JSON.stringify(input);
  const rows = inMonth(complete([input]));
  assert.equal(rows.find((item) => item.team_id === "AWG").id, input.id);
  assert.equal(review.groupMonthlyReviewRecords(rows, "salary").notSubmitted.length, 8);
  assert.equal(JSON.stringify(input), before);
  assert.equal(rows.filter((item) => item.team_id === "AWG").length, 1);
});

test("pre-June historical data is retained but excluded from review counters", () => {
  const rows = complete([row("AWG", "approved", "approved", "2026-05")]);
  assert.equal(inMonth(rows, "2026-05").length, 1);
  const groups = review.groupMonthlyReviewRecords(rows, "monthly");
  assert.equal(groups.approved.length, 0);
  assert.equal(groups.notSubmitted.length, 40);
});

test("existing inactive team records are retained without fabricating new obligations", () => {
  const inactive = { id: "OLD", name: "Old", short_name: "OLD", is_active: false };
  const rows = complete([{ ...row("OLD", "approved"), teams: inactive }], { teams: [...teams, inactive] });
  assert.equal(inMonth(rows).length, 9);
  assert.equal(rows.filter((item) => item.team_id === "OLD").length, 1);
});

test("duplicated settings and teams cannot create duplicate missing records", () => {
  const rows = complete([], { teams: [...teams, teams[0]], settings: [...settings(), ...settings()] });
  assert.equal(rows.length, 40);
  assert.equal(new Set(rows.map((item) => `${item.team_id}:${item.target_month}`)).size, 40);
});

test("calendar includes empty months and uses the Japanese month boundary", () => {
  assert.deepEqual(Array.from(settings(), (item) => item.target_month), ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  const before = settings({ now: new Date("2026-10-31T14:59:59Z") });
  const after = settings({ now: new Date("2026-10-31T15:00:00Z") });
  assert.equal(before.at(-1).target_month, "2026-10");
  assert.equal(after.at(-1).target_month, "2026-11");
});

test("selected and configured future months get complete rosters without changing deadlines", () => {
  const configured = { target_month: "2026-12", deadline_at: "2027-01-08T14:59:00Z", salary_screenshot_deadline_at: "2027-01-29T14:59:00Z" };
  const reviewSettings = settings({ settings: [configured], selectedMonth: "2027-02", extraMonths: ["2026-11", "2026-99", "bad"] });
  const rows = complete([], { settings: reviewSettings });
  assert.equal(inMonth(rows, "2026-11").length, 8);
  assert.equal(inMonth(rows, "2027-02").length, 8);
  assert.equal(inMonth(rows, "2026-12")[0].deadline_at, configured.deadline_at);
  assert.equal(reviewSettings.some((item) => item.target_month === "2026-99"), false);
});

test("visible records do not open reminder windows early", () => {
  const record = inMonth(complete())[0];
  assert.equal(record.deadline_at, "2026-11-10T14:59:00.000Z");
  assert.equal(record.salary_screenshot_deadline_at, "2026-11-30T14:59:00.000Z");
  assert.equal(monthly.isMonthlyDataReminderWindowOpen(record, now), false);
  assert.equal(monthly.isMonthlyDataReminderWindowOpen(record, new Date("2026-11-02T15:00:00Z")), true);
  assert.equal(monthly.isSalaryScreenshotReminderWindowOpen(record, now), false);
  assert.equal(monthly.isSalaryScreenshotReminderWindowOpen(record, new Date("2026-11-22T15:00:00Z")), true);
  assert.equal(monthly.buildMonthlyReminderSettings([], now).at(-1).target_month, "2026-09");
});

test("page loading exceeds 1000 rows and handles server caps below the requested size", async () => {
  const data = Array.from({ length: 1234 }, (_, id) => ({ id }));
  const result = await readAllRows(async (from, to) => ({ data: data.slice(from, Math.min(to + 1, from + 100)), count: data.length, error: null }));
  assert.equal(result.error, null);
  assert.deepEqual(Array.from(result.data, (row) => row.id), data.map((row) => row.id));
});

test("page failures never present partially loaded records as a complete list", async () => {
  const result = await readAllRows(async (from) => from === 0
    ? { data: [{ id: 1 }], error: null }
    : { data: null, error: { message: "read failed" } });
  assert.equal(result.data, null);
  assert.equal(result.error.message, "read failed");
});

test("exact row counts stop pagination without an out-of-range request", async () => {
  const data = Array.from({ length: 1000 }, (_, id) => ({ id }));
  let reads = 0;
  const result = await readAllRows(async (from, to) => {
    reads++;
    assert.ok(from < data.length);
    return { data: data.slice(from, to + 1), count: data.length, error: null };
  });
  assert.equal(reads, 2);
  assert.equal(result.data.length, 1000);
});

test("both review entrypoints use the shared roster logic and separate reminder checks", () => {
  for (const file of ["src/app/admin/reviews/page.tsx", "src/app/admin/reward/page.tsx"]) {
    const code = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(code, /from "@\/lib\/monthly-review-list"/);
    assert.match(code, /readAllRows\(\(from, to\) => supabase\s*\.from\("monthly_data_submissions"\)/);
    assert.doesNotMatch(code, /const syntheticRows = settings\.filter/);
    assert.match(code, /isMonthlyDataReminderWindowOpen\(row\)/);
    assert.match(code, /isSubmissionReminderTarget\(row.salary_status\)/);
  }
});
