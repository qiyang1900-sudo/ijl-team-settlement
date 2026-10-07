export type ClubActivityItem = {
  id: string;
  link: string;
  imageUrl: string;
  imageName: string;
  imageMimeType: string;
  imageStoragePath: string;
  popular?: boolean;
  popularKind?: "online" | "offline" | "tournament";
  activityDate?: string;
  audienceCount?: string;
};

export function emptyClubActivityItem(index = 0): ClubActivityItem {
  return {
    id: `activity-${index + 1}`,
    link: "",
    imageUrl: "",
    imageName: "",
    imageMimeType: "",
    imageStoragePath: "",
  };
}

export function parseClubActivityItems({
  link,
  imageUrl,
  imageName,
  imageMimeType,
  imageStoragePath,
  keepEmpty = false,
}: {
  link?: unknown;
  imageUrl?: unknown;
  imageName?: unknown;
  imageMimeType?: unknown;
  imageStoragePath?: unknown;
  keepEmpty?: boolean;
}): ClubActivityItem[] {
  const rawLink = String(link || "").trim();
  const legacyImageUrl = String(imageUrl || "").trim();

  if (rawLink.startsWith("[") || rawLink.startsWith("{")) {
    try {
      const parsed = JSON.parse(rawLink);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const normalized = rows
        .map((row, index) => normalizeClubActivityItem(row, index))
        .filter((row) => keepEmpty || hasClubActivityContent(row));

      if (normalized.length > 0) {
        return normalized;
      }
    } catch {
      // Fall back to the legacy single-link format below.
    }
  }

  const legacy = normalizeClubActivityItem(
    {
      id: "activity-1",
      link: rawLink,
      imageUrl: legacyImageUrl,
      imageName: String(imageName || ""),
      imageMimeType: String(imageMimeType || ""),
      imageStoragePath: String(imageStoragePath || ""),
    },
    0
  );

  return hasClubActivityContent(legacy) ? [legacy] : [];
}

export function serializeClubActivityItems(items: ClubActivityItem[]) {
  const normalized = items
    .map((item, index) => normalizeClubActivityItem(item, index))
    .filter(hasClubActivityContent);

  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

export function hasClubActivityContent(item: ClubActivityItem) {
  return Boolean(
    item.link.trim() || item.imageUrl.trim() || item.imageName.trim() || item.popular
  );
}

export function getPrimaryClubActivityItem(items: ClubActivityItem[]) {
  return items.find(hasClubActivityContent) || null;
}

function normalizeClubActivityItem(value: unknown, index: number): ClubActivityItem {
  const row =
    typeof value === "object" && value !== null
      ? (value as Partial<Record<keyof ClubActivityItem, unknown>>)
      : {};

  return {
    id: String(row.id || `activity-${index + 1}`),
    link: String(row.link || "").trim(),
    imageUrl: String(row.imageUrl || "").trim(),
    imageName: String(row.imageName || "").trim(),
    imageMimeType: String(row.imageMimeType || "").trim(),
    imageStoragePath: String(row.imageStoragePath || "").trim(),
    popular: row.popular === true,
    popularKind: row.popularKind === "offline" || row.popularKind === "tournament" ? row.popularKind : "online",
    activityDate: String(row.activityDate || ""),
    audienceCount: String(row.audienceCount ?? ""),
  };
}

export function validatePopularActivities(items: ClubActivityItem[], month: string) {
  const errors: string[] = [];
  items.forEach((item, index) => {
    if (!item.popular) return;
    const prefix = `クラブ活動 ${index + 1}`;
    const date = new Date(`${item.activityDate}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.activityDate || !item.activityDate?.startsWith(`${month}-`)) errors.push(`${prefix}：対象月内の実施日を入力してください。`);
    if (!/^\d+$/.test(item.audienceCount || "") || !Number.isSafeInteger(Number(item.audienceCount))) errors.push(`${prefix}：視聴数・参加人数を0以上の整数で入力してください。`);
    if (!item.link.trim() && !item.imageUrl && !item.imageName) errors.push(`${prefix}：人気イベント申請のリンクまたは証明画像を添付してください。`);
  });
  return errors;
}
