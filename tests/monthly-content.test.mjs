import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
function compile(file, imports = {}, extra = "") {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8") + extra, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      Error,
      URL,
      Date,
      Intl,
      File,
      FormData,
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-only",
        },
      },
      require: (name) => imports[name] || {},
    },
  );
  return exports;
}
const api = compile("src/lib/monthly-content.ts");
const monthly = compile("src/lib/monthly-data.ts");
const activities = compile("src/lib/club-activities.ts");
const revisions = compile("src/lib/monthly-draft-revision.ts", {
  "node:crypto": crypto,
  "./monthly-data": monthly,
});
const plain = (value) => JSON.parse(JSON.stringify(value));

test("monthly roster names use the month-specific team after a player transfer", () => {
  const display = compile("src/lib/player-display.ts");
  const { createPlayerRowFromRecord, mergePlayerRows } = compile(
    "src/app/team/reward/page.tsx",
    { "@/lib/monthly-data": monthly, "@/lib/player-display": display },
    "\nexport { createPlayerRowFromRecord, mergePlayerRows };\n",
  );
  const transferred = {
    id: "fuku-id", handle: "fuku", reading: "Fuku", position_label: "Player",
    roster_role: "Survivor", current_team_short_name: "FL", teams: { id: "fl-id", short_name: "FL" },
  };
  const historical = { ...monthly.emptyMonthlyPlayerRow(), playerId: "fuku-id", playerName: "RC_fuku", xTweetCount: "0", youtubeVideoViews: "1234", salaryScreenshotUrl: "https://example.test/saved" };
  const rcRow = createPlayerRowFromRecord(transferred, 0, { id: "rc-id", short_name: "RC" });
  const restored = mergePlayerRows([rcRow], [historical])[0];
  assert.equal(restored.playerName, "RC_fuku");
  assert.equal(restored.playerId, historical.playerId);
  assert.equal(restored.xTweetCount, "0");
  assert.equal(restored.youtubeVideoViews, "1234");
  assert.equal(restored.salaryScreenshotUrl, historical.salaryScreenshotUrl);
  assert.equal(createPlayerRowFromRecord(transferred, 0, { id: "fl-id", short_name: "FL" }).playerName, "FL_fuku");
  assert.equal(createPlayerRowFromRecord(transferred, 0, null).playerName, "FL_fuku");
});

const work = (changes = {}) => ({
  ...api.emptyContentEntry("work-1", "designated"),
  title: "Test video",
  url: "https://youtu.be/example",
  accountId: "official",
  accountName: "AWG公式",
  publishedOn: "2026-06-19",
  durationSeconds: "300",
  ...changes,
});

test("explicit YouTube Shorts URLs normalize historical classification without changing source entries", () => {
  for (const host of ["youtube.com", "www.youtube.com", "m.youtube.com"]) {
    const original = work({ platform: "youtube", url: `https://${host}/shorts/abc123?si=share` });
    const before = plain(original);
    const parsed = api.parseMonthlyContent([original])[0];
    assert.equal(parsed.platform, "youtube_short");
    assert.deepEqual(plain(parsed), { ...before, platform: "youtube_short" });
    assert.deepEqual(plain(original), before);
    assert.equal(api.parseMonthlyContent(JSON.stringify([parsed]))[0].platform, "youtube_short");
  }
  for (const url of ["https://youtu.be/abc123", "https://youtube.com/watch?v=abc123"]) {
    for (const platform of ["youtube", "youtube_short"])
      assert.equal(api.parseMonthlyContent([work({ platform, url })])[0].platform, platform);
  }
  for (const url of ["https://youtube.com.evil.test/shorts/abc123", "https://youtube.com/watch?v=abc123&next=/shorts/abc123", "invalid", "ftp://youtube.com/shorts/abc123"])
    assert.equal(api.parseMonthlyContent([work({ url })])[0].platform, "youtube");
  assert.equal(api.parseMonthlyContent([work({ platform: "x", url: "https://youtube.com/shorts/abc123" })])[0].platform, "x");
});

