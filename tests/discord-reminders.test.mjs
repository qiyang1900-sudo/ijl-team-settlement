import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const team = { id: "team", name: "Test", short_name: "TEST", discord_webhook_url: "https://example.invalid/webhook" };

function harness(options = {}) {
  const writes = [], requests = [], reads = [];
  let stateRead = 0;
  const now = options.now || "2026-09-07T01:00:00Z";
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const defaultState = { status: "not_submitted", submitted_at: null, salary_status: "not_submitted", projects: { status: "active" } };
  const supabase = { from(table) {
    const query = { table, mutation: null, values: null, filters: [] };
    for (const method of ["select", "eq", "in", "not", "order", "gte", "lt", "limit"]) {
      query[method] = (...args) => { query.filters.push([method, ...args]); return query; };
    }
    for (const method of ["update", "insert"]) {
      query[method] = (values) => { query.mutation = method; query.values = values; return query; };
    }
    async function execute(single) {
      if (query.mutation) {
        writes.push({ table, ...query.values });
        if (options.onWrite) options.onWrite(query, stateRead);
        return { data: { id: "log" }, error: options.writeError || null };
      }
      reads.push(table);
      if (table === "discord_reminder_logs") return { data: options.existingLog || null, error: null };
      if (table === "project_teams" || table === "monthly_data_submissions") {
        if (options.readError) return { data: null, error: { message: "database unavailable" } };
        if (single) {
          const sequence = options.states || [defaultState];
          return { data: sequence[Math.min(stateRead++, sequence.length - 1)], error: null };
        }
        if (table === "project_teams") return { data: options.assignments || [], error: null };
      }
      return { data: options.tables?.[table] ?? (single ? null : []), error: null };
    }
    query.single = query.maybeSingle = () => execute(true);
    query.then = (resolve, reject) => execute(false).then(resolve, reject);
    return query;
  } };
  const mocks = {
    "@/lib/supabase-server": { createSupabaseServerClient: () => supabase },
    "@/lib/settlement-report-template": { SETTLEMENT_REPORT_TEMPLATE_BASE64: "" },
    "@/lib/xlsx-template": {
      fillXlsxTemplate: () => Buffer.from("test workbook"),
      extendWorksheetToMaxColumn: (value) => value,
      trimWorksheetToMaxColumn: (value) => value,
    },
    ...options.mocks,
  };
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports, Buffer, Uint8Array, URL, Response, Request, Intl, Date: Clock,
      console: { error() {} },
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: "test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test", SUPABASE_SERVICE_ROLE_KEY: "test" } },
      fetch: async (url, init) => { requests.push({ url, ...init }); return { ok: true }; },
      require(name) {
        if (name in mocks) return mocks[name];
        const target = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(filename), name);
        return load(target + ".ts");
      },
    }, { filename });
    return exports;
  }
  const sender = load("src/lib/discord-reminders.ts");
  const send = (extra = {}) => sender.sendDiscordReminderOnce({
    supabase, team, reminderType: "project_submission", itemId: "project", targetMonth: null,
    reminderKey: "before-1", content: "test message", dryRun: false, ...extra,
  });
  return { load, sender, send, writes, reads, requests };
}

test("only explicit unsubmitted/draft/returned statuses are eligible", () => {
  const h = harness();
  const policy = h.load("src/lib/submission-reminder-policy.ts");
  for (const status of ["not_submitted", "draft", "returned"]) assert.equal(policy.isSubmissionReminderTarget(status), true);
  for (const status of ["submitted", "reviewing", "resubmitted", "pending", "pending_review", "approved", "exported", "new_unknown_status", "", null]) {
    assert.equal(policy.isSubmissionReminderTarget(status), false, String(status));
  }
  assert.equal(policy.isProjectReminderTarget({ status: "draft", submitted_at: "2026-09-01" }), false);
  assert.equal(policy.isProjectReminderTarget({ status: "returned", submitted_at: "2026-09-01" }), true);
});

test("QTD/RC legacy exports and approved records never send, including manual reminders", async () => {
  for (const status of ["exported", "approved", "submitted", "reviewing"]) {
    for (const reminderKey of ["before-1", "manual-test"]) {
      const h = harness({ states: [{ status, projects: { status: "active" } }] });
      assert.equal(await h.send({ reminderKey }), "skipped");
      assert.equal(h.requests.length, 0);
      assert.equal(h.writes[0].delivery_status, "skipped");
    }
  }
});

