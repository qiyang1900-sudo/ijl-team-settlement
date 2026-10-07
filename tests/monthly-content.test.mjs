import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

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
const plain = (value) => JSON.parse(JSON.stringify(value));
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

function actionHarness(existing, { conflict = false } = {}) {
  let payload;
  let writes = 0;
  const client = {
    from() {
      let writing = false;
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        is() {
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
            return { data: conflict ? null : { id: "saved" }, error: null };
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
            return { error: null };
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
    },
    "\nexport { saveMonthlyData };\n",
  );
  const form = (action = "draft", content = [work()]) => {
    const data = new FormData();
    data.set("team_id", "team-1");
    data.set("target_month", "2026-06");
    data.set("action_type", action);
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
  };
}
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
test("salary draft never overwrites monthly content or official account metrics", async () => {
  const official = {
    ...monthly.createOfficialMonthlyRow("AWG"),
    xTweetCount: "456",
  };
  const player = {
    ...monthly.emptyMonthlyPlayerRow(0),
    playerId: "player-1",
    playerName: "Player",
    xTweetCount: "789",
    youtubeVideoViews: "5678",
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