test("Shorts monthly reposts are required from October only and zero is valid", () => {
  const rows = [monthly.createOfficialMonthlyRow("AWG"), { ...monthly.emptyMonthlyPlayerRow(), playerName: "Coach", playerRole: "コーチ" }];
  assert.equal(monthly.validateMonthlyShortReposts(rows, "2026-09").length, 0);
  assert.equal(monthly.validateMonthlyShortReposts(rows, "2025-10").length, 0);
  assert.equal(monthly.validateMonthlyShortReposts(rows, "2026-10").length, 2);
  assert.match(monthly.validateMonthlyShortReposts(rows, "2027-01")[1], /Coach/);
  for (const value of ["0", 0, "123", "１，２３４"])
    assert.equal(monthly.validateMonthlyShortReposts(rows.map((row) => ({ ...row, youtubeShortRepostCount: value })), "2026-10").length, 0);
  for (const value of [undefined, null, "", " ", "#N/A", "1.5", "-1", "3e2", "2次", "9007199254740992"])
    assert.equal(monthly.validateMonthlyShortReposts([{ ...rows[0], youtubeShortRepostCount: value }], "2026-10").length, 1);
  assert.equal(monthly.sumMonthlyShortReposts(rows), null);
  assert.equal(monthly.sumMonthlyShortReposts(rows.map((row) => ({ ...row, youtubeShortRepostCount: "0" }))), 0);
});

test("historical monthly rows do not acquire a fabricated repost value", () => {
  const historical = monthly.createOfficialMonthlyRow("AWG");
  const parsed = monthly.parseMonthlyPlayerRows([historical]);
  assert.equal(Object.hasOwn(parsed[0], "youtubeShortRepostCount"), false);
  assert.equal(Object.hasOwn(monthly.splitMonthlyRows(parsed).officialRow, "youtubeShortRepostCount"), false);
  const zero = monthly.splitMonthlyRows([{ ...historical, youtubeShortRepostCount: "0" }]).officialRow;
  assert.equal(zero.youtubeShortRepostCount, "0");
});

test("only monthly submission with an empty second page asks for confirmation", () => {
  for (const action of [
    "draft",
    "salary_screenshots_draft",
    "salary_screenshots_submit",
  ])
    assert.equal(api.shouldConfirmEmptyContent(action, []), false);
  assert.equal(api.shouldConfirmEmptyContent("submit", []), true);
  assert.equal(
    api.shouldConfirmEmptyContent("submit", [
      api.emptyContentEntry("empty", "popular"),
    ]),
    true,
  );
  assert.equal(
    api.shouldConfirmEmptyContent("submit", [work({ title: "", views: "0" })]),
    false,
  );
});
test("server enforces explicit skip confirmation, but allows drafts and salary actions", () => {
  assert.throws(
    () => api.contentSubmissionPatch("submit", [], false),
    /2ページ目/,
  );
  assert.deepEqual(plain(api.contentSubmissionPatch("submit", [], true)), {
    content_entries: [],
    content_skipped: true,
  });
  assert.deepEqual(plain(api.contentSubmissionPatch("draft", [], false)), {
    content_entries: [],
    content_skipped: false,
  });
  assert.deepEqual(
    plain(
      api.contentSubmissionPatch("salary_screenshots_submit", [work()], false),
    ),
    {},
  );
  assert.equal(
    api.contentSubmissionPatch("submit", [work()], false).content_skipped,
    false,
  );
});
test("partial rows cannot count as completed submissions and drafts retain partial values", () => {
  const entry = api.emptyContentEntry("partial", "designated");
  entry.title = "Draft";
  assert.equal(
    api.contentSubmissionPatch("draft", [entry], false).content_entries[0]
      .title,
    "Draft",
  );
  assert.ok(
    api.validateMonthlyContent([entry], "2026-06", ["official"]).length >= 4,
  );
  assert.deepEqual(
    plain(api.validateMonthlyContent([work()], "2026-06", ["official"])),
    [],
  );
});
test("validation rejects duplicate works, wrong platform, invalid dates and unknown accounts", () => {
  assert.equal(
    api.contentWorkKey("https://youtube.com/watch?v=example&si=1"),
    api.contentWorkKey("https://youtu.be/example?si=2"),
  );
  assert.ok(
    api
      .validateMonthlyContent(
        [
          work(),
          work({ id: "work-2", url: "https://youtube.com/shorts/example" }),
        ],
        "2026-06",
        ["official"],
      )
      .some((e) => e.includes("重複")),
  );
  for (const change of [
    { publishedOn: "2026-06-31" },
    { publishedOn: "2026-07-01" },
    { accountId: "other-team" },
    { url: "javascript:alert(1)" },
    { platform: "x" },
    { durationSeconds: "-1" },
  ])
    assert.ok(
      api.validateMonthlyContent([work(change)], "2026-06", ["official"])
        .length,
    );
});
function interleavedWorks() {
  return ["a", "b", "c", "d", "e"].map((id) => work({
    id,
    title: id,
    url: `https://youtu.be/${id}`,
    section: ["b", "e"].includes(id) ? "popular" : "designated",
    claims: ["b", "e"].includes(id) ? ["hot_video"] : ["designated"],
    views: "40001",
    durationSeconds: id === "d" ? "" : "300",
  }));
}

