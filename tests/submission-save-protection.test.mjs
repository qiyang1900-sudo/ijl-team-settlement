import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";

function compile(file, imports = {}, extra = "") {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8") + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Error, URL, Date, Intl, File, FormData, process: { env: {} }, require: name => imports[name] || {} });
  return exports;
}
const monthly = compile("src/lib/monthly-data.ts");
const page = compile("src/app/team/reward/page.tsx", { "@/lib/monthly-data": monthly },
  "\nexport { findMatchingPlayerRow, validateMonthlyPlayerIdentities, mergeMonthlyRowsPreservingSalary, mergeSalaryRowsPreservingMonthlyDraft };\n");
const importer = compile("src/lib/monthly-import.ts", { "./monthly-data": monthly });
const project = compile("src/lib/project-submission-save.ts", {
  "node:crypto": crypto,
  "./tax-rate": compile("src/lib/tax-rate.ts"),
  "./invoice-upload-links": compile("src/lib/invoice-upload-links.ts"),
  "./report-screenshots": compile("src/lib/report-screenshots.ts"),
});
const row = (id, changes = {}) => ({ ...monthly.emptyMonthlyPlayerRow(), playerId: id, playerHandle: id, playerName: id, ...changes });
const plain = value => JSON.parse(JSON.stringify(value));

test("new roster members never inherit another member's salary or SNS data by position", () => {
  const saved = [row("p1", { salaryAmount: "118182", xTweetCount: "31" }), row("p2", { xTweetCount: "7" })];
  const incoming = [row("p3", { salaryAmount: "123" }), row("p1"), row("p2")];
  page.validateMonthlyPlayerIdentities(incoming, saved);
  const salary = page.mergeSalaryRowsPreservingMonthlyDraft({ salaryRows: incoming, existingPlayerRows: saved });
  assert.equal(salary[0].playerId, "p3");
  assert.equal(salary[0].xTweetCount, "");
  assert.equal(salary[1].xTweetCount, "31");
  const data = page.mergeMonthlyRowsPreservingSalary({ monthlyRows: incoming, existingPlayerRows: saved });
  assert.equal(data[0].salaryAmount, "");
  assert.equal(data[1].salaryAmount, "118182");
  assert.equal(page.findMatchingPlayerRow(row("p4", { playerName: "p1" }), saved), null);
});

test("truncated or duplicate roster saves fail instead of dropping stored members", () => {
  const saved = [row("p1"), row("p2")];
  assert.throws(() => page.validateMonthlyPlayerIdentities([row("p1")], saved), /含まれていません/);
  assert.throws(() => page.validateMonthlyPlayerIdentities([row("p1"), row("p1"), row("p2")], saved), /重複/);
  assert.throws(() => page.findMatchingPlayerRow(row("p1"), [row("p1"), row("p1")]), /重複/);
  assert.doesNotThrow(() => page.validateMonthlyPlayerIdentities([row("p2"), row("p1")], saved));
});

test("overwrite import preserves empty source cells and unrelated salary/YT values; explicit zero replaces", () => {
  const saved = [row("p1", { xTweetCount: "31", xEngagements: "100", salaryAmount: "118182", youtubeVideoViews: "999" })];
  const before = plain(saved);
  const result = importer.mergeImportedMonthlyRows({ existingRows: saved, incomingRows: [row("p1", { xTweetCount: "", xEngagements: "0" })], dataType: "x", mode: "overwrite" });
  assert.equal(result[0].xTweetCount, "31");
  assert.equal(result[0].xEngagements, "0");
  assert.equal(result[0].salaryAmount, "118182");
  assert.equal(result[0].youtubeVideoViews, "999");
  assert.deepEqual(plain(saved), before);
  const fill = importer.mergeImportedMonthlyRows({ existingRows: saved, incomingRows: [row("p1", { xEngagements: "88" })], dataType: "x", mode: "fill" });
  assert.equal(fill[0].xEngagements, "100");
  assert.throws(() => importer.mergeImportedMonthlyRows({ existingRows: saved, incomingRows: [row("p1"), row("p1")], dataType: "x", mode: "overwrite" }), /账号重复/);
});

function fixture(overrides = {}) {
  const state = { project: { id: "project", team_id: "team", status: "draft", ...overrides }, company: null, summary: [], details: [], reports: [], files: [] };
  const formData = new FormData();
  for (const [key, value] of Object.entries({ base_revision: project.projectSubmissionRevision(state), action_type: "draft", summary_count: "1", detail_count: "1", tax_rate: "0.1", report_total_amount: "110", quantity_0: "1", unit_price_0: "100" })) formData.set(key, value);
  const calls = [];
  const supabase = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === "project_submission_state") return { data: state };
    return { error: { message: "simulated transaction failure" } };
  }, from: () => { throw Error("Unexpected non-atomic table write"); } };
  const storageClient = { storage: { from: () => ({ upload: async () => { calls.push({ name: "upload" }); return {}; }, getPublicUrl: () => ({ data: { publicUrl: "https://example.test/new" } }) }) } };
  return { state, calls, formData, supabase, storageClient, teamId: "team", projectTeamId: "project" };
}

test("project stale revisions and locked submissions fail before any upload or write", async () => {
  for (const status of ["submitted", "resubmitted", "reviewing", "approved", "exported"]) {
    const f = fixture({ status });
    await assert.rejects(project.saveProjectSubmission(f), /変更できません/);
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  f.formData.set("base_revision", "stale");
  await assert.rejects(project.saveProjectSubmission(f), /旧バージョン/);
  assert.equal(f.calls.length, 1);
});

test("project validates every image before uploading the first and preserves the snapshot on failure", async () => {
  const f = fixture();
  f.formData.append("report_screenshot_0", new File(["image"], "valid.png", { type: "image/png" }));
  f.formData.append("report_screenshot_0", new File(["document"], "invalid.txt", { type: "text/plain" }));
  await assert.rejects(project.saveProjectSubmission(f), /画像のみ/);
  assert.equal(f.calls.length, 1);
});

test("project saves send one atomic request and propagate specific errors without partial table deletes", async () => {
  const f = fixture();
  const before = plain(f.state);
  await assert.rejects(project.saveProjectSubmission(f), /simulated transaction failure/);
  assert.deepEqual(f.calls.map(c => c.name), ["project_submission_state", "save_project_submission_atomic"]);
  assert.deepEqual(plain(f.state), before);
  assert.deepEqual(plain(f.calls[1].args.p_before), before);
  assert.equal(f.calls[1].args.p_payload.details[0].unit_price, 100);
});
