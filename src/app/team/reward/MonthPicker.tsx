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

function buildMonthOptions(selectedMonth: string) {
  const currentMonth = getCurrentMonth();
  const months = new Set<string>([selectedMonth, currentMonth]);

  for (let index = 1; index <= 6; index += 1) {
    months.add(addMonths(currentMonth, index));
  }

  for (let index = 0; index < 12; index += 1) {
    months.add(addMonths(currentMonth, -index));
  }

  return Array.from(months)
    .filter(Boolean)
    .sort()
    .reverse();
}

function formatMonthLabel(monthValue: string) {
  const [year, month] = monthValue.split("-");

  return `${year}年${month}月`;
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
  const monthOptions = useMemo(
    () => buildMonthOptions(initialMonth),
    [initialMonth]
  );
  const monthHref = useMemo(
    () =>
      `/team/reward?teamId=${encodeURIComponent(teamId)}&month=${encodeURIComponent(
        month || getCurrentMonth()
      )}`,
    [month, teamId]
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold">対象月を選択</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        管理者が月別選手リストを先に発行した月は、未来月もここから入力できます。
        未提出の過去月も補足できます。
      </p>

      <div className="mt-3 flex gap-2">
        <select
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        >
          {monthOptions.map((monthOption) => (
            <option key={monthOption} value={monthOption}>
              {formatMonthLabel(monthOption)}
            </option>
          ))}
        </select>
        <a
          href={monthHref}
          className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          開く
        </a>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        表示される選手リストは管理者側の選手管理と連動します。
      </p>
    </section>
  );
}