test("content errors follow each visible section, including after a draft round trip and deletion", () => {
  const entries = interleavedWorks();
  const original = plain(entries);
  for (const rows of [entries, api.parseMonthlyContent(JSON.stringify(api.contentSubmissionPatch("draft", entries, false).content_entries))]) {
    assert.deepEqual(plain(api.getMonthlyContentIssues(rows, "2026-06", ["official"])), [
      { entryId: "d", message: "「指定動画」3件目（d）：動画の長さ（秒）を0以上の整数で入力してください。" },
    ]);
  }
  assert.match(api.validateMonthlyContent(entries.filter((entry) => entry.id !== "a"), "2026-06", ["official"])[0], /「指定動画」2件目（d）/);
  const popularError = entries.map((entry) => entry.id === "e" ? { ...entry, views: "" } : entry);
  assert.match(api.validateMonthlyContent(popularError, "2026-06", ["official"])[1], /「超人気動画・投稿」2件目（e）：再生回数/);
  assert.deepEqual(plain(entries), original);
});

test("empty visible rows do not shift error numbers and duplicate errors identify both sections", () => {
  const entries = [api.emptyContentEntry("blank", "designated"), ...interleavedWorks()];
  assert.match(api.validateMonthlyContent(entries, "2026-06", ["official"])[0], /「指定動画」4件目（d）/);
  const duplicate = interleavedWorks().map((entry) => entry.id === "e" ? { ...entry, url: "https://youtu.be/a" } : entry);
  assert.match(api.validateMonthlyContent(duplicate, "2026-06", ["official"])[1], /「超人気動画・投稿」2件目（e）：「指定動画」1件目（a）と同じ作品/);
  const noTitle = work({ title: "" });
  assert.match(api.validateMonthlyContent([noTitle], "2026-06", ["official"])[0], /「指定動画」1件目：動画・投稿内容/);
});

test("views/likes distinguish missing values from real zero and one work can claim multiple awards", () => {
  const entry = work({
    section: "popular",
    platform: "youtube_short",
    claims: ["hot_short", "bonus_video"],
    views: "0",
    likes: "0",
  });
  assert.equal(
    api.validateMonthlyContent([entry], "2026-06", ["official"]).length,
    0,
  );
  assert.ok(
    api.validateMonthlyContent([{ ...entry, likes: "" }], "2026-06", [
      "official",
    ]).length,
  );
});
test("malformed data and duplicate row ids fail explicitly", () => {
  assert.throws(() => api.parseMonthlyContent("{"));
  assert.throws(() => api.parseMonthlyContent({ entries: [] }));
  assert.throws(() => api.parseMonthlyContent([work(), work()]));
  assert.deepEqual(plain(api.parseMonthlyContent(null)), []);
});
test("ordinary club activities need no extra fields; opted-in claims preserve zero and require evidence", () => {
  const ordinary = {
    ...activities.emptyClubActivityItem(),
    link: "https://example.test/event",
  };
  assert.equal(
    activities.validatePopularActivities([ordinary], "2026-06").length,
    0,
  );
  assert.ok(
    activities.validatePopularActivities(
      [{ ...ordinary, popular: true }],
      "2026-06",
    ).length,
  );
  const popular = {
    ...ordinary,
    popular: true,
    popularKind: "online",
    activityDate: "2026-06-20",
    audienceCount: "0",
  };
  assert.equal(
    activities.validatePopularActivities([popular], "2026-06").length,
    0,
  );
  const restored = activities.parseClubActivityItems({
    link: activities.serializeClubActivityItems([popular]),
  });
  assert.equal(restored[0].audienceCount, "0");
  assert.equal(restored[0].popular, true);
});

