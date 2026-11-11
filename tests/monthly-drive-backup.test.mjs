import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as zlib from "node:zlib";

function fixture({ enabled = true, shared = false, mismatch = false, now = "2026-11-30T18:00:00Z" } = {}) {
  const exports = {}, calls = [], updates = [];
  const env = Object.fromEntries(["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_PICKER_API_KEY", "GOOGLE_CLOUD_PROJECT_NUMBER", "CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"].map(k => [k, "test"]));
  env.GOOGLE_BACKUP_TOKEN_KEY = crypto.randomBytes(32).toString("base64");
  const run = { status: "running", file_id: "new-file", file_name: "backup.json.gz", snapshot: { monthly_data_submissions: [{ id: "test", player_rows: [{ xTweetCount: "0" }] }] } };
  const db = { from: name => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: name === "monthly_drive_backup_config" ? { enabled, refresh_token_encrypted: exports.sealBackupSecret("private-refresh-token") } : null }) }) }),
    update: patch => ({ eq: async () => { updates.push({ name, patch }); return {}; } }),
  }), rpc: async (name, args) => { calls.push({ name, args }); return { data: run }; } };
  let uploaded = false, checksum;
  const request = async (token, url, options = {}) => {
    calls.push({ url, method: options.method || "GET" });
    if (url.includes("capabilities")) return Response.json({ mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: true }, permissions: [{ type: "user", role: "owner" }, ...(shared ? [{ type: "anyone", role: "reader" }] : [])] });
    if (url.includes("generateIds")) return Response.json({ ids: ["new-file"] });
    if (options.method === "POST") return new Response(null, { headers: { location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=test" } });
    if (options.method === "PUT") { uploaded = true; checksum = crypto.createHash("md5").update(options.body).digest("hex"); assert.deepEqual(JSON.parse(zlib.gunzipSync(options.body)), run.snapshot); return Response.json({}); }
    return uploaded ? Response.json({ id: "new-file", parents: [exports.BACKUP_FOLDER_ID], md5Checksum: mismatch ? "bad" : checksum, appProperties: { ijlBackupKey: calls.find(c => c.name === "claim_monthly_drive_backup").args.p_key } }) : new Response(null, { status: 404 });
  };
  class Clock extends Date { constructor(value) { super(value ?? now); } }
  class OAuth { setCredentials() {} async getAccessToken() { return { token: "private-access-token" }; } }
  const imports = { "node:crypto": crypto, "node:zlib": zlib, "google-auth-library": { OAuth2Client: OAuth }, "./supabase-server": { createSupabaseServerClient: () => db }, "./google-drive-report": { driveRequest: request }, "./tiktok-dataset": { loadTiktokDataset: async () => ({ rows: [], snapshot: null }) } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/lib/monthly-drive-backup.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Buffer, Uint8Array, Date: Clock, Intl, URL, Error, process: { env }, require: name => imports[name] || {} });
  return { api: exports, calls, updates };
}

test("backup authorization is encrypted with randomized authenticated encryption", () => {
  const { api } = fixture();
  const a = api.sealBackupSecret("secret"), b = api.sealBackupSecret("secret");
  assert.notEqual(a, b); assert.ok(!a.includes("secret")); assert.equal(api.openBackupSecret(a), "secret");
  const parts = a.split("."); parts[2] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => api.openBackupSecret(parts.join(".")));
});
test("schedule uses Japan date, skips other days and paused setups without uploading", async () => {
  const f = fixture();
  assert.equal(f.api.tokyoBackupDate(new Date("2026-11-30T15:00:00Z")), "2026-12-01");
  for (const options of [{ now: "2026-12-02T00:00:00Z" }, { enabled: false }]) {
    const x = fixture(options); assert.equal((await x.api.runMonthlyDriveBackup(true)).skipped, true); assert.equal(x.calls.length, 0);
  }
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
