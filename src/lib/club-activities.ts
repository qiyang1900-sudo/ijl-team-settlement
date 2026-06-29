export type ClubActivityItem = {
  id: string;
  link: string;
  imageUrl: string;
  imageName: string;
  imageMimeType: string;
  imageStoragePath: string;
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
    item.link.trim() || item.imageUrl.trim() || item.imageName.trim()
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
  };
}