function actionHarness(existing, { conflict = false, uploadError = null, writeError = null, savedPatch = {} } = {}) {
  let payload;
  let writes = 0;
  let uploads = 0;
  const writeFilters = [];
  const client = {
    from() {
      let writing = false;
      const chain = {
        select() {
          return chain;
        },
        eq(key, value) {
          if (writing) writeFilters.push([key, value]);
          return chain;
        },
        is(key, value) {
          if (writing) writeFilters.push([key, value]);
          return chain;
        },
        update(value) {
          writing = true;
          payload = value;
          return chain;
        },
        insert(value) {
          writing = true;
          payload = value;
          return chain;
        },
        async maybeSingle() {
          if (writing) {
            writes++;
            return { data: conflict || writeError ? null : { ...existing, ...payload, id: "saved", ...savedPatch }, error: writeError };
          }
          return { data: existing, error: null };
        },
      };
      return chain;
    },
    storage: {
      from() {
        return {
          async upload() {
            uploads++;
            return { error: uploadError };
          },
          getPublicUrl(path) {
            return { data: { publicUrl: `https://example.invalid/${path}` } };
          },
        };
      },
    },
  };
  const server = compile(
    "src/app/team/reward/page.tsx",
    {
      "@/lib/supabase-server": { createSupabaseServerClient: () => client },
      "@/lib/team-auth": { requireTeamAccess: async () => {} },
      "@/lib/monthly-content": api,
      "@/lib/monthly-data": monthly,
      "@/lib/club-activities": activities,
      "@/lib/monthly-draft-revision": revisions,
    },
    "\nexport { saveMonthlyData };\n",
  );
  const form = (action = "draft", content = [work()]) => {
    const data = new FormData();
    data.set("team_id", "team-1");
    data.set("target_month", "2026-06");
    data.set("action_type", action);
    data.set("base_revision", revisions.monthlyDraftRevision(existing, action.startsWith("salary_screenshots")));
    data.set(
      "official_row",
      JSON.stringify([
        { ...monthly.createOfficialMonthlyRow("AWG"), xTweetCount: "123" },
      ]),
    );
    data.set("player_rows", "[]");
    data.set("club_activity_items", "[]");
    data.set("content_entries", JSON.stringify(content));
    return data;
  };
  return {
    save: server.saveMonthlyData,
    form,
    payload: () => payload,
    writes: () => writes,
    uploads: () => uploads,
    writeFilters: () => writeFilters,
  };
}

test("server returns the same grouped error before writing or uploading, while allowing an incomplete draft", async () => {
  const h = actionHarness(null);
  const entries = interleavedWorks();
  const result = await h.save({}, h.form("submit", entries));
  assert.equal(result.status, "error");
  assert.match(result.message, /「指定動画」3件目（d）：動画の長さ/);
  assert.equal(h.writes(), 0);
  assert.equal(h.uploads(), 0);
  const draft = await h.save({}, h.form("draft", entries));
  assert.equal(draft.status, "success");
  assert.deepEqual(plain(h.payload().content_entries), plain(entries));
});

