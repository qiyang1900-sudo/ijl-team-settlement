"use client";

import { useMemo, useState } from "react";
import {
  MonthlyImportDataType,
  MonthlyImportMode,
  monthlyImportFieldSets,
} from "@/lib/monthly-import";
import { formatMonthlyNumber } from "@/lib/monthly-data";

type MonthOption = {
  value: string;
  label: string;
};

type PreviewRow = {
  sourceLine: number;
  teamInput: string;
  teamShortName: string | null;
  accountName: string;
  playerHandle: string;
  isOfficial: boolean;
  playerMatched: boolean;
  isEmptyMetrics: boolean;
  values: Record<string, string>;
  warnings: string[];
};

type PreviewAction = {
  teamId: string;
  teamName: string | null;
  teamShortName: string | null;
  rowCount: number;
  officialRows: number;
  playerRows: number;
  emptyRows: number;
  action: "insert" | "update";
  currentStatus: string | null;
};

type Preview = {
  targetMonth: string;
  dataType: MonthlyImportDataType;
  mode: MonthlyImportMode;
  parsedRowCount: number;
  importableRowCount: number;
  skippedRows: Array<{ sourceLine: number; reason: string; rawCells: string[] }>;
  missingTeams: string[];
  missingPlayers: Array<{ playerHandle: string; teamShortName: string }>;
  emptyTeams: string[];
  actions: PreviewAction[];
  totals: {
    official: Record<string, number>;
    players: Record<string, number>;
    total: Record<string, number>;
  };
  rows: PreviewRow[];
};

type ImportResponse = {
  ok?: boolean;
  dryRun?: boolean;
  preview?: Preview;
  result?: {
    inserted: number;
    updated: number;
    createdPlayers: number;
    teams: string[];
  };
  error?: string;
  hint?: string;
};

type HistoryImportResponse = {
  ok?: boolean;
  version?: string;
  retiredPlayers?: number;
  autoCreatedHistoryPlayers?: number;
  submissions?: number;
  playerRows?: number;
  error?: string;
};

