function hasExplicitTimezone(value: string) {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const trimmed = value.trim();
  const normalized =
    trimmed.includes("T") && !hasExplicitTimezone(trimmed)
      ? `${trimmed}+09:00`
      : trimmed;
  const date = new Date(normalized);

  if (!Number.isFinite(date.getTime())) {
    return trimmed || "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(date);
}