test("withdrawal preserves submitted data, images and salary and guards against a concurrent review", async () => {
  const original = {
    id: "pending-row", status: "submitted", salary_status: "approved", updated_at: "version-1",
    player_rows: [{ ...monthly.createOfficialMonthlyRow("AXIZ"), xTweetCount: "62", youtubeScreenshotUrl: "https://example.test/yt" }],
    content_entries: [work()], club_activity_link: "https://example.test/event", club_activity_image_url: "https://example.test/event.png",
    salary_approved_at: "approved-salary", salary_submitted_at: "submitted-salary",
  };
  const h = actionHarness(original);
  const result = await h.save({}, h.form("withdraw"));
  assert.equal(result.status, "success");
  assert.match(result.message, /保持/);
  assert.equal(result.actionType, "withdraw");
  assert.equal(h.uploads(), 0);
  assert.deepEqual(Object.keys(h.payload()).sort(), ["approved_at", "returned_at", "reviewing_at", "return_reason", "status", "submitted_at", "updated_at"].sort());
  assert.equal(h.payload().status, "draft");
  assert.equal(result.savedOfficialRow.xTweetCount, "62");
  assert.equal(result.savedOfficialRow.youtubeScreenshotUrl, "https://example.test/yt");
  assert.equal(result.savedActivities[0].imageUrl, original.club_activity_image_url);
  assert.equal(result.savedContent[0].title, original.content_entries[0].title);
  assert.equal(result.savedRevision, revisions.monthlyDraftRevision({ ...original, ...h.payload() }));
  assert.equal(result.savedOtherRevision, revisions.monthlyDraftRevision(original, true));
  assert.deepEqual(h.writeFilters(), [["id", "pending-row"], ["team_id", "team-1"], ["target_month", "2026-06"], ["status", "submitted"], ["updated_at", "version-1"]]);
  const racing = actionHarness(original, { conflict: true });
  const refused = await racing.save({}, racing.form("withdraw"));
  assert.equal(refused.status, "error");
  assert.match(refused.message, /取り消せませんでした.*kiyo/);
});

test("reviewing and approved submissions cannot be withdrawn; failures stay on the form", async () => {
  for (const status of ["reviewing", "approved", "returned", "draft"]) {
    const h = actionHarness({ id: "row", status, updated_at: "v1" });
    const result = await h.save({}, h.form("withdraw"));
    assert.equal(result.status, "error");
    assert.equal(h.writes(), 0);
    if (["reviewing", "approved"].includes(status)) assert.match(result.message, /kiyo/);
  }
  for (const existing of [null, { id: "row", status: "submitted" }]) {
    const h = actionHarness(existing);
    const form = h.form("withdraw");
    form.set("base_revision", "outdated");
    assert.equal((await h.save({}, form)).status, "error");
    assert.equal(h.writes(), 0);
  }
  const h = actionHarness({ id: "row", status: "submitted" }, { writeError: { message: "Storage unavailable" } });
  const result = await h.save({}, h.form("withdraw"));
  assert.equal(result.status, "error");
  assert.match(result.message, /Storage unavailable/);
});
test("monthly draft saves both pages and returns the saved content without changing salary status", async () => {
  const h = actionHarness({
    id: "row",
    status: "draft",
    salary_status: "approved",
    updated_at: "version-1",
    player_rows: [],
  });
  const result = await h.save({}, h.form());
  assert.equal(result.status, "success");
  assert.equal(h.payload().salary_status, "approved");
  assert.equal(h.payload().player_rows[0].xTweetCount, "123");
  assert.equal(result.savedContent[0].title, "Test video");
});