export default function MonthlyImportClient({
  monthOptions,
  defaultMonth,
}: {
  monthOptions: MonthOption[];
  defaultMonth: string;
}) {
  const [targetMonth, setTargetMonth] = useState(defaultMonth);
  const [dataType, setDataType] = useState<MonthlyImportDataType>("x");
  const [rawText, setRawText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<
    "preview" | "fill" | "overwrite" | "history" | null
  >(null);
  const fields = monthlyImportFieldSets[dataType];
  const canImport = Boolean(preview && preview.importableRowCount > 0);
  const warningCount = useMemo(
    () =>
      (preview?.missingTeams.length || 0) +
      (preview?.missingPlayers.length || 0) +
      (preview?.emptyTeams.length || 0),
    [preview]
  );

  async function submitImport({
    dryRun,
    mode,
  }: {
    dryRun: boolean;
    mode: MonthlyImportMode;
  }) {
    setBusyAction(dryRun ? "preview" : mode);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/monthly-data/import-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          targetMonth,
          dataType,
          mode,
          dryRun,
        }),
      });
      const result = (await response.json()) as ImportResponse;

      if (!response.ok || result.error) {
        setPreview(result.preview || null);
        throw new Error(result.error || "导入请求失败。");
      }

      setPreview(result.preview || null);

      if (dryRun) {
        setMessage("解析完成。请确认预览内容后再导入。");
      } else {
        setMessage(
          `导入完成：新增 ${result.result?.inserted || 0} 队，更新 ${
            result.result?.updated || 0
          } 队，新增历史选手 ${result.result?.createdPlayers || 0} 名。`
        );
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "导入请求失败。"
      );
    } finally {
      setBusyAction(null);
    }
  }

  function handleOverwrite() {
    const confirmed = window.confirm(
      "覆盖导入会覆盖该月份对应类型的字段。其他类型字段会保留。确定继续吗？"
    );

    if (!confirmed) {
      return;
    }

    void submitImport({ dryRun: false, mode: "overwrite" });
  }

  async function importBuiltInHistory() {
    const confirmed = window.confirm(
      "将使用系统内置的历史主数据覆盖导入 2025年05月〜2026年05月 的战队月数据。确定继续吗？"
    );

    if (!confirmed) {
      return;
    }

    setBusyAction("history");
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        "/api/admin/monthly-data/import-history?confirm=import-history",
        { method: "POST" }
      );
      const result = (await response.json()) as HistoryImportResponse;

      if (!response.ok || result.error) {
        throw new Error(result.error || "历史主数据导入失败。");
      }

      setMessage(
        `历史主数据导入完成：版本 ${result.version || "-"}，覆盖 ${
          result.submissions || 0
        } 队次，明细 ${result.playerRows || 0} 行，退役/历史选手 ${
          result.retiredPlayers || 0
        } 名。`
      );
      setPreview(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "历史主数据导入失败。"
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="grid gap-4">
          <div className="rounded-xl border border-indigo-400/40 bg-indigo-950/30 p-4">
            <h2 className="text-base font-bold text-white">内置历史主数据</h2>
            <p className="mt-2 text-sm leading-6 text-indigo-100/80">
              使用已确认的 Excel 明细主数据，覆盖导入 2025年05月〜2026年05月。
            </p>
            <button
              type="button"
              onClick={importBuiltInHistory}
              disabled={Boolean(busyAction)}
              className="mt-4 w-full rounded-lg bg-indigo-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-indigo-300 disabled:cursor-wait disabled:opacity-60"
            >
              {busyAction === "history" ? "历史主数据导入中..." : "导入内置历史主数据"}
            </button>
          </div>

          <label className="block text-sm font-semibold text-slate-200">
            目标月份
            <select
              value={targetMonth}
              onChange={(event) => setTargetMonth(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-white"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-slate-200">
            数据类型
            <select
              value={dataType}
              onChange={(event) => {
                setDataType(event.target.value as MonthlyImportDataType);
                setPreview(null);
                setMessage("");
                setError("");
              }}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-white"
            >
              <option value="x">X 数据</option>
              <option value="youtube">YouTube 数据</option>
            </select>
          </label>

          <label className="block text-sm font-semibold text-slate-200">
            粘贴表格
            <textarea
              value={rawText}
              onChange={(event) => {
                setRawText(event.target.value);
                setPreview(null);
                setMessage("");
                setError("");
              }}
              placeholder="从 Excel 复制包含チーム名、選手名、各项数据的表格后粘贴到这里。"
              className="mt-2 min-h-[360px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-sm text-white outline-none focus:border-white"
            />
          </label>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => submitImport({ dryRun: true, mode: "fill" })}
              disabled={Boolean(busyAction)}
              className="rounded-lg bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-200 disabled:cursor-wait disabled:opacity-60"
            >
              {busyAction === "preview" ? "解析中..." : "解析预览"}
            </button>

            <button
              type="button"
              onClick={() => submitImport({ dryRun: false, mode: "fill" })}
              disabled={!canImport || Boolean(busyAction)}
              className="rounded-lg bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyAction === "fill" ? "导入中..." : "只补空白导入"}
            </button>

            <button
              type="button"
              onClick={handleOverwrite}
              disabled={!canImport || Boolean(busyAction)}
              className="rounded-lg bg-rose-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyAction === "overwrite" ? "覆盖中..." : "覆盖导入"}
            </button>
          </div>

          {message ? (
            <div className="rounded-lg border border-emerald-500 bg-emerald-950 px-4 py-3 text-sm text-emerald-100">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-rose-500 bg-rose-950 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-5">
        {!preview ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-300">
            <h2 className="text-xl font-bold text-white">预览结果</h2>
            <p className="mt-2 text-sm">
              先点击“解析预览”。系统会显示识别到的战队、缺失选手、空数据队伍和合计数。
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="可导入行" value={preview.importableRowCount} />
              <StatCard label="涉及战队" value={preview.actions.length} />
              <StatCard label="需要注意" value={warningCount} />
              <StatCard label="跳过行" value={preview.skippedRows.length} />
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
              <h2 className="text-xl font-bold">战队导入动作</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-slate-800 text-slate-300">
                    <tr>
                      <th className="px-3 py-2">战队</th>
                      <th className="px-3 py-2">动作</th>
                      <th className="px-3 py-2">当前状态</th>
                      <th className="px-3 py-2">官方</th>
                      <th className="px-3 py-2">选手</th>
                      <th className="px-3 py-2">空数据行</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.actions.map((action) => (
                      <tr
                        key={action.teamId}
                        className="border-t border-slate-700"
                      >
                        <td className="px-3 py-2 font-semibold">
                          {action.teamName || action.teamShortName || "-"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              action.action === "insert"
                                ? "rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-200"
                                : "rounded-full bg-sky-500/15 px-2 py-1 text-xs text-sky-200"
                            }
                          >
                            {action.action === "insert" ? "新增" : "更新"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {action.currentStatus || "-"}
                        </td>
                        <td className="px-3 py-2">{action.officialRows}</td>
                        <td className="px-3 py-2">{action.playerRows}</td>
                        <td className="px-3 py-2">{action.emptyRows}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <PreviewWarnings preview={preview} />

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
              <h2 className="text-xl font-bold">合计确认</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead className="bg-slate-800 text-slate-300">
                    <tr>
                      <th className="px-3 py-2">分类</th>
                      {fields.map((field) => (
                        <th key={String(field.key)} className="px-3 py-2">
                          {field.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["官方合计", preview.totals.official],
                      ["选手合计", preview.totals.players],
                      ["总合计", preview.totals.total],
                    ].map(([label, values]) => (
                      <tr key={String(label)} className="border-t border-slate-700">
                        <td className="px-3 py-2 font-semibold">{String(label)}</td>
                        {fields.map((field) => (
                          <td key={String(field.key)} className="px-3 py-2">
                            {formatMonthlyNumber(
                              (values as Record<string, number>)[String(field.key)]
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
              <h2 className="text-xl font-bold">识别明细</h2>
              <div className="mt-4 max-h-[520px] overflow-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-slate-800 text-slate-300">
                    <tr>
                      <th className="px-3 py-2">行</th>
                      <th className="px-3 py-2">战队</th>
                      <th className="px-3 py-2">名称</th>
                      <th className="px-3 py-2">类型</th>
                      <th className="px-3 py-2">匹配</th>
                      {fields.map((field) => (
                        <th key={String(field.key)} className="px-3 py-2">
                          {field.label}
                        </th>
                      ))}
                      <th className="px-3 py-2">提醒</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr
                        key={`${row.sourceLine}-${row.accountName}`}
                        className="border-t border-slate-700"
                      >
                        <td className="px-3 py-2">{row.sourceLine}</td>
                        <td className="px-3 py-2">
                          {row.teamShortName || row.teamInput}
                        </td>
                        <td className="px-3 py-2 font-semibold">
                          {row.accountName}
                        </td>
                        <td className="px-3 py-2">
                          {row.isOfficial ? "官方" : "选手"}
                        </td>
                        <td className="px-3 py-2">
                          {row.playerMatched ? "OK" : "新增"}
                        </td>
                        {fields.map((field) => (
                          <td key={String(field.key)} className="px-3 py-2">
                            {row.values[String(field.key)] || "-"}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-amber-200">
                          {row.warnings.join(" / ") || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{formatMonthlyNumber(value)}</p>
    </div>
  );
}

function PreviewWarnings({ preview }: { preview: Preview }) {
  if (
    preview.missingTeams.length === 0 &&
    preview.missingPlayers.length === 0 &&
    preview.emptyTeams.length === 0
  ) {
    return (
      <div className="rounded-xl border border-emerald-600 bg-emerald-950 p-4 text-sm text-emerald-100">
        没有发现无法识别的战队。缺失选手如导入时出现，会自动作为历史选手补入。
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <WarningBox title="无法识别战队" items={preview.missingTeams} />
      <WarningBox
        title="将新增历史选手"
        items={preview.missingPlayers.map(
          (player) => `${player.teamShortName}_${player.playerHandle}`
        )}
      />
      <WarningBox title="空数据队伍/行" items={preview.emptyTeams} />
    </div>
  );
}

function WarningBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-amber-600 bg-amber-950 p-4">
      <h3 className="font-bold text-amber-100">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-amber-200">无</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-100"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
