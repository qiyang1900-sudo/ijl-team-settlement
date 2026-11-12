import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as zlib from "node:zlib";

function fixture({ enabled = true, shared = false, mismatch = false, completed = false, now = "2026-11-30T18:00:00Z" } = {}) {
  const exports = {}, calls = [], updates = [];
  const env = Object.fromEntries(["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_PICKER_API_KEY", "GOOGLE_CLOUD_PROJECT_NUMBER", "CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"].map(k => [k, "test"]));
  env.GOOGLE_BACKUP_TOKEN_KEY = crypto.randomBytes(32).toString("base64");
  const snapshot = Object.fromEntries(["teams", "league_players", "monthly_player_assignments", "monthly_data_settings", "monthly_data_submissions", "team_monthly_scores", "team_incentive_reviews", "monthly_incentive_results", "team_incentive_designated_sources", "team_operating_reviews", "team_operating_review_history", "submission_change_history"].map(t => [t, []]));
  Object.assign(snapshot, { format: "ijl-monthly-backup-v2", captured_at: now, tiktok: { rows: [] }, monthly_data_submissions: [{ id: "test", player_rows: [{ xTweetCount: "0" }] }] });
  const run = { status: "running", file_id: "new-file", file_name: "backup.json.gz", snapshot };
  const db = { from: name => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: name === "monthly_drive_backup_config" ? { enabled, refresh_token_encrypted: exports.sealBackupSecret("private-refresh-token") } : completed ? { status: "completed", file_id: "prior-file" } : null }) }) }),
    update: patch => ({ eq: async () => { updates.push({ name, patch }); return {}; } }),
  }), rpc: async (name, args) => { calls.push({ name, args }); return { data: name === "monthly_backup_snapshot" ? snapshot : run }; } };
  let uploaded = false, checksum;
  const request = async (token, url, options = {}) => {
    calls.push({ url, method: options.method || "GET" });
    if (url.includes("capabilities")) return Response.json({ mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: true }, permissions: [{ type: "user", role: "owner" }, ...(shared ? [{ type: "anyone", role: "reader" }] : [])] });
    if (url.includes("generateIds")) return Response.json({ ids: ["new-file"] });
    if (options.method === "POST") return new Response(null, { headers: { location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=test" } });
    if (options.method === "PUT") { uploaded = true; checksum = crypto.createHash("md5").update(options.body).digest("hex"); const { manifest, ...rest } = JSON.parse(zlib.gunzipSync(options.body)); assert.deepEqual(rest, run.snapshot); assert.equal(manifest.table_counts.monthly_data_submissions, 1); return Response.json({}); }
    return uploaded ? Response.json({ id: "new-file", parents: [exports.BACKUP_FOLDER_ID], md5Checksum: mismatch ? "bad" : checksum, appProperties: { ijlBackupKey: calls.find(c => c.name === "claim_monthly_drive_backup").args.p_key } }) : new Response(null, { status: 404 });
  };
  class Clock extends Date { constructor(value) { super(value ?? now); } }
  class OAuth { setCredentials() {} async getAccessToken() { return { token: "private-access-token" }; } }
  const imports = { "node:crypto": crypto, "node:zlib": zlib, "google-auth-library": { OAuth2Client: OAuth }, "./supabase-server": { createSupabaseServerClient: () => db }, "./google-drive-report": { driveRequest: request }, "./tiktok-dataset": { loadTiktokDataset: async () => ({ rows: [], snapshot: null }) } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/lib/monthly-drive-backup.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Buffer, Uint8Array, Date: Clock, Intl, URL, Error, process: { env }, require: name => imports[name] || {} });
  return { api: exports, calls, updates, env, snapshot };
}