test("October submit validates official/player/coach reposts before uploads or writes; drafts and salary stay independent", async () => {
  const official = { ...monthly.createOfficialMonthlyRow("AWG"), xScreenshotUrl: "https://example.test/x", youtubeScreenshotUrl: "https://example.test/yt" };
  const player = { ...monthly.emptyMonthlyPlayerRow(), playerName: "Coach", playerRole: "コーチ", xScreenshotUrl: "https://example.test/x2", youtubeScreenshotUrl: "https://example.test/yt2" };
  for (const action of ["submit", "draft", "salary_screenshots_draft", "salary_screenshots_submit"]) {
    const h = actionHarness(null);
    const form = h.form(action, []);
    form.set("target_month", "2026-10");
    form.set("content_page_acknowledged", "yes");
    form.set("official_row", JSON.stringify([official]));
    form.set("player_rows", JSON.stringify([player]));
    const result = await h.save({}, form);
    assert.equal(result.status, action === "submit" ? "error" : "success");
    if (action === "submit") {
      assert.match(result.message, /AWG公式.*YT Shorts/);
      assert.match(result.message, /Coach.*YT Shorts/);
      assert.equal(h.writes(), 0);
      assert.equal(h.uploads(), 0);
    }
  }
  for (const month of ["2026-09", "2026-10"]) {
    const h = actionHarness({ id: "existing", status: "draft", player_rows: [official, player] });
    const form = h.form("submit", []);
    form.set("target_month", month);
    form.set("content_page_acknowledged", "yes");
    const value = month === "2026-10" ? { youtubeShortRepostCount: "0" } : {};
    form.set("official_row", JSON.stringify([{ ...official, ...value }]));
    form.set("player_rows", JSON.stringify([{ ...player, ...value }]));
    const result = await h.save({}, form);
    assert.equal(result.status, "success", result.message);
    assert.equal(result.savedOfficialRow.youtubeShortRepostCount, value.youtubeShortRepostCount);
    assert.equal(result.savedPlayers[0].youtubeShortRepostCount, value.youtubeShortRepostCount);
  }
});
test("salary draft never overwrites monthly content or official account metrics", async () => {
  const official = {
    ...monthly.createOfficialMonthlyRow("AWG"),
    xTweetCount: "456",
    youtubeShortRepostCount: "0",
  };
  const player = {
    ...monthly.emptyMonthlyPlayerRow(0),
    playerId: "player-1",
    playerName: "Player",
    xTweetCount: "789",
    youtubeVideoViews: "5678",
    youtubeShortRepostCount: "123",
  };
  const h = actionHarness({
    id: "row",
    status: "approved",
    salary_status: "draft",
    content_entries: [work()],
    player_rows: [official, player],
  });
  const form = h.form("salary_screenshots_draft", []);
  form.set(
    "player_rows",
    JSON.stringify([
      {
        ...player,
        xTweetCount: "0",
        youtubeVideoViews: "0",
        salaryAmount: "50000",
      },
    ]),
  );
  form.set(
    "club_activity_items",
    JSON.stringify([
      {
        ...activities.emptyClubActivityItem(),
        link: "https://unsaved.invalid/event",
      },
    ]),
  );
  const result = await h.save({}, form);
  assert.equal(result.status, "success");
  assert.equal(h.payload().status, "approved");
  assert.equal(h.payload().player_rows[0].xTweetCount, "456");
  assert.equal(Object.hasOwn(h.payload(), "content_entries"), false);
  assert.equal(h.payload().player_rows[1].xTweetCount, "789");
  assert.equal(h.payload().player_rows[1].youtubeVideoViews, "5678");
  assert.equal(h.payload().player_rows[0].youtubeShortRepostCount, "0");
  assert.equal(h.payload().player_rows[1].youtubeShortRepostCount, "123");
  assert.equal(h.payload().player_rows[1].salaryAmount, "50000");
  assert.equal(h.payload().club_activity_link, null);
});
test("unconfirmed empty submissions do not write, confirmed ones save both status and skip record", async () => {
  const h = actionHarness(null);
  const form = h.form("submit", []);
  const first = await h.save({}, form);
  assert.equal(first.status, "error");
  assert.match(first.message, /2ページ目/);
  assert.equal(h.writes(), 0);
  form.set("content_page_acknowledged", "yes");
  const second = await h.save({}, form);
  assert.equal(second.status, "success");
  assert.equal(h.payload().content_skipped, true);
  assert.equal(h.payload().status, "submitted");
});
test("already-reviewed scope and concurrent changes are rejected with actionable errors", async () => {
  const locked = actionHarness({
    id: "row",
    status: "approved",
    salary_status: "draft",
  });
  const first = await locked.save({}, locked.form());
  assert.equal(first.status, "error");
  assert.equal(locked.writes(), 0);
  const concurrent = actionHarness(
    { id: "row", status: "draft", player_rows: [], updated_at: "old" },
    { conflict: true },
  );
  const second = await concurrent.save({}, concurrent.form());
  assert.equal(second.status, "error");
  assert.match(second.message, /他の画面/);
});
test("draft images are uploaded and subsequent saves retain server-owned attachment metadata", async () => {
  const h = actionHarness(null);
  const form = h.form();
  form.set(
    "content_image_work-1",
    new File(["test-image"], "proof.png", { type: "image/png" }),
  );
  const first = await h.save({}, form);
  assert.equal(first.status, "success");
  assert.match(first.savedContent[0].imageUrl, /example.invalid/);
  const saved = h.payload();
  const next = actionHarness({ ...saved, id: "row" });
  const second = await next.save(
    {},
    next.form("draft", [
      { ...work(), imageUrl: "https://untrusted.invalid/spoof" },
    ]),
  );
  assert.equal(second.status, "success");
  assert.equal(second.savedContent[0].imageUrl, first.savedContent[0].imageUrl);
});

