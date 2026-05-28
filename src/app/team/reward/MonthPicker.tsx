"use client";

import { useMemo, useState } from "react";

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function addMonths(monthValue: string, offset: number) {
  const [year, month] = monthValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${nextYear}-${nextMonth}`;
}

export default function MonthPicker({
  teamId,
  selectedMonth,
}: {
  teamId: string;
  selectedMonth: string;
}) {
  const initialMonth = selectedMonth || getCurrentMonth();
  const [month, setMonth] = useState(initialMonth);
  const monthHref = useMemo(
    () =>
      `/team/reward?teamId=${encodeURIComponent(teamId)}&month=${encodeURIComponent(
        month || getCurrentMonth()
      )}`,
    [month, teamId]
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold">新しい月を入力</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        入力したい月を選択して、新しい月データを作成できます。
      </p>

      <div className="mt-3 flex gap-2">
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <a
          href={monthHref}
          className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          開く
        </a>
      </div>

      <div className="mt-3 flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month || getCurrentMonth(), -1))}
          className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:border-slate-400"
        >
          前月
        </button>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month || getCurrentMonth(), 1))}
          className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:border-slate-400"
        >
          翌月
        </button>
      </div>
    </section>
  );
}
