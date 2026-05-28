"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

type MonthOption = {
  value: string;
  label: string;
};

export default function RosterSyncPanel({
  action,
  monthOptions,
  defaultMonth,
  syncedMonth,
  syncedDeadline,
}: {
  action: (formData: FormData) => void | Promise<void>;
  monthOptions: MonthOption[];
  defaultMonth: string;
  syncedMonth?: string;
  syncedDeadline?: string;
}) {
  const [targetMonth, setTargetMonth] = useState(defaultMonth);
  const defaultDeadline = useMemo(
    () => buildDefaultDeadlineParts(targetMonth),
    [targetMonth]
  );

  useEffect(() => {
    if (syncedMonth) {
      window.alert(
        `月別名簿を更新しました：${formatMonthLabel(syncedMonth)}${
          syncedDeadline ? `\n提出期限：${formatDateTime(syncedDeadline)}` : ""
        }`
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [syncedDeadline, syncedMonth]);

  return (
    <details
      open={Boolean(syncedMonth)}
      className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5"
    >
      <summary className="cursor-pointer select-none text-xl font-bold">
        月别名单生成
      </summary>
      <p className="mt-3 text-sm text-slate-400">
        转会期后先用下拉框调整选手所属俱乐部，再把当前名单同步为指定月份名单。
      </p>

      {syncedMonth ? (
        <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100">
          已修改：{formatMonthLabel(syncedMonth)} 的月别名单。
          {syncedDeadline ? (
            <span className="ml-2">
              提交截止时间：{formatDateTime(syncedDeadline)}
            </span>
          ) : null}
        </div>
      ) : null}

      <form
        action={action}
        className="mt-4 grid gap-3 lg:grid-cols-[180px_1fr_auto] lg:items-end"
        onSubmit={(event) => {
          const formData = new FormData(event.currentTarget);
          const month = String(formData.get("target_month") || defaultMonth);
          const deadlineText = [
            formData.get("deadline_year"),
            formData.get("deadline_month"),
            formData.get("deadline_day"),
          ]
            .filter(Boolean)
            .join("/");
          const confirmed = window.confirm(
            `确定要按当前所属生成 ${formatMonthLabel(month)} 的月别名单吗？\n提交截止日期：${deadlineText}\n\n如果这个月份已经有名单，会被当前所属名单覆盖。`
          );

          if (!confirmed) {
            event.preventDefault();
          }
        }}
      >
        <label className="block text-sm text-slate-300">
          目标月份
          <select
            name="target_month"
            value={targetMonth}
            onChange={(event) => setTargetMonth(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white"
          >
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <p className="text-sm text-slate-300">月数据提交截止时间</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Select
              name="deadline_year"
              label="年"
              options={buildYearOptions(targetMonth)}
              value={defaultDeadline.year}
            />
            <Select
              name="deadline_month"
              label="月"
              options={buildNumberOptions(1, 12)}
              value={defaultDeadline.month}
            />
            <Select
              name="deadline_day"
              label="日"
              options={buildNumberOptions(
                1,
                getDaysInMonth(defaultDeadline.year, defaultDeadline.month)
              )}
              value={defaultDeadline.day}
            />
            <Select
              name="deadline_hour"
              label="時"
              options={buildNumberOptions(0, 23)}
              value={defaultDeadline.hour}
            />
            <Select
              name="deadline_minute"
              label="分"
              options={[0, 15, 30, 45, 59]}
              value={defaultDeadline.minute}
            />
          </div>
        </div>
        <SubmitButton />
      </form>
    </details>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      className="rounded-lg bg-indigo-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "生成中..." : "按当前所属生成名单"}
    </button>
  );
}

function Select({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: number[];
  value: number;
}) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <select
        key={`${name}-${value}-${options.length}`}
        name={name}
        defaultValue={value}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-white outline-none focus:border-white"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {String(option).padStart(2, "0")}
          </option>
        ))}
      </select>
    </label>
  );
}

function buildDefaultDeadlineParts(monthValue: string) {
  const [yearValue, monthPart] = monthValue.split("-").map(Number);
  const year = Number.isFinite(yearValue) ? yearValue : new Date().getFullYear();
  const month = Number.isFinite(monthPart) ? monthPart : new Date().getMonth() + 1;

  return {
    year,
    month,
    day: getDaysInMonth(year, month),
    hour: 23,
    minute: 59,
  };
}

function buildYearOptions(monthValue: string) {
  const [yearValue] = monthValue.split("-").map(Number);
  const year = Number.isFinite(yearValue) ? yearValue : new Date().getFullYear();

  return [year - 1, year, year + 1];
}

function buildNumberOptions(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatMonthLabel(monthValue: string) {
  const [year, month] = monthValue.split("-");

  if (!year || !month) {
    return monthValue;
  }

  return `${year}年${month}月`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
