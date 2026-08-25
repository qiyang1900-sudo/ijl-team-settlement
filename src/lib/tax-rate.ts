export type SettlementTaxRate = 0 | 0.1;

const DEFAULT_TAX_RATE: SettlementTaxRate = 0.1;

export function normalizeTaxRate(value: unknown): SettlementTaxRate {
  return Number(value) === 0 ? 0 : DEFAULT_TAX_RATE;
}

export function formatTaxRate(taxRate: SettlementTaxRate) {
  return taxRate === 0 ? "0%" : "10%";
}

export function createTaxRateNote(taxRate: SettlementTaxRate) {
  return `tax_rate:${taxRate}`;
}

export function createSettlementDetailNote({
  taxRate,
  reportTotalAmount,
}: {
  taxRate: SettlementTaxRate;
  reportTotalAmount?: number | null;
}) {
  const parts = [createTaxRateNote(taxRate)];
  const normalizedReportTotal = normalizeReportTotalAmount(reportTotalAmount);

  if (normalizedReportTotal !== null) {
    parts.push(`report_total:${normalizedReportTotal}`);
  }

  return parts.join(";");
}

export function getTaxRateFromRows(rows?: Array<{ note?: unknown }> | null) {
  const note = rows
    ?.map((row) => String(row?.note || ""))
    .find((value) => value.includes("tax_rate:"));

  if (!note) {
    return DEFAULT_TAX_RATE;
  }

  const match = note.match(/tax_rate:(0(?:\.0)?|0\.1)/);

  return normalizeTaxRate(match?.[1]);
}

export function getReportTotalAmountFromRows(
  rows?: Array<{ note?: unknown }> | null
) {
  const note = rows
    ?.map((row) => String(row?.note || ""))
    .find((value) => value.includes("report_total:"));

  if (!note) {
    return null;
  }

  const match = note.match(/report_total:(-?\d+(?:\.\d+)?)/);
  const amount = Number(match?.[1]);

  return normalizeReportTotalAmount(amount);
}

function normalizeReportTotalAmount(value: unknown) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount);
}
