"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ClipboardCheck, RotateCcw, Save, X } from "lucide-react";
import { operatingFields, operatingGroups, operatingGrade, type OperatingField, type OperatingGroup, type OperatingInputs, type OperatingResult, type OperatingReview } from "@/lib/operating-score";

const groupKeys = Object.keys(operatingGroups) as OperatingGroup[];
const statuses: Record<string, string> = { not_submitted: "未提交", draft: "未提交（草稿）", returned: "已退回待补充", submitted: "月数据待审核", reviewing: "月数据审核中", approved: "月数据已通过" };
const time = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo", hour12: false });
const revision = (review?: OperatingReview) => review?.updated_at ?? null;

export default function OperatingScoreBoard({ month, results, reviews, hashes }: {
  month: string; results: OperatingResult[]; reviews: OperatingReview[]; hashes: Record<string, string>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [selected, setSelected] = useState(results.find((team) => team.hasSubmittedData)?.teamId ?? "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const selectedTeam = results.find((team) => team.teamId === selected);
  function close() {
    if (busy || (dirty && !window.confirm("有未保存的评分修改，确定放弃并关闭吗？"))) return;
    setDirty(false);
    setOpened(false);
    dialog.current?.close();
  }
  const reviewStatus = (team: OperatingResult, review?: OperatingReview) =>
    !team.hasSubmittedData ? statuses[team.submissionStatus] ?? "未提交" :
    review && review.source_hash !== hashes[team.teamId] ? "来源已更新 · 需重新复核" :
    review?.status === "reviewed" ? "已复核" : review ? "已保存评分草稿" : "自动计算 · 未复核";
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 py-4">
      <p className="text-sm text-slate-300">已提交 {results.filter((team) => team.hasSubmittedData).length} / {results.length} 队
        <span className="ml-4 text-emerald-300">已复核 {results.filter((team) => reviews.some((review) => review.team_id === team.teamId && review.status === "reviewed" && review.source_hash === hashes[team.teamId]) && team.hasSubmittedData).length} 队</span></p>
      <button onClick={() => { setOpened(true); dialog.current?.showModal(); }} disabled={!results.some((team) => team.hasSubmittedData)} className="flex items-center gap-2 rounded bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"><ClipboardCheck size={17} />人工复核</button>
    </div>
    <div className="grid items-start gap-4 py-5 lg:grid-cols-2">
      {results.map((team) => {
        const review = reviews.find((row) => row.team_id === team.teamId);
        return <article key={team.teamId} className="min-w-0 rounded-lg border border-slate-700 bg-slate-900/70">
          <header className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0"><h2 className="text-lg font-bold">{team.shortName}</h2><p className="mt-1 break-words text-xs text-slate-400">{team.name}</p>
              <p className="mt-2 text-xs text-amber-200">{reviewStatus(team, review)}</p>
              {team.hasSubmittedData && <p className="mt-1 text-xs text-slate-400">{statuses[team.submissionStatus]}</p>}
            </div>
            <p className="shrink-0 text-right text-2xl font-bold tabular-nums">{team.total ?? "—"}<span className="ml-2 text-base text-emerald-300">{team.grade}</span><span className="block text-xs font-normal text-slate-400">/ 100</span></p>
          </header>
          <dl className="grid grid-cols-3 gap-3 border-t border-slate-700 p-4 sm:grid-cols-5">
            {groupKeys.map((group) => <div key={group} className="min-w-0">
              <dt className="min-h-10 break-words text-xs leading-5 text-slate-400">{operatingGroups[group].label}</dt>
              <dd className="mt-1 font-semibold tabular-nums">{team.hasSubmittedData ? team.groups[group] : "—"}<span className="text-xs font-normal text-slate-400">/{operatingGroups[group].max}</span></dd>
            </div>)}
          </dl>
          {team.hasSubmittedData && <details className="group border-t border-slate-700">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold"><span>评分明细与扣分依据</span><span className="ml-auto text-xs text-amber-200">{team.deductions.length ? team.deductions.length + "项扣分" : "满分"}</span><ChevronDown size={16} className="shrink-0 group-open:rotate-180" /></summary>
            <div className="max-h-[60vh] overflow-y-auto overscroll-contain px-4 pb-4">
              {team.deductions.length > 0 && <div className="space-y-2 border-t border-slate-700 py-3 text-xs leading-5 text-amber-200">
                {team.deductions.map((reason, i) => <p key={i}>{reason}</p>)}
                <p className="text-slate-400">YouTube、TikTok、X各板块最低0分；实际总扣分以板块封底后为准。</p>
              </div>}
              {groupKeys.map((group) => <details key={group} className="group/item border-t border-slate-700">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold"><span>{operatingGroups[group].label}</span><span className="ml-auto tabular-nums">{team.groups[group]}/{operatingGroups[group].max}</span><ChevronDown size={15} className="shrink-0 group-open/item:rotate-180" /></summary>
                {group === "x" && <p className="pb-3 text-xs text-slate-400">基础5分＋官推达标10分，违规另扣，最低0分。</p>}
                {team.items.filter((item) => operatingFields[item.key].group === group).map((item) => <div key={item.key} className="border-t border-slate-800 py-3 text-xs leading-5">
                  <div className="flex justify-between gap-3 font-semibold"><span>{operatingFields[item.key].label}</span><span className="shrink-0 tabular-nums">{item.score}分{item.adjusted ? " · 人工修正" : item.manual ? " · 默认符合" : " · 自动"}</span></div>
                  <p className="mt-1 text-slate-400">{item.reason}</p>
                  {item.missing && <p className="mt-1 text-amber-200">部分来源未填或同步异常，未按真实0补写；本次按已确认数量计分。</p>}
                  {item.adjusted && <p className="mt-1 text-amber-200">人工复核：自动 {item.auto} → {item.score}。{team.note}</p>}
                </div>)}
              </details>)}
              {review && <details className="border-t border-slate-700 py-3 text-xs">
                <summary className="cursor-pointer">已保存记录 · {time(review.updated_at)}（日本时间）</summary>
                <p className="mt-3">保存时：{review.result.total} 分 / {review.result.grade} · {review.status === "reviewed" ? "已复核" : "草稿"}</p>
                {review.inputs.note && <p className="mt-2 whitespace-pre-wrap">{review.inputs.note}</p>}
              </details>}
            </div>
          </details>}
        </article>;
      })}
    </div>
    <dialog ref={dialog} aria-labelledby={title} onCancel={(event) => { event.preventDefault(); close(); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_24px)] max-w-[900px] overflow-y-auto rounded-lg border border-slate-600 bg-slate-950 p-0 text-white backdrop:bg-black/70">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-950 p-4">
        <h2 id={title} className="text-lg font-semibold">運営方針 · 人工复核</h2>
        <button type="button" aria-label="关闭人工复核" title="关闭" onClick={close} disabled={busy} className="rounded p-2 hover:bg-slate-800 disabled:opacity-40"><X size={20} /></button>
      </header>
      <div className="p-4">
        <label className="flex items-center gap-3 text-sm">战队
          <select value={selected} disabled={busy} onChange={(event) => {
            if (dirty && !window.confirm("切换战队会放弃未保存的修改，确定切换吗？")) return;
            setDirty(false); setSelected(event.target.value);
          }} className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-3 py-2">
            {results.filter((team) => team.hasSubmittedData).map((team) => <option value={team.teamId} key={team.teamId}>{team.shortName} · {month}</option>)}
          </select>
        </label>
        {opened && selectedTeam && <ReviewForm key={selected} team={selectedTeam} sourceHash={hashes[selected]} review={reviews.find((row) => row.team_id === selected)} onDirty={setDirty} onBusy={setBusy} />}
      </div>
    </dialog>
  </>;
}

function ReviewForm({ team, sourceHash, review, onDirty, onBusy }: {
  team: OperatingResult; sourceHash: string; review?: OperatingReview;
  onDirty: (value: boolean) => void; onBusy: (value: boolean) => void;
}) {
  const router = useRouter();
  const [initial] = useState({ sourceHash, version: revision(review) });
  const [version, setVersion] = useState(initial.version);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(team.items.map((item) => [item.key, String(Math.abs(item.score))])));
  const [note, setNote] = useState(review?.inputs.note ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const stale = sourceHash !== initial.sourceHash || (revision(review) !== initial.version && revision(review) !== version);
  const fieldValue = (key: OperatingField) => Number(values[key]) * (operatingFields[key].min < 0 ? -1 : 1);
  const total = groupKeys.reduce((total, group) => total + Math.max(0, Math.min(operatingGroups[group].max,
    team.items.filter((item) => operatingFields[item.key].group === group).reduce((sum, item) => sum + fieldValue(item.key), group === "x" ? 5 : 0))), 0);
  const valid = team.items.every((item) => /^\d+$/.test(values[item.key]) && fieldValue(item.key) >= operatingFields[item.key].min && fieldValue(item.key) <= operatingFields[item.key].max);
  const change = () => { onDirty(true); setConfirmed(false); setMessage(""); };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const status = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "reviewed" ? "reviewed" : "draft";
    if (!valid || stale || busy) return;
    const inputs: OperatingInputs = { scores: {}, note };
    for (const item of team.items) if (fieldValue(item.key) !== item.auto) inputs.scores[item.key] = fieldValue(item.key);
    setBusy(true); onBusy(true); setError(false); setMessage("");
    try {
      const response = await fetch("/api/admin/operating-scores", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: team.month, teamId: team.teamId, status, inputs, sourceHash: initial.sourceHash, reviewVersion: version, confirmed }) });
      const data = await response.json().catch(() => ({ error: "服务器未返回有效结果，输入内容已保留，请稍后重试。" }));
      if (!response.ok || !data.success) throw new Error(data.error || "保存失败，输入内容已保留。");
      setVersion(data.reviewVersion); onDirty(false); setMessage(data.message); router.refresh();
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "网络异常，输入内容已保留。"); }
    finally { setBusy(false); onBusy(false); }
  }
  return <form onSubmit={save} className="mt-4 space-y-4">
    <div className="flex justify-between border-y border-slate-700 py-3 text-sm"><span>{team.month} · {team.shortName}</span><strong className="tabular-nums">{valid ? total + " 分 / " + operatingGrade(total) : "请检查输入"}</strong></div>
    {stale && <p role="alert" className="text-sm text-amber-200">资料或保存记录已变化，未覆盖你的输入。关闭后刷新页面，再重新打开复核。</p>}
    {groupKeys.map((group) => <section key={group} className="border-t border-slate-700 pt-3">
      <h3 className="text-sm font-semibold">{operatingGroups[group].label} <span className="font-normal text-slate-400">/ {operatingGroups[group].max}</span></h3>
      {team.items.filter((item) => operatingFields[item.key].group === group).map((item) => {
        const rule = operatingFields[item.key], penalty = rule.min < 0, id = "score-" + item.key;
        return <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_100px_32px] items-center gap-2 border-b border-slate-800 py-3 sm:gap-4">
          <div className="min-w-0"><label htmlFor={id} className="break-words text-sm">{rule.label}</label><p className="mt-1 text-xs text-slate-400">{item.manual ? "默认" : "自动"} {penalty ? "扣" + Math.abs(item.auto) : item.auto}分 · {penalty ? "扣分" : "得分"} 0～{penalty ? -rule.min : rule.max}</p></div>
          <input id={id} type="number" inputMode="numeric" min={0} max={penalty ? -rule.min : rule.max} step={1} required disabled={busy}
            value={values[item.key]} onChange={(e) => { setValues({ ...values, [item.key]: e.target.value }); change(); }}
            className="w-full min-w-0 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-right tabular-nums" />
          <button type="button" disabled={busy} title="恢复自动值" aria-label={rule.label + " 恢复自动值"} onClick={() => { setValues({ ...values, [item.key]: String(Math.abs(item.auto)) }); change(); }} className="p-1.5 text-slate-400 hover:text-white"><RotateCcw size={17} /></button>
        </div>;
      })}
    </section>)}
    <label className="block text-sm">审核备注<textarea rows={3} maxLength={4000} value={note} disabled={busy} onChange={(e) => { setNote(e.target.value); change(); }} className="mt-2 w-full rounded border border-slate-600 bg-slate-900 p-3" /></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" /><span>已核对自动计分、人工判断项目与扣分原因</span></label>
    {message && <p role={error ? "alert" : "status"} className={error ? "text-sm text-red-300" : "text-sm text-emerald-300"}>{message}</p>}
    <footer className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-slate-700 bg-slate-950 py-3">
      <button type="submit" value="draft" disabled={busy || stale || !valid} className="flex items-center gap-2 rounded border border-slate-500 px-3 py-2 text-sm disabled:opacity-40"><Save size={16} />{busy ? "保存中…" : "保存草稿"}</button>
      <button type="submit" value="reviewed" disabled={busy || stale || !valid || !confirmed} className="flex items-center gap-2 rounded bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"><ClipboardCheck size={16} />确认已复核</button>
    </footer>
  </form>;
}
