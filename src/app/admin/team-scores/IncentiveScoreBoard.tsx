"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Save,
  ChevronDown,
  AlertCircle,
  SlidersHorizontal,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  hasIncentiveCorrections,
  hasIncentiveRankingCorrections,
  incentiveFields,
  incentiveScoreFields,
  isIncentiveReviewStale,
  normalizeIncentiveReview,
  rankingFields,
  type IncentiveField,
  type IncentiveScoreField,
  type IncentiveMonthResult,
  type IncentiveReview,
  type IncentiveTeamResult,
} from "@/lib/incentive-score";
import type { IncentiveSnapshot } from "@/lib/incentive-store";

const number = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString("ja-JP");
const yen = (value: number) => `¥${number(value)}`;
const fieldKeys = Object.keys(incentiveFields) as IncentiveField[];
const scoreKeys = Object.keys(incentiveScoreFields) as IncentiveScoreField[];
const groups = {
  A: "基础内容",
  B: "联盟排名",
  C: "成长及人气",
  D: "额外奖励",
} as const;
const groupKeys = Object.keys(groups) as Array<keyof typeof groups>;
const noticeLabels = {
  missing: "部分未计入",
  unclaimed: "未申报",
  not_collected: "当月未采集",
};
const inputStyle =
  "min-w-0 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-white focus:border-sky-400 focus:outline-none";
const buttonStyle =
  "inline-flex max-w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold whitespace-normal disabled:opacity-40 disabled:cursor-not-allowed [&>svg]:shrink-0";

class SaveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function post(body: unknown) {
  const response = await fetch("/api/admin/incentive-scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("服务器未返回有效结果。输入已保留，请稍后重试。");
  }
  if (!response.ok || !data.success)
    throw new SaveError(
      data.error || "保存失败，输入已保留。",
      response.status,
    );
  return data as { message: string; reviewVersion?: string };
}

