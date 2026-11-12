import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
function load(path) {
  const exports = {};
  const source = fs.readFileSync(new URL(path, root), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => {
    if (name === "next/link") return { default: props => createElement("a", props) };
    if (name.startsWith("@/")) {
      const base = `src/${name.slice(2)}`;
      return load(fs.existsSync(new URL(`${base}.tsx`, root)) ? `${base}.tsx` : `${base}.ts`);
    }
    return require(name);
  } });
  return exports;
}

test("public privacy page contains approved access, backup and contact disclosures", () => {
  const { default: Page, metadata } = load("src/app/privacy/page.tsx");
  const html = renderToStaticMarkup(createElement(Page));
  assert.equal(metadata.title, "隐私说明 | IJL 战队管理系统");
  for (const text of ["IJL Settlement Report Export", "不申请读取整个网盘", "不包含原始图片文件", "长期授权凭证加密保存", "Limited Use", "目前未设置自动删除期限", "暂停备份不等于撤销授权"]) assert.ok(html.includes(text), text);
  assert.match(html, /href="mailto:qiyang1900@gmail.com"/);
  assert.equal((html.match(/<h2/g) || []).length, 8);
  assert.match(html, /lang="zh-CN"/);
});

test("terms retain the approved fee boundary and recovery limitations", () => {
  const { default: Page } = load("src/app/terms/page.tsx");
  const html = renderToStaticMarkup(createElement(Page));
  assert.equal((html.match(/<h2/g) || []).length, 7);
  for (const text of ["不会代使用者购买或升级付费套餐", "另行取得账号所有者的明确同意", "附件链接无法保证恢复已删除的图片", "网站不会通过该功能修改文件夹的共享权限"]) assert.ok(html.includes(text), text);
});

test("home and every Google authorization entry link to both public documents", () => {
  const home = renderToStaticMarkup(createElement(load("src/app/page.tsx").default));
  assert.ok(home.includes("IJL Settlement Report Export"));
  for (const path of ["/privacy", "/terms"]) assert.ok(home.includes(`href="${path}" target="_blank" rel="noopener noreferrer"`));
  for (const path of ["src/app/admin/backups/BackupPanel.tsx", "src/app/admin/projects/[projectId]/ProjectDriveExport.tsx", "src/app/admin/projects/[projectId]/teams/[projectTeamId]/ReportExportButtons.tsx"]) {
    assert.match(fs.readFileSync(new URL(path, root), "utf8"), /<LegalLinks\s/);
  }
});

test("public policy routes do not weaken the admin-only authentication boundary", () => {
  const middleware = fs.readFileSync(new URL("middleware.ts", root), "utf8");
  assert.match(middleware, /matcher: \["\/admin\/:path\*", "\/api\/admin\/:path\*"\]/);
  for (const path of ["privacy", "terms"]) {
    const page = fs.readFileSync(new URL(`src/app/${path}/page.tsx`, root), "utf8");
    assert.doesNotMatch(page, /supabase|cookies\(|process\.env|fetch\(/);
  }
});
