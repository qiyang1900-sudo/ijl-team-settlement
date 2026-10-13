import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
function compile(file, imports = {}, globals = {}, extra = "") {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8") + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Date, File, FormData, require: (name) => imports[name] || {}, ...globals });
  return exports;
}
const activities = compile("src/lib/club-activities.ts");
const monthly = compile("src/lib/monthly-data.ts");
const content = compile("src/lib/monthly-content.ts");
const official = { ...monthly.createOfficialMonthlyRow("SZ"), youtubeVideoViews: "1000000" };
const player = { ...monthly.emptyMonthlyPlayerRow(0), playerName: "Player", playerId: "p1" };
const activity = { ...activities.emptyClubActivityItem(), link: "https://example.test/new-event", imageUrl: "https://example.test/saved.png", imageName: "saved.png" };
const nodes = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];

function harness({ draft, readFails = false, actionResult, pending = false, ...overrides } = {}) {
  let index = 0;
  let dirty = false;
  let tree;
  let action;
  let stored = draft === undefined ? null : JSON.stringify(draft);
  let refreshes = 0;
  const hooks = [];
  const effects = [];
  const timers = new Map();
  let timerId = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in hooks)) hooks[i] = typeof initial === "function" ? initial() : initial;
      return [hooks[i], (value) => { const next = typeof value === "function" ? value(hooks[i]) : value; if (!Object.is(next, hooks[i])) { hooks[i] = next; dirty = true; } }];
    },
    useRef(initial) {
      const i = index++;
      return hooks[i] ||= { current: initial };
    },
    useMemo(factory, deps) {
      const i = index++;
      if (!same(hooks[i]?.deps, deps)) hooks[i] = { deps, value: factory() };
      return hooks[i].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const i = index++;
      if (!same(hooks[i]?.deps, deps)) effects.push(() => { hooks[i]?.cleanup?.(); hooks[i] = { deps, cleanup: callback() }; });
    },
    useActionState(callback, initial) {
      const [state, setState] = react.useState(initial);
      action = async (form) => { const next = await callback(state, form); setState(next); return next; };
      return [state, action, pending];
    },
  };
  const window = {
    localStorage: {
      getItem() { if (readFails) throw new Error("Storage blocked"); return stored; },
      setItem(_key, value) { stored = value; },
      removeItem() { stored = null; },
    },
    confirm: () => true,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const Form = compile("src/app/team/reward/MonthlyDataForm.tsx", {
    react,
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "@/lib/monthly-data": monthly,
    "@/lib/club-activities": activities,
    "@/lib/monthly-content": content,
  }, { window }).default;
  const props = { action: async () => actionResult, teamId: "SZ-test", selectedMonth: "2026-08", initialOfficialRow: official, initialPlayers: [player], clubActivityItems: [activity], initialContentEntries: [], initialMonthlyRevision: "month-v2", initialSalaryRevision: "salary-v1", isMonthlyDataLocked: false, isSalaryLocked: false, canSaveSalaryScreenshots: true, isDataScreenshotRequired: true, ...overrides };
  function render() {
    let count = 0;
    do {
      dirty = false;
      index = 0;
      tree = Form(props);
      while (effects.length) effects.shift()();
      if (++count > 25) throw new Error("Render loop");
    } while (dirty);
  }
  function flush(delay) {
    for (const [id, timer] of [...timers]) if (timer.delay <= delay) { timers.delete(id); timer.callback(); }
    render();
  }
  render();
  flush(0);
  return {
    nodes: () => nodes(tree),
    flush,
    render,
    stored: () => stored,
    props,
    refreshes: () => refreshes,
    submit: async () => { const result = await action(new FormData()); render(); return result; },
    click: (label) => { const button = nodes(tree).find((node) => node.type === "button" && node.props.children === label); assert.ok(button, label); button.props.onClick(); render(); },
  };
}

test("legacy and outdated browser drafts cannot automatically replace saved club links or metrics", () => {
  for (const monthlyRevision of [undefined, "month-v1"]) {
    const draft = { monthlyRevision, salaryRevision: "salary-v1", officialRow: { ...official, youtubeVideoViews: "500000" }, activities: [activities.emptyClubActivityItem()], savedAt: 1 };
    const h = harness({ draft });
    assert.equal(h.nodes().find((node) => node.type?.name === "ClubActivitySection").props.activities[0].link, activity.link);
    assert.equal(JSON.parse(h.nodes().find((node) => node.props?.name === "official_row").props.value)[0].youtubeVideoViews, "1000000");
    assert.equal(h.nodes().find((node) => node.type === "button" && node.props.value === "draft").props.disabled, true);
    h.flush(350);
    assert.equal(h.stored(), JSON.stringify(draft));
    h.click("サーバーの内容を使用");
    assert.equal(h.nodes().find((node) => node.type === "button" && node.props.value === "draft").props.disabled, false);
  }
});

test("current local edits restore their links but keep server-owned images", () => {
  const h = harness({ draft: { monthlyRevision: "month-v2", salaryRevision: "salary-v1", activities: [{ ...activity, link: "https://example.test/unsent-edit", imageUrl: "" }] } });
  const restored = h.nodes().find((node) => node.type?.name === "ClubActivitySection").props.activities[0];
  assert.equal(restored.link, "https://example.test/unsent-edit");
  assert.equal(restored.imageUrl, activity.imageUrl);
});

