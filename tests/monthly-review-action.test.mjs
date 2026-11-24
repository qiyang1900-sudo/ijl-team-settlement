import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/monthly-review-action.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(options = {}) {
  let row = { id: "submission", status: "submitted", salary_status: "approved", updated_at: "revision-1", player_rows: [{ name: "test", screenshot: "image" }], ...options.row };
  const writes = [], reminders = [], revalidated = [];
  const supabase = { from: () => {
    let patch;
    const filters = [];
    const query = {
      select() { return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      is(key, value) { filters.push([key, value]); return this; },
      update(value) { patch = value; return this; },
      async maybeSingle() {
        if (!patch) return { data: { ...row }, error: null };
        if (options.race) row = { ...row, ...options.race };
        if (options.dbError) return { data: null, error: { message: "save failed" } };
        if (!filters.every(([key, value]) => row[key] === value)) return { data: null, error: null };
        writes.push(patch);
        row = { ...row, ...patch };
        return { data: { id: row.id }, error: null };
      },
    };
    return query;
  } };
  const exports = {};
  vm.runInNewContext(code, { exports, Date, Error, process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid" } }, require: (name) => ({
    "server-only": {},
    "next/cache": { revalidatePath: path => revalidated.push(path) },
    "@/lib/admin-auth": { getAdminSession: async () => options.admin !== false },
    "@/lib/supabase-server": { createSupabaseServerClient: () => supabase },
    "@/lib/return-reminders": { sendMonthlyReturnReminder: async args => reminders.push(args) },
  })[name] });
  const form = new FormData();
  for (const [key, value] of Object.entries({ submission_id: "submission", action_type: "approved", review_kind: "monthly", expected_updated_at: "revision-1", ...options.form })) {
    if (value !== null) form.set(key, value);
  }
  return { run: () => exports.applyMonthlyReviewAction(form), row: () => row, writes, reminders, revalidated };
}

for (const status of ["draft", "not_submitted", "returned", "approved"]) {
  test(`stale admin page cannot review a ${status} monthly submission`, async () => {
    const h = harness({ row: { status } });
    assert.equal(await h.run(), false);
    assert.equal(h.writes.length, 0);
    assert.equal(h.reminders.length, 0);
  });
}

test("old page cannot approve a withdrawn and resubmitted revision", async () => {
  const h = harness({ row: { updated_at: "revision-2" } });
  assert.equal(await h.run(), false);
  assert.equal(h.writes.length, 0);
});

test("withdrawal racing with admin rejection wins without sending a return reminder", async () => {
  const h = harness({ form: { action_type: "returned" }, race: { status: "draft", updated_at: "revision-2" } });
  assert.equal(await h.run(), false);
  assert.equal(h.writes.length, 0);
  assert.equal(h.reminders.length, 0);
  assert.equal(h.revalidated.length, 0);
});

test("concurrent edit is not overwritten even if status stays submitted", async () => {
  const h = harness({ race: { updated_at: "revision-2" } });
  assert.equal(await h.run(), false);
  assert.equal(h.writes.length, 0);
});

test("monthly review keeps salary and data unchanged and refreshes both sides", async () => {
  const h = harness();
  assert.equal(await h.run(), true);
  assert.equal(h.row().status, "approved");
  assert.equal(h.row().salary_status, "approved");
  assert.deepEqual(h.row().player_rows, [{ name: "test", screenshot: "image" }]);
  assert.deepEqual(h.revalidated, ["/admin/reviews", "/admin/reward", "/team/reward"]);
});

test("salary can be reviewed independently while monthly data is withdrawn", async () => {
  const h = harness({ row: { status: "draft", salary_status: "submitted" }, form: { review_kind: "salary" } });
  assert.equal(await h.run(), true);
  assert.equal(h.row().status, "draft");
  assert.equal(h.row().salary_status, "approved");
});

test("return notification is sent only after a successful review update", async () => {
  const h = harness({ row: { status: "reviewing" }, form: { action_type: "returned", return_reason: "Please revise" } });
  assert.equal(await h.run(), true);
  assert.equal(h.row().return_reason, "Please revise");
  assert.equal(h.reminders.length, 1);
  assert.equal(h.reminders[0].reviewKind, "monthly");
});

test("review cannot be restarted once already reviewing", async () => {
  const h = harness({ row: { status: "reviewing" }, form: { action_type: "reviewing" } });
  assert.equal(await h.run(), false);
});

test("legacy admin page without a revision must refresh", async () => {
  const h = harness({ form: { expected_updated_at: null } });
  assert.equal(await h.run(), false);
});

test("unauthorized or invalid review actions cannot write", async () => {
  for (const options of [{ admin: false }, { form: { action_type: "draft" } }, { form: { review_kind: "unknown" } }]) {
    const h = harness(options);
    await assert.rejects(h.run());
    assert.equal(h.writes.length, 0);
  }
});

test("failed database update does not send a reminder", async () => {
  const h = harness({ dbError: true, form: { action_type: "returned" } });
  await assert.rejects(h.run(), /save failed/);
  assert.equal(h.reminders.length, 0);
});