test("salary and monthly approvals remain independent regardless of screenshots", async () => {
  for (const [status, salary_status, monthlyResult, salaryResult] of [
    ["approved", "not_submitted", "skipped", "wouldSend"],
    ["not_submitted", "approved", "wouldSend", "skipped"],
    ["submitted", "draft", "skipped", "wouldSend"],
    ["draft", "submitted", "wouldSend", "skipped"],
    ["approved", "approved", "skipped", "skipped"],
  ]) {
    const h = harness({ states: [{ status, salary_status, player_rows: [] }] });
    assert.equal(await h.send({ reminderType: "monthly_data", targetMonth: "2026-08", dryRun: true }), monthlyResult);
    assert.equal(await h.send({ reminderType: "monthly_salary_screenshot", targetMonth: "2026-08", dryRun: true }), salaryResult);
    assert.equal(h.writes.length, 0);
  }
});

test("approval between candidate selection and dispatch cancels delivery", async () => {
  const h = harness({ states: [
    { status: "draft", projects: { status: "active" } },
    { status: "approved", projects: { status: "active" } },
  ] });
  assert.equal(await h.send(), "skipped");
  assert.equal(h.requests.length, 0);
  assert.equal(h.writes.at(-1).status_before_send, "approved");
  assert.equal(h.writes.at(-1).skip_reason, "already_submitted");
});

test("read errors, unknown states and missing project assignments cannot send", async () => {
  for (const [options, expected] of [
    [{ readError: true }, "failed"],
    [{ states: [{ status: "unexpected", projects: { status: "active" } }] }, "failed"],
    [{ states: [null] }, "skipped"],
    [{ states: [{ status: "draft", projects: { status: "archived" } }] }, "skipped"],
  ]) {
    const h = harness(options);
    assert.equal(await h.send(), expected);
    assert.equal(h.requests.length, 0);
    assert.ok(h.writes[0].skip_reason);
  }
  const h = harness({ states: [null] });
  assert.equal(await h.send({ reminderType: "monthly_data", targetMonth: "2026-08", dryRun: true }), "wouldSend");
});

test("latest eligible status controls reminder text and audit, with existing dedup preserved", async () => {
  const h = harness({ states: [
    { status: "not_submitted", projects: { status: "active" } },
    { status: "returned", projects: { status: "active" } },
  ] });
  assert.equal(await h.send({ reminderKey: "manual-test", content: (status) => `status:${status}` }), "sent");
  assert.equal(JSON.parse(h.requests[0].body).content, "status:returned");
  assert.equal(h.writes[0].source, "manual");
  assert.equal(h.writes.at(-1).status_before_send, "returned");
  assert.ok(h.writes.at(-1).checked_at);
  const duplicate = harness({ existingLog: { id: "old", delivery_status: "sent" } });
  assert.equal(await duplicate.send(), "skipped");
  assert.equal(duplicate.requests.length, 0);
});

test("a stale return notification is suppressed after resubmission/approval", async () => {
  for (const status of ["draft", "submitted", "approved"]) {
    const h = harness({ states: [{ status, projects: { status: "active" } }] });
    assert.equal(await h.send({ reminderType: "project_submission_returned" }), "skipped");
    assert.equal(h.requests.length, 0);
  }
});

test("Tokyo weekend skips both auto entrypoints while manual reminders remain available", async () => {
  for (const now of ["2026-09-04T15:00:00Z", "2026-09-06T14:59:59Z"]) {
    const h = harness({ now });
    const route = h.load("src/app/api/cron/discord-reminders/route.ts");
    for (const method of ["GET", "POST"]) {
      const result = await route[method](new Request("https://example.invalid/api/cron/discord-reminders", { method }));
      assert.equal((await result.json()).skipReason, "weekend");
    }
    assert.equal(h.reads.length, 0);
    assert.equal(await h.send({ reminderKey: "manual-weekend", dryRun: true }), "wouldSend");
  }
  const h = harness({ now: "2026-09-06T15:00:00Z" });
  const result = await h.load("src/app/api/cron/discord-reminders/route.ts").GET(new Request("https://example.invalid/api/cron/discord-reminders?dryRun=1"));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).skipReason, undefined);
});

test("project assignment query failure stops the entire automatic batch", async () => {
  const h = harness({ readError: true, tables: {
    teams: [team], projects: [{ id: "project", title: "Test", status: "active", deadline_at: "2026-09-08T23:59:00+09:00" }],
  } });
  const response = await h.load("src/app/api/cron/discord-reminders/route.ts").GET(new Request("https://example.invalid/api/cron/discord-reminders"));
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /database unavailable/);
  assert.equal(h.requests.length, 0);
});

test("Excel export records its timestamp without writing an approval status", async () => {
  const h = harness({ states: [{ id: "project-team", status: "approved", projects: { title: "Test" }, teams: team }] });
  const route = h.load("src/app/api/admin/project-teams/[projectTeamId]/export/route.ts");
  const response = await route.GET(new Request("https://example.invalid/export"), { params: Promise.resolve({ projectTeamId: "project-team" }) });
  assert.equal(response.status, 200);
  const update = h.writes.find((row) => row.table === "project_teams");
  assert.ok(update.exported_at);
  assert.equal(Object.hasOwn(update, "status"), false);
});
