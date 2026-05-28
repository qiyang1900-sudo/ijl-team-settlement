import { formatMonthLabel } from "./monthly-data";

export type MonthOption = {
  value: string;
  label: string;
};

export function addMonths(monthValue: string, offset: number) {
  const [year, month] = monthValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getCurrentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

export function buildMonthOptions(
  sourceMonths: Array<string | null | undefined>,
  options: { includeRelativeMonths?: boolean; descending?: boolean } = {}
): MonthOption[] {
  const currentMonth = getCurrentMonthValue();
  const months = new Set(
    sourceMonths
      .map((month) => String(month || "").slice(0, 7))
      .filter((month) => /^\d{4}-\d{2}$/.test(month))
  );

  months.add(currentMonth);

  if (options.includeRelativeMonths !== false) {
    for (let index = -18; index <= 6; index += 1) {
      months.add(addMonths(currentMonth, index));
    }
  }

  const sorted = Array.from(months).sort();

  if (options.descending !== false) {
    sorted.reverse();
  }

  return sorted.map((value) => ({ value, label: formatMonthLabel(value) }));
}

export function normalizeMonthRange({
  from,
  to,
  availableMonths,
}: {
  from?: string;
  to?: string;
  availableMonths: string[];
}) {
  const sortedMonths = Array.from(
    new Set(
      availableMonths
        .map((month) => String(month || "").slice(0, 7))
        .filter((month) => /^\d{4}-\d{2}$/.test(month))
    )
  ).sort();
  const currentMonth = getCurrentMonthValue();
  const latestMonth = sortedMonths.at(-1) || currentMonth;
  let toMonth = /^\d{4}-\d{2}$/.test(String(to || "")) ? String(to) : latestMonth;
  let fromMonth = /^\d{4}-\d{2}$/.test(String(from || ""))
    ? String(from)
    : addMonths(toMonth, -5);

  if (fromMonth > toMonth) {
    [fromMonth, toMonth] = [toMonth, fromMonth];
  }

  return { fromMonth, toMonth };
}