test("outdated local content is restored only by an explicit choice", () => {
  const h = harness({ draft: { activities: [{ ...activity, link: "https://example.test/old", imageUrl: "" }] } });
  h.click("端末の入力を復元");
  const restored = h.nodes().find((node) => node.type?.name === "ClubActivitySection").props.activities[0];
  assert.equal(restored.link, "https://example.test/old");
  assert.equal(restored.imageUrl, activity.imageUrl);
});

test("successful drafts update browser cache immediately, before refresh or the debounce", async () => {
  const saved = { ...activity, link: "https://example.test/confirmed", imageUrl: "https://example.test/new.png" };
  const h = harness({ actionResult: { status: "success", actionType: "draft", savedRevision: "month-v3", previousOtherRevision: "salary-v1", savedOtherRevision: "salary-v1", savedActivities: [saved] } });
  await h.submit();
  const cached = JSON.parse(h.stored());
  assert.equal(cached.activities[0].link, saved.link);
  assert.equal(cached.activities[0].imageUrl, saved.imageUrl);
  assert.equal(cached.monthlyRevision, "month-v3");
  assert.equal(h.refreshes(), 1);
  const reopened = harness({ draft: cached, initialMonthlyRevision: "month-v3", clubActivityItems: [saved] });
  assert.equal(reopened.nodes().find((node) => node.type?.name === "ClubActivitySection").props.activities[0].imageUrl, saved.imageUrl);
});

test("failed save retains form values and file selections and does not refresh", async () => {
  const h = harness({ actionResult: { status: "error", message: "Storage unavailable" } });
  const input = { value: "selected-image.png" };
  for (const node of h.nodes().filter((node) => node.type === "form")) node.props.ref.current = { querySelectorAll: () => [input] };
  await h.submit();
  assert.equal(input.value, "selected-image.png");
  assert.equal(h.nodes().find((node) => node.type?.name === "ClubActivitySection").props.activities[0].link, activity.link);
  assert.equal(h.refreshes(), 0);
});

test("salary save retains unsent club activities and does not bless stale monthly revisions", async () => {
  const h = harness({ actionResult: { status: "success", actionType: "salary_screenshots_draft", savedRevision: "salary-v2", previousOtherRevision: "month-newer-on-server", savedOtherRevision: "month-newer-on-server", savedActivities: [] } });
  await h.submit();
  const cached = JSON.parse(h.stored());
  assert.equal(cached.activities[0].link, activity.link);
  assert.equal(cached.monthlyRevision, "month-v2");
  assert.equal(cached.salaryRevision, "salary-v2");
});

test("blocked local storage does not permanently disable server draft saving", () => {
  const h = harness({ readFails: true });
  assert.equal(h.nodes().find((node) => node.type === "button" && node.props.value === "draft").props.disabled, false);
  assert.ok(h.nodes().some((node) => typeof node.props?.children === "string" && node.props.children.includes("端末の一時保存を読み込めません")));
});

test("discarding restored input clears pending replacement files", () => {
  const h = harness({ draft: { monthlyRevision: "month-v2", salaryRevision: "salary-v1", activities: [activity] } });
  const input = { value: "replacement.png" };
  for (const node of h.nodes().filter((node) => node.type === "form")) node.props.ref.current = { querySelectorAll: () => [input] };
  h.click("復元内容を破棄");
  assert.equal(input.value, "");
});

test("compression never replaces a newer file selection or silently ignores a new attachment", async () => {
  const { compressFormImages } = compile("src/app/team/reward/MonthlyDataForm.tsx", {}, {}, "\nexport { compressFormImages };\n");
  const first = new File(["a"], "first.png", { type: "image/png" });
  const second = new File(["b"], "second.png", { type: "image/png" });
  for (const add of [false, true]) {
    const input = { files: [first] };
    const inputs = [input];
    const pending = compressFormImages([{ input, file: first }], { querySelectorAll: () => inputs });
    if (add) inputs.push({ files: [second] });
    else input.files = [second];
    await assert.rejects(pending, /添付内容が変更/);
    assert.equal(input.files[0], add ? first : second);
  }
});

test("explicit restoration keeps the latest server metric and salary attachments", () => {
  const saved = { ...player, xScreenshotUrl: "https://example.test/new-x", salaryScreenshotUrl: "https://example.test/new-salary" };
  const h = harness({ initialPlayers: [saved], draft: { players: [{ ...saved, xScreenshotUrl: "https://example.test/old-x", salaryScreenshotUrl: "https://example.test/old-salary" }] } });
  h.click("端末の入力を復元");
  const restored = JSON.parse(h.nodes().find((node) => node.props?.name === "player_rows").props.value)[0];
  assert.equal(restored.xScreenshotUrl, saved.xScreenshotUrl);
  assert.equal(restored.salaryScreenshotUrl, saved.salaryScreenshotUrl);
});

test("discard is blocked during a save so its response cannot resurrect discarded edits", () => {
  const draft = { monthlyRevision: "month-v2", salaryRevision: "salary-v1", activities: [{ ...activity, link: "https://example.test/unsent" }] };
  const h = harness({ draft, pending: true });
  assert.equal(h.nodes().find((node) => node.type === "button" && node.props.children === "復元内容を破棄").props.disabled, true);
  h.click("復元内容を破棄");
  assert.equal(h.nodes().find((node) => node.type?.name === "ClubActivitySection").props.activities[0].link, "https://example.test/unsent");
});
