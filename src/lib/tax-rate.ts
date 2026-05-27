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
