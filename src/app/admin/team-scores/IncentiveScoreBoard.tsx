"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Save, ChevronDown, AlertCircle } from "lucide-react";
import {
  incentiveFields,
  rankingFields,
  type IncentiveField,
  type IncentiveMonthResult,
  type IncentiveReview,
  type IncentiveTeamResult,
} from "@/lib/incentive-score";
import type { IncentiveSnapshot } from "@/lib/incentive-store";

const number = (value: number | null | undefined) =>
  value == null ? "待补充" : value.toLocaleString("ja-JP");
const yen = (value: number) => `¥${number(value)}`;
const fieldKeys = Object.keys(incentiveFields) as IncentiveField[];
const inputStyle =
  "min-w-0 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-white focus:border-sky-400 focus:outline-none";
const buttonStyle =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed";

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
    throw new Error(data.error || "保存失败，输入已保留。");
  return data as { message: string; reviewVersion?: string };
}

export default function IncentiveScoreBoard({
  result,
  reviews,
  hashes,
  sourceHash,
  snapshot,
  evidence,
  legacy,
}: {
  result: IncentiveMonthResult;
  reviews: IncentiveReview[];
  hashes: Record<string, string>;
  sourceHash: string;
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
  const [dirty, setDirty] = useState<Set<string>>(new Set());
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
  const reviewed = approved.filter((team) =>
    reviews.some(
      (review) =>
        review.team_id === team.teamId &&
        review.status === "reviewed" &&
        review.source_hash === hashes[team.teamId],
    ),
  );
  const ready =
    approved.length > 0 &&
    reviewed.length === approved.length &&
    !result.incomplete &&
    dirty.size === 0;
  const sorted = [...approved].sort(
    (a, b) => (b.total ?? -1) - (a.total ?? -1),
  );
  const setTeamDirty = (teamId: string, value: boolean) => {
    setDirty((current) => {
      const next = new Set(current);
      if (value) next.add(teamId);
      else next.delete(teamId);
      return next;
    });
    setConfirmed(false);
  };
  async function finalize() {
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
      router.refresh();
    } catch (error) {
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
              {result.incomplete || reviewed.length !== approved.length
                ? "待复核"
                : "可结算"}
            </span>
          </h2>
          <p className="text-sm text-slate-300">
            月数据已通过 {approved.length} 队 · 复核完成 {reviewed.length} 队 ·
            A 达标 {approved.filter((team) => team.eligible).length} 队
          </p>
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
                    {!team.eligible
                      ? "不参评"
                      : result.scoreIncomplete
                        ? "待计算"
                        : (team.rank ?? "五名外")}
                  </td>
                  <th className="px-3 py-3">{team.shortName}</th>
                  <td className="px-3 py-3">{number(team.a.score)}</td>
                  <td className="px-3 py-3">
                    {team.eligible ? number(team.b.score) : "—"}
                  </td>
                  <td className="px-3 py-3">
                    {team.eligible ? number(team.c.score) : "—"}
                  </td>
                  <td className="px-3 py-3 font-bold">{number(team.total)}</td>
                  <td className="px-3 py-3">
                    {!result.prizeEnabled
                      ? "未实施"
                      : result.scoreIncomplete
                        ? "待计算"
                        : yen(team.prize.ranking)}
                  </td>
                  <td className="px-3 py-3">
                    {!result.prizeEnabled
                      ? "未实施"
                      : result.prizeIncomplete
                        ? "待计算"
                        : yen(
                            team.prize.views +
                              team.prize.posts +
                              team.prize.popular,
                          )}
                  </td>
                  <td className="px-3 py-3">
                    {!result.prizeEnabled
                      ? "未实施"
                      : result.incomplete
                        ? "待计算"
                        : yen(team.prize.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!approved.length && (
          <p className="py-6 text-slate-400">本月暂无审核通过的月数据。</p>
        )}
        {result.incomplete && (
          <p className="mt-3 flex items-start gap-2 text-sm text-amber-300">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            尚有缺失数据，B 为暂算；空白、异常值不作为
            0。最终排名及对应奖金在资料齐全后确认。
          </p>
        )}
        {!!excluded.length && (
          <p className="mt-3 text-sm text-slate-400">
            暂无已通过月数据，未纳入本次计算：
            {excluded.map((team) => team.shortName).join("、")}
          </p>
        )}
      </section>

      <div className="grid items-start gap-5 py-6 xl:grid-cols-2">
        {result.teams.map((team) => (
          <TeamCard
            key={`${result.month}:${team.teamId}`}
            team={team}
            review={reviews.find((review) => review.team_id === team.teamId)}
            sourceHash={hashes[team.teamId]}
            month={result.month}
            prizeEnabled={result.prizeEnabled}
            evidence={evidence[team.teamId]}
            onDirty={setTeamDirty}
          />
        ))}
      </div>

      <section className="border-t border-slate-700 py-6">
        <h2 className="text-lg font-bold">月度结算</h2>
        {result.prizeEnabled && (
          <p className="mt-3 text-sm text-slate-300">
            {result.incomplete
              ? "奖金待计算"
              : `本次分配 ${yen(result.allocated)} · 不分配／舍去尾数 ${yen(result.unallocated)}`}{" "}
            · 月度上限 ¥2,000,000
          </p>
        )}
        <label className="mt-4 flex items-start gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0"
            checked={confirmed && confirmationHash === sourceHash}
            disabled={!ready || busy}
            onChange={(event) => {
              setConfirmed(event.target.checked);
              setConfirmationHash(sourceHash);
            }}
          />
          <span>
            已核对参评战队、排名及奖金。未通过月数据的战队不参与本次结算，空缺名次及未达标专项奖金不分配。
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
            {dirty.size
              ? `${dirty.size} 队有未保存修改`
              : !ready
                ? "请先补齐数据并完成各队复核"
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

function TeamCard({
  team,
  review,
  sourceHash,
  month,
  prizeEnabled,
  evidence,
  onDirty,
}: {
  team: IncentiveTeamResult;
  review?: IncentiveReview;
  sourceHash: string;
  month: string;
  prizeEnabled: boolean;
  evidence: ReactNode;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(review?.inputs.overrides || {}).map(([key, value]) => [
        key,
        String(value ?? ""),
      ]),
    ),
  );
  const [individuals, setIndividuals] = useState<
    Record<string, { views?: string; posts?: string }>
  >(() =>
    Object.fromEntries(
      Object.entries(review?.inputs.individuals || {}).map(([id, value]) => [
        id,
        { views: String(value.views ?? ""), posts: String(value.posts ?? "") },
      ]),
    ),
  );
  const [note, setNote] = useState(review?.inputs.note || "");
  const [initialHash] = useState(sourceHash);
  const [reviewVersion, setReviewVersion] = useState(
    review?.updated_at || null,
  );
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const changed = () => {
    setDirty(true);
    setConfirmed(false);
    onDirty(team.teamId, true);
    setMessage("");
  };
  const stale = Boolean(review && review.source_hash !== sourceHash);
  const status = !team.hasApprovedData
    ? "等待月数据通过"
    : dirty
      ? "未保存修改"
      : stale
        ? "数据变化，需重新复核"
        : review?.status === "reviewed"
          ? "已人工复核"
          : "待人工复核";
  async function save(reviewed: boolean) {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const cleanedIndividuals = Object.fromEntries(
        Object.entries(individuals)
          .map(([id, values]) => [
            id,
            Object.fromEntries(
              Object.entries(values).filter(([, value]) => value !== ""),
            ),
          ])
          .filter(([, value]) => Object.keys(value).length),
      );
      const data = await post({
        action: "save",
        month,
        teamId: team.teamId,
        sourceHash: initialHash,
        reviewVersion,
        inputs: { overrides, individuals: cleanedIndividuals, note },
        reviewed,
        confirmed,
      });
      setReviewVersion(data.reviewVersion || null);
      setDirty(false);
      setConfirmed(false);
      onDirty(team.teamId, false);
      setMessage(data.message);
      router.refresh();
    } catch (error) {
      setError(true);
      setMessage(
        error instanceof Error ? error.message : "保存失败，输入已保留。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="min-w-0 rounded-lg border border-slate-700 bg-slate-900/70">
      <header className="flex items-start justify-between gap-4 border-b border-slate-700 p-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold break-words">{team.shortName}</h2>
          <p className="mt-1 text-sm text-slate-400 break-words">
            {team.teamName}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-amber-200">{status}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {number(team.total)}
            <span className="ml-1 text-xs font-normal text-slate-400">分</span>
          </p>
        </div>
      </header>
      <div className="grid grid-cols-3 divide-x divide-slate-700 px-3 py-5">
        {[
          ["A 基础", team.a.score, "/ 60"],
          ["B 排名", team.eligible ? team.b.score : null, "/ 50"],
          ["C 成长", team.eligible ? team.c.score : null, ""],
        ].map(([label, score, max]) => (
          <div key={String(label)} className="px-3">
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {number(score as number | null)}{" "}
              <span className="text-xs font-normal text-slate-400">{max}</span>
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-800 px-5 py-3 text-xs text-slate-300">
        <span>YT {number(team.a.youtube)}/30</span>
        <span>Shorts＋TT {number(team.a.shorts)}/15</span>
        <span>X {number(team.a.x)}/15</span>
        <span className={team.eligible ? "text-emerald-300" : "text-amber-300"}>
          {team.a.score === null
            ? "资格待确认"
            : team.eligible
              ? "A ≥ 45，可参评"
              : "A 未达 45，不参评"}
        </span>
      </div>
      <details className="group border-t border-slate-700">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold">
          详细数据与人工复核{" "}
          {team.missing.length > 0 && (
            <span className="ml-auto text-xs font-normal text-amber-300">
              待补 {team.missing.length} 项
            </span>
          )}
          <ChevronDown
            size={16}
            className="shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="space-y-5 px-5 pb-5">
          {!!team.a.deductions.length && (
            <div className="space-y-1 text-sm text-rose-300">
              {team.a.deductions.map((text) => (
                <p key={text}>{text}</p>
              ))}
              <p className="text-xs">YouTube 扣分合计最多 30 分。</p>
            </div>
          )}
          <p className="text-sm text-amber-200">
            需人工复核：官方视频质量、指定主题与时长、X
            原创性、人气活动及单条作品凭证。直播默认保留存档。
          </p>
          <fieldset
            disabled={busy || !team.hasApprovedData}
            className="min-w-0 space-y-5"
          >
            {(["A", "B", "C", ...(prizeEnabled ? ["D"] : [])] as string[]).map(
              (group) => (
                <details key={group} className="border-t border-slate-700 pt-3">
                  <summary className="cursor-pointer text-sm font-semibold">
                    {group} ·{" "}
                    {
                      {
                        A: "基础内容",
                        B: "联盟排名",
                        C: "成长及人气",
                        D: "额外奖励",
                      }[group]
                    }
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[300px] text-left text-xs">
                      <thead className="text-slate-400">
                        <tr>
                          <th className="py-2 pr-2">项目</th>
                          <th className="w-24 py-2 pr-2">自动读取</th>
                          <th className="w-28 py-2">人工核定数量</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fieldKeys
                          .filter((key) => incentiveFields[key].group === group)
                          .map((key) => (
                            <tr key={key} className="border-t border-slate-800">
                              <td className="py-3 pr-2">
                                <label htmlFor={`${team.teamId}-${key}`}>
                                  {incentiveFields[key].label}
                                </label>
                                {rankingFields.some(
                                  (field) => field === key,
                                ) && (
                                  <span className="mt-1 block text-sky-300">
                                    暂列{" "}
                                    {team.b.ranks[
                                      key as (typeof rankingFields)[number]
                                    ] ?? "—"}{" "}
                                    名
                                  </span>
                                )}
                              </td>
                              <td className="py-3 pr-2 tabular-nums">
                                {number(team.proposed[key])}
                              </td>
                              <td className="py-3">
                                <input
                                  id={`${team.teamId}-${key}`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  className={inputStyle}
                                  placeholder="自动"
                                  value={overrides[key] ?? ""}
                                  onChange={(event) => {
                                    setOverrides({
                                      ...overrides,
                                      [key]: event.target.value,
                                    });
                                    changed();
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {group === "B" && (
                    <p className="mt-3 text-xs text-slate-400">
                      X {team.b.x}/5 · YT {team.b.youtube}/15 · Shorts＋TT{" "}
                      {team.b.shorts}/10 · 指定视频超额 {team.b.extra}/20
                    </p>
                  )}
                  {group === "C" && (
                    <p className="mt-3 text-xs text-slate-400">
                      增粉 {team.c.growth} · 人气作品 {team.c.popular} · 活动{" "}
                      {team.c.events} 分
                    </p>
                  )}
                </details>
              ),
            )}
            {prizeEnabled && (
              <details className="border-t border-slate-700 pt-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  D · 选手／教练个人排名
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[430px] text-left text-xs">
                    <thead>
                      <tr>
                        <th className="py-2">成员</th>
                        <th className="py-2">播放 / 投稿</th>
                        <th className="w-28 p-2">核定播放</th>
                        <th className="w-28 py-2">核定投稿</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.members.map((member) => (
                        <tr
                          key={member.id}
                          className="border-t border-slate-800"
                        >
                          <td className="py-3 pr-2 break-all">{member.name}</td>
                          <td className="py-3 tabular-nums">
                            {number(member.views)} / {number(member.posts)}
                          </td>
                          {(["views", "posts"] as const).map((field) => (
                            <td
                              key={field}
                              className={field === "views" ? "p-2" : "py-2"}
                            >
                              <input
                                aria-label={`${member.name} 核定${field === "views" ? "播放" : "投稿"}`}
                                type="number"
                                min="0"
                                step="1"
                                className={inputStyle}
                                placeholder="自动"
                                value={individuals[member.id]?.[field] ?? ""}
                                onChange={(event) => {
                                  setIndividuals({
                                    ...individuals,
                                    [member.id]: {
                                      ...individuals[member.id],
                                      [field]: event.target.value,
                                    },
                                  });
                                  changed();
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  个人核定仅用于 D 奖励；如月数据有误，应先修正月数据。D 不计入
                  A＋B＋C。
                </p>
                {team.prize.winners.map((text) => (
                  <p key={text} className="mt-2 text-xs text-emerald-300">
                    {text}
                  </p>
                ))}
              </details>
            )}
            <label className="block text-sm">
              审核备注
              <textarea
                rows={3}
                className={`${inputStyle} mt-2`}
                value={note}
                maxLength={4000}
                onChange={(event) => {
                  setNote(event.target.value);
                  changed();
                }}
              />
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>已人工核对主题、时长、达标作品、活动凭证及补录来源</span>
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={`${buttonStyle} bg-slate-700 text-white`}
                disabled={busy || !team.hasApprovedData}
                onClick={() => save(false)}
              >
                <Save size={16} />
                保存草稿
              </button>
              <button
                type="button"
                className={`${buttonStyle} bg-emerald-400 text-slate-950`}
                disabled={busy || !team.hasApprovedData || !confirmed}
                onClick={() => save(true)}
              >
                <Check size={16} />
                确认本队复核
              </button>
            </div>
          </fieldset>
          {message && (
            <p
              role={error ? "alert" : "status"}
              className={`text-sm ${error ? "text-rose-300" : "text-emerald-300"}`}
            >
              {message}
            </p>
          )}
          {sourceHash !== initialHash && (
            <p role="alert" className="text-sm text-amber-300">
              源数据已更新。当前输入仍保留，请重新载入最新资料后再复核。
            </p>
          )}
          <details className="border-t border-slate-700 pt-3">
            <summary className="cursor-pointer text-sm font-semibold">
              来源及凭证
            </summary>
            <div className="mt-3 space-y-2 text-xs text-slate-400">
              {team.details.map((text, index) => (
                <p key={index}>{text}</p>
              ))}
            </div>
            <div className="mt-4 min-w-0">{evidence}</div>
          </details>
        </div>
      </details>
    </article>
  );
}