export default function IncentiveScoreBoard({
  result,
  reviews,
  hashes,
  sourceHash,
  rankingHash,
  snapshot,
  evidence,
  legacy,
}: {
  result: IncentiveMonthResult;
  reviews: IncentiveReview[];
  hashes: Record<string, string>;
  sourceHash: string;
  rankingHash: string;
  snapshot: IncentiveSnapshot | null;
  evidence: Record<string, ReactNode>;
  legacy: Array<{
    team_id: string;
    finalized_score: number | null;
    finalized_grade: string | null;
    finalized_at: string | null;
  }>;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
  const teamSelect = useId();
  const [selectedTeam, setSelectedTeam] = useState("");
  const [refreshing, startRefresh] = useTransition();
  const refresh = useCallback(
    () => startRefresh(() => router.refresh()),
    [router],
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!dirty.size) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.size]);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationHash, setConfirmationHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const approved = result.teams.filter((team) => team.hasApprovedData);
  const excluded = result.teams.filter((team) => !team.hasApprovedData);
  const stale = approved.filter((team) =>
    reviews.some(
      (review) =>
        review.team_id === team.teamId &&
        isIncentiveReviewStale(review, hashes[team.teamId], rankingHash),
    ),
  );
  const ready =
    approved.length > 0 &&
    stale.length === 0 &&
    dirty.size === 0 &&
    saving.size === 0 &&
    !refreshing;
  const settlementStatus = !approved.length
    ? "等待月数据通过"
    : dirty.size > 0
      ? "有未保存修改"
      : saving.size || refreshing
        ? "正在更新结果"
        : ready
          ? "可结算"
          : "已有修正需更新";
  const sorted = [...approved].sort(
    (a, b) => (b.total ?? -1) - (a.total ?? -1),
  );
  const setTeamDirty = useCallback((teamId: string, value: boolean) => {
    setDirty((current) => {
      const next = new Set(current);
      if (value) next.add(teamId);
      else next.delete(teamId);
      return next;
    });
    setConfirmed(false);
  }, []);
  const setTeamSaving = useCallback((teamId: string, value: boolean) => {
    setSaving((current) => {
      const next = new Set(current);
      if (value) next.add(teamId);
      else next.delete(teamId);
      return next;
    });
    setConfirmed(false);
  }, []);
  const activeTeam = result.teams.some((team) => team.teamId === selectedTeam)
    ? selectedTeam
    : (approved[0]?.teamId ?? result.teams[0]?.teamId);
  async function finalize() {
    if (!ready || !confirmed || confirmationHash !== sourceHash || busy) return;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const data = await post({
        action: "finalize",
        month: result.month,
        sourceHash,
        confirmed: confirmed && confirmationHash === sourceHash,
      });
      setMessage(data.message);
      setConfirmed(false);
      refresh();
    } catch (error) {
      setConfirmed(false);
      if (error instanceof SaveError && error.status === 409) refresh();
      setError(true);
      setMessage(error instanceof Error ? error.message : "结算保存失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="border-y border-slate-700 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-bold">
            {result.month} 月度计算{" "}
            <span className="ml-2 text-sm font-normal text-amber-300">
              {settlementStatus}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-300">
              月数据已通过 {approved.length} 队 · A 达标{" "}
              {approved.filter((team) => team.eligible).length} 队
            </p>
            <button
              type="button"
              className={`${buttonStyle} bg-slate-700 text-white`}
              disabled={busy || !result.teams.length}
              onClick={() => dialog.current?.showModal()}
            >
              <SlidersHorizontal size={16} />
              人工复核（可选）
              {dirty.size > 0 ? ` · ${dirty.size} 队未保存` : ""}
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm tabular-nums">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                {[
                  "名次",
                  "战队",
                  "A / 60",
                  "B / 50",
                  "C",
                  "总分",
                  "前五名奖金",
                  "D 奖金",
                  "奖金合计",
                ].map((label) => (
                  <th key={label} className="px-3 py-3 whitespace-nowrap">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((team) => (
                <tr key={team.teamId} className="border-b border-slate-800">
                  <td className="px-3 py-3">
                    {!team.eligible ? "未达标" : (team.rank ?? "五名外")}
                  </td>
                  <th className="px-3 py-3">{team.shortName}</th>
                  <td className="px-3 py-3">{number(team.a.score)}</td>
                  <td className="px-3 py-3">{number(team.b.score ?? 0)}</td>
                  <td className="px-3 py-3">{number(team.c.score ?? 0)}</td>
                  <td className="px-3 py-3 font-bold">
                    {number(team.total ?? 0)}
                  </td>
                  <td className="px-3 py-3">{yen(team.prize.ranking)}</td>
                  <td className="px-3 py-3">
                    {yen(
                      team.prize.views + team.prize.posts + team.prize.popular,
                    )}
                  </td>
                  <td className="px-3 py-3">{yen(team.prize.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!approved.length && (
          <p className="py-6 text-slate-400">本月暂无审核通过的月数据。</p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          原始空值保留为
          —，按现有资料计分；未申报、未采集及部分未计入的项目见各队明细。
          {!result.prizeEnabled && " 本月奖金尚未实施，奖金为 ¥0。"}
        </p>
        {!!excluded.length && (
          <p className="mt-3 text-sm text-slate-400">
            暂无已通过月数据，未纳入本次计算：
            {excluded.map((team) => team.shortName).join("、")}
          </p>
        )}
      </section>

      <div className="grid items-start gap-4 py-5 lg:grid-cols-2">
        {result.teams.map((team) => (
          <TeamCard
            key={`${result.month}:${team.teamId}`}
            team={team}
            review={reviews.find((review) => review.team_id === team.teamId)}
            stale={stale.some((row) => row.teamId === team.teamId)}
            dirty={dirty.has(team.teamId)}
            prizeEnabled={result.prizeEnabled}
            evidence={evidence[team.teamId]}
          />
        ))}
      </div>

      <dialog
        ref={dialog}
        aria-labelledby={dialogTitle}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto overscroll-contain rounded-lg border border-slate-600 bg-slate-950 p-0 text-white shadow-xl backdrop:bg-black/70"
      >
        <header className="sticky top-0 z-10 border-b border-slate-700 bg-slate-950 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={dialogTitle} className="text-lg font-bold">
                集中人工复核
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {result.month} · {dirty.size} 队有未保存修正
              </p>
            </div>
            <button
              type="button"
              title="关闭复核"
              aria-label="关闭复核"
              onClick={() => dialog.current?.close()}
              className="flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-slate-800"
            >
              <X size={20} />
            </button>
          </div>
          <label
            htmlFor={teamSelect}
            className="mt-4 block text-sm text-slate-300"
          >
            战队
          </label>
          <select
            id={teamSelect}
            value={activeTeam ?? ""}
            onChange={(event) => setSelectedTeam(event.target.value)}
            className={`${inputStyle} mt-1`}
          >
            {result.teams.map((team) => (
              <option key={team.teamId} value={team.teamId}>
                {team.shortName}
                {dirty.has(team.teamId)
                  ? " · 未保存"
                  : stale.some((row) => row.teamId === team.teamId)
                    ? " · 修正待更新"
                    : !team.hasApprovedData
                      ? " · 暂无已通过数据"
                      : ""}
              </option>
            ))}
          </select>
        </header>
        {result.teams.map((team) => (
          <div
            key={`${result.month}:${team.teamId}`}
            hidden={team.teamId !== activeTeam}
            className="p-4 sm:p-5"
          >
            <ManualReviewForm
              team={team}
              review={reviews.find((review) => review.team_id === team.teamId)}
              sourceHash={hashes[team.teamId]}
              rankingHash={rankingHash}
              month={result.month}
              refreshing={refreshing}
              onRefresh={refresh}
              onDirty={setTeamDirty}
              onSaving={setTeamSaving}
            />
          </div>
        ))}
      </dialog>

      <section className="border-t border-slate-700 py-6">
        <h2 className="text-lg font-bold">月度结算</h2>
        {result.prizeEnabled && (
          <p className="mt-3 text-sm text-slate-300">
            {!approved.length
              ? "等待月数据通过后计算奖金"
              : `本次分配 ${yen(result.allocated)} · 不分配／舍去尾数 ${yen(result.unallocated)}`}{" "}
            · 月度上限 ¥2,000,000
          </p>
        )}
        <label className="mt-4 flex items-start gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0"
            checked={ready && confirmed && confirmationHash === sourceHash}
            disabled={!ready || busy}
            onChange={(event) => {
              setConfirmed(event.target.checked);
              setConfirmationHash(sourceHash);
            }}
          />
          <span>
            已核对参评战队、排名、奖金及本次未计入项。未通过月数据的战队不参与本次结算，空缺名次及未达标专项奖金不分配。
          </span>
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={
              !ready || !confirmed || confirmationHash !== sourceHash || busy
            }
            onClick={finalize}
            className={`${buttonStyle} bg-emerald-400 text-slate-950`}
          >
            <Check size={16} />
            {busy ? "保存中…" : "已审核结束并保存本月结果"}
          </button>
          <span className="text-sm text-slate-400">
            {!approved.length
              ? "本月暂无审核通过的月数据，暂不能结算"
              : dirty.size
                ? `${dirty.size} 队有未保存修改`
                : !ready
                  ? stale.length
                    ? `已有修正需按最新资料保存：${stale.map((team) => team.shortName).join("、")}`
                    : "正在更新结果，请稍候"
                  : "保存后保留独立结算记录"}
          </span>
        </div>
        {message && (
          <p
            role={error ? "alert" : "status"}
            className={`mt-3 text-sm ${error ? "text-rose-300" : "text-emerald-300"}`}
          >
            {message}
          </p>
        )}
        {snapshot && (
          <details className="mt-5 border-t border-slate-800 pt-4">
            <summary className="cursor-pointer text-sm font-semibold">
              已保存的月结算 ·{" "}
              {new Date(snapshot.created_at).toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
              })}
              （日本时间）
              {snapshot.source_hash !== sourceHash
                ? " · 当前数据已变化，原结果保留"
                : " · 与当前数据一致"}
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[460px] text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "战队",
                      "分数",
                      "名次",
                      "前五名奖金",
                      "D 奖金",
                      "合计",
                    ].map((text) => (
                      <th key={text} className="p-2">
                        {text}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.result.teams
                    .filter((team) => team.hasApprovedData)
                    .map((team) => (
                      <tr
                        key={team.teamId}
                        className="border-t border-slate-800"
                      >
                        <td className="p-2">{team.shortName}</td>
                        <td className="p-2">{number(team.total)}</td>
                        <td className="p-2">{team.rank ?? "—"}</td>
                        <td className="p-2">{yen(team.prize.ranking)}</td>
                        <td className="p-2">
                          {yen(
                            team.prize.views +
                              team.prize.posts +
                              team.prize.popular,
                          )}
                        </td>
                        <td className="p-2">{yen(team.prize.total)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        {!!legacy.length && (
          <details className="mt-5 border-t border-slate-800 pt-4">
            <summary className="cursor-pointer text-sm font-semibold">
              旧制度已确认分数留档（{legacy.length}）
            </summary>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              {legacy.map((row) => (
                <li key={row.team_id}>
                  {result.teams.find((team) => team.teamId === row.team_id)
                    ?.shortName || row.team_id}
                  ：{number(row.finalized_score)}（{row.finalized_grade}）
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </>
  );
}

function currentScores(team: IncentiveTeamResult) {
  return {
    aYoutube: team.a.youtube,
    aShorts: team.a.shorts,
    aX: team.a.x,
    bX: team.b.x,
    bYoutube: team.b.youtube,
    bShorts: team.b.shorts,
    bExtra: team.b.extra,
    cGrowth: team.c.growth,
    cPopular: team.c.popular,
    cEvents: team.c.events,
  };
}

function SourceNotices({ team }: { team: IncentiveTeamResult }) {
  if (!team.notices.length) return null;
  return (
    <details className="border-t border-slate-700 pt-3">
      <summary className="cursor-pointer text-sm text-amber-200">
        来源提示 · {team.notices.length} 项
      </summary>
      <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
        {team.notices.map((notice, index) => (
          <li key={notice.field + ":" + index} className="break-words">
            <span className="mr-2 text-amber-200">
              {noticeLabels[notice.kind]}
            </span>
            {notice.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

function SourceTable({
  team,
  group,
}: {
  team: IncentiveTeamResult;
  group: keyof typeof groups;
}) {
  return (
    <table className="mt-3 w-full table-fixed text-left text-xs leading-relaxed">
      <thead className="text-slate-400">
        <tr>
          <th scope="col" className="w-1/2 py-2 pr-2">
            来源项目
          </th>
          <th scope="col" className="w-1/4 px-2 py-2 text-right">
            原始数量
          </th>
          <th scope="col" className="w-1/4 py-2 pl-2 text-right">
            当前采用
          </th>
        </tr>
      </thead>
      <tbody>
        {fieldKeys
          .filter((key) => incentiveFields[key].group === group)
          .map((key) => (
            <tr key={key} className="border-t border-slate-800 align-top">
              <th scope="row" className="break-words py-2 pr-2 font-normal">
                {incentiveFields[key].label}
                <span className="mt-1 block text-slate-400">
                  {sourceStatus(team, key)}
                </span>
                {rankingFields.some((field) => field === key) && (
                  <span className="mt-1 block text-sky-300">
                    排名{" "}
                    {team.b.ranks[key as (typeof rankingFields)[number]] ?? "—"}
                  </span>
                )}
              </th>
              <td className="break-all px-2 py-2 text-right tabular-nums">
                {number(team.proposed[key])}
              </td>
              <td className="break-all py-2 pl-2 text-right tabular-nums">
                {number(team.values[key])}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function sourceStatus(team: IncentiveTeamResult, key: IncentiveField) {
  if (!team.hasApprovedData) return "暂无已通过月数据";
  const notices = team.notices.filter((notice) => notice.field === key);
  const value = team.values[key];
  if (notices.some((notice) => notice.kind === "missing"))
    return value === null
      ? "待补充 · 本次不计入"
      : "部分待补充 · 已知部分正常计算";
  if (notices.some((notice) => notice.kind === "not_collected"))
    return "当月未采集 · 本次不计入";
  if (notices.some((notice) => notice.kind === "unclaimed")) return "未申报";
  if (value === null) return "待补充 · 本次不计入";
  const field = incentiveFields[key];
  if ("target" in field) return value >= field.target ? "已达标" : "未达标";
  if (!team.eligible) return "A 未达标 · 不参与加分及奖励";
  if (rankingFields.some((field) => field === key)) {
    const rank = team.b.ranks[key as (typeof rankingFields)[number]];
    return rank != null && rank <= 5 ? "已达标" : "未达标 · 0 分";
  }
  return value > 0
    ? "已计入"
    : `未达标 · ${key === "bonusVideos" ? "0 奖金" : "0 分"}`;
}

function TeamCard({
  team,
  review,
  stale,
  dirty,
  prizeEnabled,
  evidence,
}: {
  team: IncentiveTeamResult;
  review?: IncentiveReview;
  stale: boolean;
  dirty: boolean;
  prizeEnabled: boolean;
  evidence: ReactNode;
}) {
  const corrected = hasIncentiveCorrections(review?.inputs);
  const status = !team.hasApprovedData
    ? "暂无已通过月数据"
    : dirty
      ? "有未保存修正"
      : stale
        ? "已有修正需更新"
        : corrected
          ? "已保存人工修正"
          : "自动计算";
  const scores = currentScores(team);
  const dPrize = team.prize.views + team.prize.posts + team.prize.popular;
  return (
    <article className="min-w-0 rounded-lg border border-slate-700 bg-slate-900/70">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="break-words text-lg font-bold">{team.shortName}</h2>
          <p className="mt-1 break-words text-xs text-slate-400">
            {team.teamName}
          </p>
          <p className="mt-2 text-xs text-amber-200">{status}</p>
        </div>
        <div className="max-w-full text-right">
          <p className="text-xs text-slate-400">A＋B＋C</p>
          <p className="mt-1 break-all text-2xl font-bold tabular-nums">
            {team.hasApprovedData ? number(team.total ?? 0) : "—"}
            {team.hasApprovedData && (
              <span className="ml-1 text-xs font-normal text-slate-400">
                分
              </span>
            )}
          </p>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-4 border-t border-slate-800 p-4 sm:grid-cols-4">
        {[
          [
            "A 基础 / 60",
            team.hasApprovedData ? number(team.a.score ?? 0) : "—",
          ],
          [
            "B 排名 / 50",
            team.hasApprovedData ? number(team.b.score ?? 0) : "—",
          ],
          [
            "C 成长及人气",
            team.hasApprovedData ? number(team.c.score ?? 0) : "—",
          ],
          ["D 额外奖励", team.hasApprovedData ? yen(dPrize) : "—"],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs leading-5 text-slate-400">{label}</dt>
            <dd className="mt-1 break-all text-lg font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap justify-between gap-2 border-t border-slate-800 px-4 py-3 text-xs">
        <span className={team.eligible ? "text-emerald-300" : "text-amber-200"}>
          {!team.hasApprovedData
            ? "未纳入本月结算"
            : team.eligible
              ? "A 达标 · " +
                (team.rank == null ? "五名外" : "第 " + team.rank + " 名")
              : "未达标 / " + number(team.a.score ?? 0) + "分"}
        </span>
        <span className="text-slate-300">
          奖金合计 {team.hasApprovedData ? yen(team.prize.total) : "—"}
          {!prizeEnabled && " · 本月未实施"}
        </span>
      </div>
      <details className="group border-t border-slate-700">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold">
          <span>评分明细与来源</span>
          {team.hasApprovedData && team.notices.length > 0 && (
            <span className="ml-auto text-xs font-normal text-amber-200">
              {team.notices.length} 项提示
            </span>
          )}
          <ChevronDown
            size={16}
            className="shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="space-y-5 px-4 pb-4">
          {team.hasApprovedData && <SourceNotices team={team} />}
          {groupKeys.map((group) => (
            <section
              key={group}
              className="min-w-0 border-t border-slate-700 pt-3"
            >
              <h3 className="text-sm font-semibold">
                {group} · {groups[group]}
              </h3>
              {group !== "D" ? (
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  {scoreKeys
                    .filter((key) => incentiveScoreFields[key].group === group)
                    .map((key) => (
                      <div key={key} className="min-w-0">
                        <dt className="text-slate-400">
                          {incentiveScoreFields[key].label}
                        </dt>
                        <dd className="mt-1 break-words tabular-nums">
                          {team.hasApprovedData
                            ? number(scores[key] ?? 0) + " 分"
                            : "—"}
                          {review?.inputs.scores?.[key] != null && (
                            <span className="ml-2 text-amber-200">
                              人工修正
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                </dl>
              ) : (
                <>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    {[
                      ["个人播放奖", team.prize.views],
                      ["个人投稿奖", team.prize.posts],
                      ["热门作品奖", team.prize.popular],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-slate-400">{label}</dt>
                        <dd className="mt-1 break-all tabular-nums">
                          {team.hasApprovedData ? yen(value as number) : "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-slate-400">
                    D 仅限选手／教练，官方账号不参与；奖金不计入 A＋B＋C。
                  </p>
                </>
              )}
              <SourceTable team={team} group={group} />
              {group === "A" &&
                team.hasApprovedData &&
                !!team.a.deductions.length && (
                  <div className="mt-3 space-y-1 text-xs leading-relaxed text-amber-200">
                    <p className="font-semibold">自动计分依据</p>
                    {team.a.deductions.map((text, index) => (
                      <p key={index} className="break-words">
                        {text}
                      </p>
                    ))}
                  </div>
                )}
              {group === "D" && (
                <>
                  <table className="mt-3 w-full table-fixed text-left text-xs">
                    <thead className="text-slate-400">
                      <tr>
                        <th scope="col" className="w-2/5 py-2">
                          成员
                        </th>
                        <th scope="col" className="px-2 py-2 text-right">
                          当前播放
                        </th>
                        <th scope="col" className="py-2 text-right">
                          当前投稿
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.members.map((member) => (
                        <tr
                          key={member.id}
                          className="border-t border-slate-800 align-top"
                        >
                          <th
                            scope="row"
                            className="break-words py-2 pr-2 font-normal"
                          >
                            {member.name}
                          </th>
                          <td className="break-all px-2 py-2 text-right tabular-nums">
                            {number(member.views)}
                          </td>
                          <td className="break-all py-2 text-right tabular-nums">
                            {number(member.posts)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!team.members.length && (
                    <p className="mt-2 text-xs text-slate-400">
                      暂无选手／教练数据。
                    </p>
                  )}
                  {team.prize.winners.map((text, index) => (
                    <p
                      key={index}
                      className="mt-2 break-words text-xs text-emerald-300"
                    >
                      {text}
                    </p>
                  ))}
                </>
              )}
            </section>
          ))}
          {review?.inputs.note && (
            <div className="border-t border-slate-700 pt-3 text-sm">
              <h3 className="font-semibold">已保存复核备注</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-slate-300">
                {review.inputs.note}
              </p>
            </div>
          )}
          <details className="border-t border-slate-700 pt-3">
            <summary className="cursor-pointer text-sm font-semibold">
              来源及凭证
            </summary>
            <div className="mt-3 space-y-2 break-words text-xs leading-relaxed text-slate-400">
              {team.details.map((text, index) => (
                <p key={index}>{text}</p>
              ))}
            </div>
            <div className="mt-4 min-w-0 overflow-x-auto">{evidence}</div>
          </details>
        </div>
      </details>
    </article>
  );
}

type ReviewDraft = {
  overrides: Record<string, string>;
  scores: Record<string, string>;
  individuals: Record<string, { views?: string; posts?: string }>;
  note: string;
  initialHash: string;
  initialRankingHash: string;
  reviewVersion: string | null;
  receivedRevision: string;
  awaitingVersion?: string;
  dirty: boolean;
};

export function hasReceivedReviewVersion(received?: string, saved?: string) {
  if (!saved) return true;
  if (!received) return false;
  // PostgreSQL returns +00:00, while the save response uses Z.
  return Date.parse(received) >= Date.parse(saved);
}

function createDraft(
  review: IncentiveReview | undefined,
  sourceHash: string,
  rankingHash: string,
  receivedRevision: string,
): ReviewDraft {
  const strings = (values: Record<string, number | null | undefined>) =>
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        value == null ? "" : String(value),
      ]),
    );
  return {
    overrides: strings(review?.inputs.overrides || {}),
    scores: strings(review?.inputs.scores || {}),
    individuals: Object.fromEntries(
      Object.entries(review?.inputs.individuals || {}).map(([id, value]) => [
        id,
        { views: String(value.views ?? ""), posts: String(value.posts ?? "") },
      ]),
    ),
    note: review?.inputs.note || "",
    initialHash: sourceHash,
    initialRankingHash: rankingHash,
    reviewVersion: review?.updated_at || null,
    receivedRevision,
    dirty: false,
  };
}

function NumericCorrection({
  label,
  value,
  automatic,
  max,
  sourceLabel = "自动",
  onChange,
}: {
  label: string;
  value: string;
  automatic: number | null | undefined;
  max?: number | null;
  sourceLabel?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block break-words text-sm leading-5">
        {label}
        {max != null && (
          <span className="ml-1 text-xs text-slate-400">（上限 {max}）</span>
        )}
      </label>
      <p id={id + "-source"} className="mb-1 mt-1 text-xs text-slate-400">
        {sourceLabel}：{number(automatic)}
      </p>
      <input
        id={id}
        aria-describedby={id + "-source"}
        type="number"
        min="0"
        max={max ?? undefined}
        step="1"
        inputMode="numeric"
        className={inputStyle}
        placeholder="不修正"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ManualReviewForm({
  team,
  review,
  sourceHash,
  rankingHash,
  month,
  refreshing,
  onRefresh,
  onDirty,
  onSaving,
}: {
  team: IncentiveTeamResult;
  review?: IncentiveReview;
  sourceHash: string;
  rankingHash: string;
  month: string;
  refreshing: boolean;
  onRefresh: () => void;
  onDirty: (id: string, dirty: boolean) => void;
  onSaving: (id: string, saving: boolean) => void;
}) {
  const noteId = useId();
  const revision = JSON.stringify([sourceHash, rankingHash, review ?? null]);
  const [draft, setDraft] = useState(() =>
    createDraft(review, sourceHash, rankingHash, revision),
  );
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  // A refresh may update clean forms, but must never overwrite unsaved corrections.
  if (
    !busy &&
    revision !== draft.receivedRevision &&
    hasReceivedReviewVersion(review?.updated_at, draft.awaitingVersion)
  ) {
    setDraft(
      draft.dirty
        ? { ...draft, receivedRevision: revision }
        : createDraft(review, sourceHash, rankingHash, revision),
    );
  }
  useEffect(() => {
    onDirty(team.teamId, draft.dirty || Boolean(draft.awaitingVersion));
  }, [team.teamId, draft.dirty, draft.awaitingVersion, onDirty]);

  const hasRankingCorrections = hasIncentiveRankingCorrections({
    scores: Object.fromEntries(
      Object.entries(draft.scores)
        .filter(([, value]) => value.trim() !== "")
        .map(([key, value]) => [key, Number(value)]),
    ),
  });
  const sourceChanged =
    sourceHash !== draft.initialHash ||
    (hasRankingCorrections && rankingHash !== draft.initialRankingHash) ||
    (review?.updated_at || null) !== draft.reviewVersion;
  const needsRebase = !draft.awaitingVersion && (sourceChanged || conflict);
  const stale = Boolean(
    review && isIncentiveReviewStale(review, sourceHash, rankingHash),
  );
  const locked = busy || refreshing || Boolean(draft.awaitingVersion);
  const hasCorrections = [
    ...Object.values(draft.overrides),
    ...Object.values(draft.scores),
    ...Object.values(draft.individuals).flatMap((values) =>
      Object.values(values),
    ),
  ].some((value) => value != null && value.trim() !== "");
  const removedMembers = Object.keys(draft.individuals).filter(
    (id) => !team.members.some((member) => member.id === id),
  );

  function change(
    values: Partial<
      Pick<ReviewDraft, "overrides" | "scores" | "individuals" | "note">
    >,
  ) {
    setDraft((current) => ({ ...current, ...values, dirty: true }));
    onDirty(team.teamId, true);
    setMessage("");
    setError(false);
  }

  async function save() {
    if (locked || needsRebase || !team.hasApprovedData) return;
    setBusy(true);
    onSaving(team.teamId, true);
    setMessage("");
    setError(false);
    try {
      const individuals = Object.fromEntries(
        Object.entries(draft.individuals).filter(([, values]) =>
          Object.values(values).some((value) => value?.trim()),
        ),
      );
      const inputs = normalizeIncentiveReview({
        overrides: draft.overrides,
        scores: draft.scores,
        individuals,
        note: draft.note,
      });
      if (hasIncentiveCorrections(inputs) && !inputs.note)
        throw new Error("有人工修正时，请填写复核备注和数据来源。");
      const data = await post({
        action: "save",
        month,
        teamId: team.teamId,
        sourceHash: draft.initialHash,
        rankingHash: draft.initialRankingHash,
        reviewVersion: draft.reviewVersion,
        inputs,
        reviewed: false,
      });
      if (!data.reviewVersion)
        throw new Error("保存结果缺少版本信息，输入已保留，请刷新核对。");
      const saved = createDraft(
        {
          team_id: team.teamId,
          target_month: month,
          status: "draft",
          inputs,
          source_hash: draft.initialHash,
          updated_at: data.reviewVersion,
        },
        draft.initialHash,
        draft.initialRankingHash,
        revision,
      );
      // Keep settlement blocked until the refreshed scores include this saved version.
      setDraft({ ...saved, awaitingVersion: data.reviewVersion });
      setConflict(false);
      setMessage("人工修正已保存，正在更新排名及奖金。");
      onRefresh();
    } catch (error) {
      setError(true);
      setMessage(
        error instanceof Error ? error.message : "保存失败，输入已保留。",
      );
      if (error instanceof SaveError && error.status === 409) {
        setConflict(true);
        onRefresh();
      }
    } finally {
      setBusy(false);
      onSaving(team.teamId, false);
    }
  }

  return (
    <form
      className="min-w-0 space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onInvalidCapture={(event) => {
        let element = event.target as HTMLElement | null;
        while (element) {
          if (element instanceof HTMLDetailsElement) element.open = true;
          element = element.parentElement;
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="min-w-0 break-words text-base font-semibold">
          {team.shortName} · 人工修正
        </h3>
        <button
          type="button"
          title="刷新来源，保留未保存修正"
          className={buttonStyle + " bg-slate-800 text-slate-200"}
          disabled={busy || refreshing}
          onClick={onRefresh}
        >
          <RefreshCw size={16} />
          刷新来源
        </button>
      </div>
      {!team.hasApprovedData && (
        <p className="text-sm text-amber-200">
          暂无本月已通过月数据，不参与结算。
        </p>
      )}
      {stale && !needsRebase && !draft.awaitingVersion && (
        <p
          role="status"
          className="flex items-start gap-2 text-sm text-amber-200"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          已有人工修正对应的来源已变化，请核对最新资料后保存修正。
        </p>
      )}
      {needsRebase && (
        <div
          role="alert"
          className="space-y-3 border-y border-amber-700 py-3 text-sm text-amber-200"
        >
          <p>
            来源或已保存修正已更新。当前输入已保留，采用最新资料后需重新核对并保存。
          </p>
          <button
            type="button"
            className={buttonStyle + " bg-amber-300 text-slate-950"}
            disabled={locked}
            onClick={() => {
              setDraft((current) => ({
                ...current,
                initialHash: sourceHash,
                initialRankingHash: rankingHash,
                reviewVersion: review?.updated_at || null,
                receivedRevision: revision,
                dirty: true,
              }));
              setConflict(false);
              setMessage("");
              onDirty(team.teamId, true);
            }}
          >
            <RefreshCw size={16} />
            采用最新资料并保留输入
          </button>
        </div>
      )}
      {team.hasApprovedData && <SourceNotices team={team} />}
      <fieldset
        disabled={locked || !team.hasApprovedData}
        className="min-w-0 space-y-5"
      >
        {(["A", "B", "C"] as const).map((group) => (
          <section key={group} className="border-t border-slate-700 pt-4">
            <h4 className="text-sm font-semibold">
              {group} · {groups[group]}得分
            </h4>
            <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {scoreKeys
                .filter((key) => incentiveScoreFields[key].group === group)
                .map((key) => (
                  <NumericCorrection
                    key={key}
                    label={group + " · " + incentiveScoreFields[key].label}
                    max={incentiveScoreFields[key].max}
                    automatic={
                      team.hasApprovedData ? team.automaticScores[key] : null
                    }
                    value={draft.scores[key] ?? ""}
                    onChange={(value) =>
                      change({ scores: { ...draft.scores, [key]: value } })
                    }
                  />
                ))}
            </div>
          </section>
        ))}
        <details className="border-t border-slate-700 pt-4">
          <summary className="cursor-pointer text-sm font-semibold">
            A／B／C · 来源数量修正
          </summary>
          <div className="mt-4 space-y-5">
            {(["A", "B", "C"] as const).map((group) => (
              <section key={group} className="border-t border-slate-800 pt-3">
                <h4 className="text-sm font-semibold">
                  {group} · {groups[group]}
                </h4>
                <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
                  {fieldKeys
                    .filter((key) => incentiveFields[key].group === group)
                    .map((key) => (
                      <NumericCorrection
                        key={key}
                        label={incentiveFields[key].label}
                        sourceLabel="原始数量"
                        automatic={team.proposed[key]}
                        value={draft.overrides[key] ?? ""}
                        onChange={(value) =>
                          change({
                            overrides: { ...draft.overrides, [key]: value },
                          })
                        }
                      />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </details>
        <section className="border-t border-slate-700 pt-4">
          <h4 className="text-sm font-semibold">D · 额外奖励依据</h4>
          <p className="mt-2 text-xs text-slate-400">
            仅选手／教练参与，官方账号不计入；奖金按规则自动分配。
          </p>
          <div className="mt-3 max-w-sm">
            <NumericCorrection
              label={incentiveFields.bonusVideos.label}
              sourceLabel="原始数量"
              automatic={team.proposed.bonusVideos}
              value={draft.overrides.bonusVideos ?? ""}
              onChange={(value) =>
                change({
                  overrides: { ...draft.overrides, bonusVideos: value },
                })
              }
            />
          </div>
          <div className="mt-4 space-y-4">
            {team.members.map((member) => (
              <section
                key={member.id}
                className="min-w-0 border-t border-slate-800 pt-3"
              >
                <h5 className="break-words text-sm font-medium">
                  {member.name}
                </h5>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {(["views", "posts"] as const).map((field) => (
                    <NumericCorrection
                      key={field}
                      label={
                        member.name +
                        (field === "views" ? " · 播放量" : " · 投稿数")
                      }
                      sourceLabel="当前采用"
                      automatic={member[field]}
                      value={draft.individuals[member.id]?.[field] ?? ""}
                      onChange={(value) =>
                        change({
                          individuals: {
                            ...draft.individuals,
                            [member.id]: {
                              ...draft.individuals[member.id],
                              [field]: value,
                            },
                          },
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
            {!team.members.length && (
              <p className="text-sm text-slate-400">暂无选手／教练数据。</p>
            )}
          </div>
          {!!removedMembers.length && (
            <div className="mt-3 space-y-2 text-sm text-amber-200">
              <p className="break-words">
                已不在本月名单的个人修正：{removedMembers.join("、")}
              </p>
              <button
                type="button"
                className={buttonStyle + " bg-slate-800 text-slate-200"}
                onClick={() =>
                  change({
                    individuals: Object.fromEntries(
                      Object.entries(draft.individuals).filter(
                        ([id]) => !removedMembers.includes(id),
                      ),
                    ),
                  })
                }
              >
                <Trash2 size={16} />
                移除过期成员修正
              </button>
            </div>
          )}
        </section>
        <div className="border-t border-slate-700 pt-4">
          <label htmlFor={noteId} className="block text-sm">
            复核备注及数据来源{hasCorrections ? "（必填）" : ""}
          </label>
          <textarea
            id={noteId}
            rows={3}
            className={inputStyle + " mt-2"}
            value={draft.note}
            maxLength={4000}
            required={hasCorrections}
            onChange={(event) => change({ note: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={locked || needsRebase || !team.hasApprovedData}
            className={buttonStyle + " bg-emerald-400 text-slate-950"}
          >
            <Save size={16} />
            {busy
              ? "保存中…"
              : draft.awaitingVersion
                ? "正在同步…"
                : "保存修正"}
          </button>
          {draft.dirty && (
            <button
              type="button"
              className={buttonStyle + " bg-slate-800 text-slate-200"}
              onClick={() => {
                if (!window.confirm("放弃本队未保存的修改，恢复已保存内容？"))
                  return;
                setDraft(
                  createDraft(review, sourceHash, rankingHash, revision),
                );
                setConflict(false);
                setMessage("");
                onDirty(team.teamId, false);
              }}
            >
              <Trash2 size={16} />
              放弃未保存修改
            </button>
          )}
        </div>
      </fieldset>
      {message && (
        <p
          role={error ? "alert" : "status"}
          className={
            "break-words text-sm " +
            (error ? "text-rose-300" : "text-emerald-300")
          }
        >
          {!error && !draft.awaitingVersion ? "人工修正已保存。" : message}
        </p>
      )}
    </form>
  );
}
