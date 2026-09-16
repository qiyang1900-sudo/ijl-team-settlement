import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import * as nodeCrypto from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const folderId = "1SjOAE4smTDOyvpXwo2KpguGGU4HZGApP";
const projectTeamId = "project-team";
const workbook = Buffer.from("workbook with existing template");
const checksum = createHash("md5").update(workbook).digest("hex");
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function harness(options = {}) {
  const writes = [], requests = [];
  let record = options.record || null;
  let file = options.file || null;
  let metadata;
  const supabase = { from(table) {
    const query = { table, operation: null, payload: null };
    for (const method of ["select", "eq", "order"]) query[method] = () => query;
    for (const method of ["insert", "update"]) query[method] = (payload) => { query.operation = method; query.payload = payload; return query; };
    function execute(single) {
      if (query.operation) {
        writes.push({ table, operation: query.operation, ...query.payload });
        if (table === "project_report_drive_exports") {
          if (query.operation === "insert") {
            if (options.insertRace) {
              record = { file_id: "concurrent-file", folder_id: folderId, uploaded_at: null };
              return { data: null, error: { code: "23505" } };
            }
            if (record) return { data: null, error: { code: "23505" } };
            record = { ...query.payload, uploaded_at: null };
          } else if (options.recordWriteError) return { data: null, error: { message: "unavailable" } };
          else record = { ...record, ...query.payload };
          return { data: record, error: null };
        }
        return { data: null, error: null };
      }
      if (table === "project_teams") return { data: { id: projectTeamId, status: options.status || "approved", projects: { title: "Project" }, teams: { short_name: options.team || "AWG" } }, error: null };
      if (table === "project_report_drive_exports") return { data: record, error: options.recordReadError ? { message: "missing table" } : null };
      return { data: options.tables?.[table] ?? (single ? null : []), error: options.dataReadError ? { message: "failed" } : null };
    }
    query.single = query.maybeSingle = async () => execute(true);
    query.then = (resolve, reject) => Promise.resolve(execute(false)).then(resolve, reject);
    return query;
  } };
  const json = (value, status = 200, headers) => Response.json(value, { status, headers });
  const fetchMock = async (url, init = {}) => {
    requests.push({ url, ...init });
    if (options.fetch) return options.fetch(url, init);
    if (options.networkError) throw new Error("network");
    if (String(url).includes("/files/" + folderId)) {
      if (options.folderStatus) return json({ error: { errors: [{ reason: options.folderReason }] } }, options.folderStatus);
      return json({ id: folderId, mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: !options.readOnly } });
    }
    if (String(url).includes("generateIds")) return json({ ids: ["generated-file"] });
    if (String(url).includes("uploadType=resumable")) {
      metadata = JSON.parse(init.body);
      return new Response(null, { status: 200, headers: { location: options.uploadLocation || "https://www.googleapis.com/upload/drive/v3/files?upload_id=test" } });
    }
    if (init.method === "PUT") {
      if (options.uploadStatus) return json({ error: { errors: [{ reason: options.uploadReason }] } }, options.uploadStatus);
      file = {
        id: record.file_id, name: metadata.name, parents: [folderId], mimeType: MIME,
        appProperties: { ijlProjectTeamId: projectTeamId },
        md5Checksum: options.badChecksum ? "wrong" : createHash("md5").update(Buffer.from(init.body)).digest("hex"),
        webViewLink: "https://drive.google.com/file/d/" + record.file_id + "/view",
      };
      return json(file);
    }
    return file ? json(file) : json({}, 404);
  };
  const mocks = {
    "node:crypto": nodeCrypto,
    "@/lib/admin-auth": { getAdminSession: async () => options.loggedOut ? null : { role: "admin" } },
    "@/lib/supabase-server": { createSupabaseServerClient: () => supabase },
    "@/lib/settlement-report-template": { SETTLEMENT_REPORT_TEMPLATE_BASE64: "" },
    "@/lib/xlsx-template": {
      fillXlsxTemplate: () => workbook,
      extendWorksheetToMaxColumn: (value) => value,
      trimWorksheetToMaxColumn: (value) => value,
    },
  };
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, {
      exports, Buffer, Uint8Array, URL, Response, Request, Date, AbortSignal,
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: "test", SUPABASE_SERVICE_ROLE_KEY: "test" } },
      fetch: fetchMock,
      require(name) {
        if (name in mocks) return mocks[name];
        return load((name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(filename), name)) + ".ts");
      },
    });
    return exports;
  }
  const post = (headers = {}) => load("src/app/api/admin/project-teams/[projectTeamId]/export-drive/route.ts").POST(
    new Request("https://website.test/api/admin/project-teams/project-team/export-drive", {
      method: "POST", headers: { origin: "https://website.test", authorization: "Bearer test-token", ...headers },
    }), { params: Promise.resolve({ projectTeamId }) }
  );
  return { load, post, requests, writes, supabase };
}

