// Each caller supplies a stable order so later pages cannot skip or repeat rows.
export async function readAllRows<T, E>(
  readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: E | null; count?: number | null }>,
) {
  const rows: T[] = [];
  for (;;) {
    const result = await readPage(rows.length, rows.length + 499);
    if (result.error) return { data: null, error: result.error };
    const page = result.data || [];
    if (!page.length) return { data: rows, error: null };
    rows.push(...page);
    if (typeof result.count === "number" && rows.length >= result.count) return { data: rows, error: null };
  }
}
