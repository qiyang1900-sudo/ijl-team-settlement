"use client";

import { useEffect } from "react";

type MonthOption = {
  value: string;
  label: string;
};

export default function RosterSyncPanel({
  action,
  monthOptions,
  defaultMonth,
  syncedMonth,
}: {
  action: (formData: FormData) => void | Promise<void>;
  monthOptions: MonthOption[];
  defaultMonth: string;
  syncedMonth?: string;
}) {
  useEffect(() => {
    if (syncedMonth) {
      window.alert(`月別名簿を更新しました：${formatMonthLabel(syncedMonth)}`);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [syncedMonth]);

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
        </div>
      ) : null}

      <form
        action={action}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          const formData = new FormData(event.currentTarget);
          const month = String(formData.get("target_month") || defaultMonth);
          const confirmed = window.confirm(
            `确定要按当前所属生成 ${formatMonthLabel(month)} 的月别名单吗？\n\n如果这个月份已经有名单，会被当前所属名单覆盖。`
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
            defaultValue={defaultMonth}
            className="mt-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-white"
          >
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-lg bg-indigo-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-indigo-300">
          按当前所属生成名单
        </button>
      </form>
    </details>
  );
}

function formatMonthLabel(monthValue: string) {
  const [year, month] = monthValue.split("-");

  if (!year || !month) {
    return monthValue;
  }

  return `${year}年${month}月`;
}