test("club activity links and images survive repeated drafts and a reload, including replacements", async () => {
  const activity = { ...activities.emptyClubActivityItem(), link: "https://example.test/event" };
  const h = actionHarness(null);
  const form = h.form();
  form.set("club_activity_items", JSON.stringify([activity]));
  form.set(`club_activity_image_${activity.id}`, new File(["image"], "first.png", { type: "image/png" }));
  const first = await h.save({}, form);
  assert.equal(first.status, "success");
  assert.equal(first.savedActivities[0].link, activity.link);
  assert.match(first.savedActivities[0].imageUrl, /first.png$/);
  assert.equal(h.uploads(), 1);

  const next = actionHarness({ ...h.payload(), id: "saved" });
  const nextForm = next.form();
  nextForm.set("club_activity_items", JSON.stringify([{ ...activity, link: "https://example.test/updated", imageUrl: "https://untrusted.invalid/spoof", imageName: "not-uploaded.png" }]));
  const second = await next.save({}, nextForm);
  assert.equal(second.status, "success");
  assert.equal(second.savedActivities[0].link, "https://example.test/updated");
  assert.equal(second.savedActivities[0].imageUrl, first.savedActivities[0].imageUrl);
  assert.equal(second.savedActivities[0].imageName, "first.png");
  assert.equal(next.uploads(), 0);
  assert.equal(activities.parseClubActivityItems({ link: next.payload().club_activity_link })[0].imageUrl, first.savedActivities[0].imageUrl);

  const replacement = actionHarness({ ...next.payload(), id: "saved" });
  const replacementForm = replacement.form();
  replacementForm.set("club_activity_items", JSON.stringify(second.savedActivities));
  replacementForm.set(`club_activity_image_${activity.id}`, new File(["image2"], "second.png", { type: "image/png" }));
  const third = await replacement.save({}, replacementForm);
  assert.equal(third.status, "success");
  assert.match(third.savedActivities[0].imageUrl, /second.png$/);
  assert.equal(third.savedActivities[0].link, "https://example.test/updated");
});

test("stale or legacy forms cannot clear activity images, links or numeric data", async () => {
  const old = { status: "returned", player_rows: [] };
  const current = { ...old, id: "row", club_activity_link: JSON.stringify([{ ...activities.emptyClubActivityItem(), link: "https://example.test/new", imageUrl: "https://example.test/proof" }]) };
  const h = actionHarness(current);
  for (const version of [revisions.monthlyDraftRevision(old), ""]) {
    const form = h.form();
    form.set("base_revision", version);
    form.set("club_activity_items", JSON.stringify([activities.emptyClubActivityItem()]));
    form.set("club_activity_image_activity-1", new File(["test"], "proof.png", { type: "image/png" }));
    const result = await h.save({}, form);
    assert.equal(result.status, "error");
    assert.equal(h.writes(), 0);
    assert.equal(h.uploads(), 0);
  }
});

test("club images follow stable activity IDs after reorder and explicit row deletion", async () => {
  const a = { ...activities.emptyClubActivityItem(), link: "https://example.test/a", imageUrl: "https://example.test/a.png", imageName: "a.png" };
  const b = { ...activities.emptyClubActivityItem(1), link: "https://example.test/b", imageUrl: "https://example.test/b.png", imageName: "b.png" };
  const h = actionHarness({ id: "row", club_activity_link: JSON.stringify([a, b]) });
  const form = h.form();
  form.set("club_activity_items", JSON.stringify([{ ...b, imageUrl: "" }, { ...a, imageUrl: "" }]));
  const result = await h.save({}, form);
  assert.equal(result.status, "success");
  assert.deepEqual(plain(result.savedActivities.map((item) => item.imageUrl)), [b.imageUrl, a.imageUrl]);
  const next = actionHarness({ ...h.payload(), id: "row" });
  const removed = next.form();
  removed.set("club_activity_items", "[]");
  assert.equal((await next.save({}, removed)).status, "success");
  assert.equal(next.payload().club_activity_link, null);
  assert.equal(next.payload().club_activity_image_url, null);
});