test("all eight teams map to the supplied folders and unknown teams fail closed", () => {
  const h = harness();
  const api = h.load("src/lib/google-drive-report.ts");
  const expected = {
    AWG: folderId, AXIZ: "1jK37oew87tc1jMDVQuS-W5yEsR0u6q51", DFM: "15tYxy2Wy1WnSUNawxifmx5-qBwNdAYfx",
    FL: "1IZWJeP_8pyEXxLiGPJ00T-6rjZ-Fr9J0", QTD: "1E8pYrnUX6ykLjJiE1E5plhlRvSPrMgtR",
    RC: "1jwo4xLqSxeOodKwg9MEevCvHV8SVjxDK", SZ: "1NHnv5GU_VseGDdH-B3V7brokVjc4Pkvq", ZETA: "1rTZ25xTyZdSikYb6REkucNq1wi5Oy952",
  };
  for (const [team, id] of Object.entries(expected)) assert.equal(api.getReportDriveFolder(team).id, id);
  assert.throws(() => api.getReportDriveFolder("UNKNOWN"), { code: "folder_not_configured" });
});

test("requires administrator, same-origin POST and an access token", async () => {
  for (const [options, headers, status] of [
    [{ loggedOut: true }, {}, 401], [{}, { origin: "https://untrusted.test" }, 403],
    [{}, { authorization: "" }, 401],
  ]) {
    const h = harness(options);
    assert.equal((await h.post(headers)).status, status);
    assert.equal(h.requests.length, 0);
    assert.equal(h.writes.length, 0);
  }
});

test("unapproved submissions and unknown teams never upload", async () => {
  for (const options of [{ status: "returned" }, { status: "submitted" }, { team: "UNKNOWN" }]) {
    const h = harness(options);
    assert.equal((await h.post()).status, 409);
    assert.equal(h.requests.length, 0);
    assert.equal(h.writes.length, 0);
  }
});

test("ungranted folder requests Picker authorization; read-only folder is rejected", async () => {
  for (const [options, code] of [
    [{ folderStatus: 404 }, "folder_authorization_required"],
    [{ folderStatus: 403, folderReason: "appNotAuthorizedToFile" }, "folder_authorization_required"],
    [{ readOnly: true }, "folder_read_only"],
  ]) {
    const h = harness(options);
    assert.equal((await (await h.post()).json()).code, code);
    assert.equal(h.writes.length, 0);
  }
});

test("data or export-record read failures never result in a partial upload", async () => {
  for (const options of [{ dataReadError: true }, { recordReadError: true }]) {
    const h = harness(options);
    assert.ok((await h.post()).status >= 500);
    assert.equal(h.requests.some((request) => request.method === "POST"), false);
    assert.equal(h.writes.length, 0);
  }
});

