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
  options: {
    includeRelativeMonths?: boolean;
    descending?: boolean;
    includeFutureMonths?: boolean;
    includeCurrentMonth?: boolean;
    maxMonth?: string;
  } = {}
): MonthOption[] {
  const currentMonth = getCurrentMonthValue();
  const maxMonth =
    /^\d{4}-\d{2}$/.test(String(options.maxMonth || ""))
      ? String(options.maxMonth)
      : currentMonth;
  const months = new Set(
    sourceMonths
      .map((month) => String(month || "").slice(0, 7))
      .filter((month) => /^\d{4}-\d{2}$/.test(month))
      .filter((month) => month <= maxMonth)
  );

  if (options.includeCurrentMonth !== false && currentMonth <= maxMonth) {
    months.add(currentMonth);
  }

  if (options.includeRelativeMonths !== false) {
    const futureLimit = options.includeFutureMonths ? 6 : 0;

    for (let index = -18; index <= futureLimit; index += 1) {
      const month = addMonths(currentMonth, index);

      if (month <= maxMonth) {
        months.add(month);
      }
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
  maxMonth,
}: {
  from?: string;
  to?: string;
  availableMonths: string[];
  maxMonth?: string;
}) {
  const currentMonth = getCurrentMonthValue();
  const safeMaxMonth =
    /^\d{4}-\d{2}$/.test(String(maxMonth || "")) ? String(maxMonth) : currentMonth;
  const sortedMonths = Array.from(
    new Set(
      availableMonths
        .map((month) => String(month || "").slice(0, 7))
        .filter((month) => /^\d{4}-\d{2}$/.test(month))
        .filter((month) => month <= safeMaxMonth)
    )
  ).sort();
  const latestMonth = sortedMonths.at(-1) || safeMaxMonth;
  let toMonth = /^\d{4}-\d{2}$/.test(String(to || "")) ? String(to) : latestMonth;
  let fromMonth = /^\d{4}-\d{2}$/.test(String(from || ""))
    ? String(from)
    : addMonths(toMonth, -5);

  if (toMonth > safeMaxMonth) {
    toMonth = safeMaxMonth;
  }

  if (fromMonth > safeMaxMonth) {
    fromMonth = safeMaxMonth;
  }

  if (fromMonth > toMonth) {
    [fromMonth, toMonth] = [toMonth, fromMonth];
  }

  return { fromMonth, toMonth };
}