test("upload, write and verification failures are errors, never successful drafts", async () => {
  const h = actionHarness(null, { uploadError: { message: "Storage unavailable" } });
  const form = h.form();
  form.set("club_activity_items", JSON.stringify([activities.emptyClubActivityItem()]));
  form.set("club_activity_image_activity-1", new File(["test"], "proof.png", { type: "image/png" }));
  const upload = await h.save({}, form);
  assert.equal(upload.status, "error");
  assert.match(upload.message, /Storage unavailable/);
  assert.equal(h.writes(), 0);
  for (const options of [{ writeError: { message: "Database unavailable" } }, { savedPatch: { club_activity_link: "https://unexpected.test" } }]) {
    const failure = actionHarness(null, options);
    const result = await failure.save({}, failure.form());
    assert.equal(result.status, "error");
    assert.equal(result.savedActivities, undefined);
  }
});

test("monthly and salary revisions are independent of unrelated saves and updated_at", () => {
  const original = { status: "draft", salary_status: "draft", player_rows: [{ ...monthly.emptyMonthlyPlayerRow(0), playerId: "p1", salaryAmount: "100", xTweetCount: "20" }] };
  const salaryChange = { ...original, salary_status: "approved", updated_at: "new", player_rows: [{ ...original.player_rows[0], salaryAmount: "200" }] };
  assert.equal(revisions.monthlyDraftRevision(original), revisions.monthlyDraftRevision(salaryChange));
  const monthlyChange = { ...original, status: "approved", club_activity_link: "https://example.test", player_rows: [{ ...original.player_rows[0], xTweetCount: "30" }] };
  assert.equal(revisions.monthlyDraftRevision(original, true), revisions.monthlyDraftRevision(monthlyChange, true));
  assert.notEqual(revisions.monthlyDraftRevision(original), revisions.monthlyDraftRevision(monthlyChange));
});

test("returned reasons remain visible after a draft save", async () => {
  const h = actionHarness({ id: "row", status: "returned", return_reason: "Please check the screenshot" });
  const result = await h.save({}, h.form());
  assert.equal(result.status, "success");
  assert.equal(h.payload().return_reason, "Please check the screenshot");
});

test("a popular activity filename or zero-byte file alone is not saved evidence", async () => {
  for (const zeroByte of [false, true]) {
    const h = actionHarness(null);
    const form = h.form("submit");
    form.set("club_activity_items", JSON.stringify([{ ...activities.emptyClubActivityItem(), popular: true, activityDate: "2026-06-20", audienceCount: "4000", imageName: "unuploaded.png" }]));
    if (zeroByte) form.set("club_activity_image_activity-1", new File([], "unuploaded.png", { type: "image/png" }));
    const result = await h.save({}, form);
    assert.equal(result.status, "error");
    assert.match(result.message, /証明画像/);
    assert.equal(h.writes(), 0);
  }
});

test("restored attachment metadata cannot roll back newer X, YouTube or salary images", async () => {
  const savedPlayer = { ...monthly.emptyMonthlyPlayerRow(0), playerId: "p1", playerName: "RenamedPlayer", xScreenshotUrl: "https://example.test/new-x", youtubeScreenshotUrl: "https://example.test/new-yt", salaryScreenshotUrl: "https://example.test/new-salary" };
  const stalePlayer = { ...savedPlayer, playerName: "OldName", xScreenshotUrl: "https://example.test/old-x", youtubeScreenshotUrl: "https://example.test/old-yt", salaryScreenshotUrl: "https://example.test/old-salary" };
  for (const action of ["draft", "salary_screenshots_draft"]) {
    const h = actionHarness({ id: "row", player_rows: [savedPlayer] });
    const form = h.form(action);
    form.set("player_rows", JSON.stringify([stalePlayer]));
    const result = await h.save({}, form);
    assert.equal(result.status, "success");
    assert.equal(result.savedPlayers[0].xScreenshotUrl, savedPlayer.xScreenshotUrl);
    assert.equal(result.savedPlayers[0].youtubeScreenshotUrl, savedPlayer.youtubeScreenshotUrl);
    assert.equal(result.savedPlayers[0].salaryScreenshotUrl, savedPlayer.salaryScreenshotUrl);
    if (action.startsWith("salary")) assert.equal(result.savedPlayers[0].playerName, "RenamedPlayer");
  }
});