test("local and Drive exports share bytes; Drive upload changes no approval or invoice records", async () => {
  const h = harness();
  const response = await h.post();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.fileId, "generated-file");
  const put = h.requests.find((request) => request.method === "PUT");
  const local = await h.load("src/app/api/admin/project-teams/[projectTeamId]/export/route.ts").GET(
    new Request("https://website.test/export"), { params: Promise.resolve({ projectTeamId }) });
  assert.deepEqual(Buffer.from(put.body), Buffer.from(await local.arrayBuffer()));
  assert.equal(h.writes.some((write) => Object.hasOwn(write, "status")), false);
  assert.equal(h.writes.some((write) => write.table === "submission_files"), false);
  assert.ok(h.writes.some((write) => write.table === "project_report_drive_exports" && write.uploaded_at));
});

test("repeated export reuses its file ID and unchanged content does not upload again", async () => {
  const h = harness();
  const first = await (await h.post()).json();
  const second = await (await h.post()).json();
  assert.equal(first.fileId, second.fileId);
  assert.equal(second.unchanged, true);
  assert.equal(h.requests.filter((request) => request.method === "PUT").length, 1);
  assert.equal(h.requests.filter((request) => request.url.includes("generateIds")).length, 1);
});

test("concurrent reservation uses the winning file ID instead of creating a second file", async () => {
  const h = harness({ insertRace: true });
  const result = await (await h.post()).json();
  assert.equal(result.fileId, "concurrent-file");
  const metadata = JSON.parse(h.requests.find((request) => request.url.includes("uploadType=resumable")).body);
  assert.equal(metadata.id, "concurrent-file");
});

test("previous report is updated in place; unrelated, moved, deleted files are not overwritten", async () => {
  const record = { file_id: "previous-file", folder_id: folderId, uploaded_at: "2026-09-01" };
  const file = { id: record.file_id, name: "older.xlsx", parents: [folderId], mimeType: MIME, appProperties: { ijlProjectTeamId: projectTeamId }, md5Checksum: checksum };
  const h = harness({ record, file });
  assert.equal((await h.post()).status, 200);
  assert.equal(h.requests.find((request) => request.url.includes("uploadType=resumable")).method, "PATCH");
  for (const oldFile of [null, { ...file, parents: ["other-folder"] }, { ...file, trashed: true }, { ...file, appProperties: {} }]) {
    const invalid = harness({ record, file: oldFile });
    assert.equal((await invalid.post()).status, 409);
    assert.equal(invalid.requests.some((request) => request.method === "PUT"), false);
    assert.equal(invalid.writes.length, 0);
  }
});

test("network, expired authorization and storage limits return specific safe errors", async () => {
  for (const [options, expected] of [
    [{ networkError: true }, "network_error"],
    [{ folderStatus: 401 }, "google_auth_expired"],
    [{ uploadStatus: 403, uploadReason: "storageQuotaExceeded" }, "storage_full"],
  ]) {
    const h = harness(options);
    const result = await (await h.post()).json();
    assert.equal(result.code, expected);
    assert.equal(JSON.stringify(result).includes("test-token"), false);
    assert.equal(h.writes.some((write) => write.uploaded_at), false);
  }
});

test("untrusted upload redirect and checksum mismatch cannot be reported as success", async () => {
  for (const [options, expected] of [
    [{ uploadLocation: "https://untrusted.test/upload" }, "invalid_upload_session"],
    [{ badChecksum: true }, "checksum_mismatch"],
  ]) {
    const h = harness(options);
    assert.equal((await (await h.post()).json()).code, expected);
    assert.equal(h.requests.some((request) => request.url.includes("untrusted.test")), false);
    assert.equal(h.writes.some((write) => write.uploaded_at), false);
  }
});

test("an uploaded file remains visible when only the export receipt fails to save", async () => {
  const h = harness({ recordWriteError: true });
  const response = await h.post();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.fileUrl);
  assert.match(data.warning, /已上传/);
});

test("new export-record table has RLS and no browser-role grants", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/project-report-drive-exports.sql"), "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all .* from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete .* to service_role/);
});