test("backup authorization is encrypted with randomized authenticated encryption", () => {
  const { api } = fixture();
  const a = api.sealBackupSecret("secret"), b = api.sealBackupSecret("secret");
  assert.notEqual(a, b); assert.ok(!a.includes("secret")); assert.equal(api.openBackupSecret(a), "secret");
  const parts = a.split("."); parts[2] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => api.openBackupSecret(parts.join(".")));
});
test("schedule uses Japan date, skips completed months and paused setups without uploading", async () => {
  const f = fixture();
  assert.equal(f.api.tokyoBackupDate(new Date("2026-11-30T15:00:00Z")), "2026-12-01");
  const paused = fixture({ enabled: false });
  assert.equal((await paused.api.runMonthlyDriveBackup(true)).skipped, true); assert.equal(paused.calls.length, 0);
  const done = fixture({ completed: true, now: "2026-12-02T00:00:00Z" });
  assert.equal((await done.api.runMonthlyDriveBackup(true)).alreadyCompleted, true); assert.equal(done.calls.length, 0);
});
test("missed month-start jobs catch up under the same month key", async () => {
  const f = fixture({ now: "2026-12-02T00:00:00Z" });
  await f.api.runMonthlyDriveBackup(true);
  assert.equal(f.calls.find(c => c.name === "claim_monthly_drive_backup").args.p_key, "monthly-2026-12");
});
test("manual backup remains available while the automatic schedule is paused", async () => {
  const f = fixture({ enabled: false });
  assert.equal((await f.api.runMonthlyDriveBackup(false)).fileId, "new-file");
  assert.match(f.calls.find(c => c.name === "claim_monthly_drive_backup").args.p_key, /^manual-/);
});
test("local backup needs no Google credentials, preserves zero and carries table counts", async () => {
  const f = fixture();
  for (const key of Object.keys(f.env)) if (/GOOGLE|CRON/.test(key)) delete f.env[key];
  const { bytes, md5 } = await f.api.createMonthlyBackup();
  const saved = JSON.parse(zlib.gunzipSync(bytes));
  assert.equal(saved.monthly_data_submissions[0].player_rows[0].xTweetCount, "0");
  assert.equal(saved.manifest.table_counts.team_operating_reviews, 0);
  assert.equal(saved.manifest.original_images_included, false);
  assert.equal(md5, crypto.createHash("md5").update(bytes).digest("hex"));
  assert.deepEqual(f.calls.map(c => c.name), ["monthly_backup_snapshot"]);
});
test("missing tables or TT data fail rather than creating an incomplete backup", () => {
  const f = fixture();
  for (const table of [...f.api.BACKUP_TABLES, "tiktok"]) {
    const value = { ...f.snapshot }; delete value[table];
    assert.throws(() => f.api.encodeMonthlyBackup(value), /备份范围不完整/);
  }
});
test("backup migration and fresh install agree without modifying business rows", () => {
  const original = fs.readFileSync(new URL("../supabase/monthly-drive-backup.sql", import.meta.url), "utf8");
  const upgrade = fs.readFileSync(new URL("../supabase/monthly-drive-backup-v2.sql", import.meta.url), "utf8");
  const definition = s => s.match(/create or replace function public\.monthly_backup_snapshot\(\)[\s\S]*?end \$\$;/)[0];
  assert.equal(definition(original), definition(upgrade));
  assert.ok(!/\b(insert into|update public|delete from|drop table)\b/i.test(upgrade));
});
test("shared backup destinations fail closed before reading business snapshots or uploading", async () => {
  const f = fixture({ shared: true });
  await assert.rejects(f.api.runMonthlyDriveBackup(true), /仅所有者/);
  assert.ok(!f.calls.some(c => c.name || c.method === "POST"));
});
test("monthly backup freezes a complete snapshot, never overwrites and verifies uploaded bytes", async () => {
  const f = fixture(); const result = await f.api.runMonthlyDriveBackup(true);
  assert.equal(result.fileId, "new-file");
  const claim = f.calls.find(c => c.name === "claim_monthly_drive_backup");
  assert.equal(claim.args.p_key, "monthly-2026-12"); assert.ok(Array.isArray(claim.args.p_tiktok.rows));
  assert.ok(!f.calls.some(c => ["PATCH", "DELETE"].includes(c.method)));
  assert.ok(f.updates.some(c => c.patch.status === "completed"));
});
test("a corrupted upload is reported as failed, never as a completed backup", async () => {
  const f = fixture({ mismatch: true });
  await assert.rejects(f.api.runMonthlyDriveBackup(true), /完整性校验/);
  assert.ok(f.updates.some(c => c.patch.status === "failed"));
  assert.ok(!f.updates.some(c => c.patch.status === "completed"));
});

test("download route requires an admin session and never caches private backup data", async () => {
  for (const [admin, failure, status] of [[false, false, 401], [true, false, 200], [true, true, 503]]) {
    const exports = {};
    let reads = 0;
    const imports = {
      "@/lib/admin-auth": { getAdminSession: async () => admin ? { role: "admin" } : null },
      "@/lib/monthly-drive-backup": {
        tokyoBackupDate: () => "2026-11-12",
        createMonthlyBackup: async () => {
          reads++;
          if (failure) throw new Error("snapshot unavailable");
          return { bytes: Buffer.from("backup"), md5: "test-md5" };
        },
      },
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/app/api/admin/backups/download/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { exports, Response, Uint8Array, Date, Error, require: name => imports[name] });
    const response = await exports.GET();
    assert.equal(response.status, status);
    assert.equal(reads, admin ? 1 : 0);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    if (status === 200) {
      assert.equal(response.headers.get("content-type"), "application/gzip");
      assert.match(response.headers.get("content-disposition"), /^attachment; filename="IJL-monthly-2026-11-12-\d+\.json\.gz"$/);
      assert.equal(await response.text(), "backup");
    } else if (failure) assert.equal((await response.json()).error, "snapshot unavailable");
  }
});
