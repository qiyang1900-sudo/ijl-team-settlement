export type ContentPlatform = "youtube" | "youtube_short" | "tiktok" | "x";
export type ContentClaim =
  | "designated"
  | "hot_video"
  | "hot_short"
  | "hot_x"
  | "bonus_video";

export type MonthlyContentEntry = {
  id: string;
  section: "designated" | "popular";
  platform: ContentPlatform;
  accountId: string;
  accountName: string;
  title: string;
  url: string;
  publishedOn: string;
  views: string;
  likes: string;
  durationSeconds: string;
  topic: "general" | "game_event";
  claims: ContentClaim[];
  imageName: string;
  imageUrl: string;
  imageMimeType: string;
  imageStoragePath: string;
};

export const contentPlatformLabels: Record<ContentPlatform, string> = {
  youtube: "YouTube 動画",
  youtube_short: "YouTube Shorts",
  tiktok: "TikTok",
  x: "X",
};
export const contentClaimLabels: Record<ContentClaim, string> = {
  designated: "指定動画",
  hot_video: "公式動画・再生4万超",
  hot_short: "ショート・いいね2,000超",
  hot_x: "オリジナルX・いいね3,000超",
  bonus_video: "追加奨励・ショート再生100万超／YouTube動画20万超",
};

export function emptyContentEntry(
  id: string,
  section: MonthlyContentEntry["section"],
): MonthlyContentEntry {
  return {
    id,
    section,
    platform: "youtube",
    accountId: "",
    accountName: "",
    title: "",
    url: "",
    publishedOn: "",
    views: "",
    likes: "",
    durationSeconds: "",
    topic: "general",
    claims: section === "designated" ? ["designated"] : ["hot_video"],
    imageName: "",
    imageUrl: "",
    imageMimeType: "",
    imageStoragePath: "",
  };
}

export function hasContentEntry(entry: MonthlyContentEntry) {
  return [
    entry.accountId,
    entry.title,
    entry.url,
    entry.publishedOn,
    entry.views,
    entry.likes,
    entry.durationSeconds,
    entry.imageName,
    entry.imageUrl,
  ].some((value) => Boolean(value.trim()));
}

export function shouldConfirmEmptyContent(
  action: string,
  entries: MonthlyContentEntry[],
) {
  return action === "submit" && !entries.some(hasContentEntry);
}

export function parseMonthlyContent(value: unknown): MonthlyContentEntry[] {
  if (value == null || value === "") return [];
  const source: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(source) || source.length > 100)
    throw new Error("動画・投稿実績は100件以内で入力してください。");
  const seen = new Set<string>();
  return source.map((item, index) => {
    if (!item || typeof item !== "object")
      throw new Error(
        `動画・投稿実績 ${index + 1}：データ形式が正しくありません。`,
      );
    const raw = item as Record<string, unknown>;
    const text = (key: string, max = 2000) =>
      String(raw[key] ?? "")
        .trim()
        .slice(0, max);
    const id = text("id", 100);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || seen.has(id))
      throw new Error(
        "動画・投稿実績の行番号が重複または不正です。画面を開き直してください。",
      );
    seen.add(id);
    const entry = emptyContentEntry(
      id,
      raw.section === "designated" ? "designated" : "popular",
    );
    return {
      ...entry,
      platform: Object.hasOwn(contentPlatformLabels, String(raw.platform))
        ? (raw.platform as ContentPlatform)
        : "youtube",
      accountId: text("accountId", 100),
      accountName: text("accountName", 200),
      title: text("title", 300),
      url: text("url"),
      publishedOn: text("publishedOn", 10),
      views: text("views", 30),
      likes: text("likes", 30),
      durationSeconds: text("durationSeconds", 30),
      topic:
        raw.topic === "game_event"
          ? ("game_event" as const)
          : ("general" as const),
      claims: Array.isArray(raw.claims)
        ? [
            ...new Set(
              raw.claims.filter(
                (claim): claim is ContentClaim =>
                  typeof claim === "string" &&
                  Object.hasOwn(contentClaimLabels, claim),
              ),
            ),
          ]
        : entry.claims,
      imageName: text("imageName", 300),
      imageUrl: text("imageUrl"),
      imageMimeType: text("imageMimeType", 100),
      imageStoragePath: text("imageStoragePath"),
    };
  });
}

export function contentWorkKey(value: string) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const segments = url.pathname.split("/").filter(Boolean);
    if (host === "youtu.be")
      return segments[0] ? `youtube:${segments[0]}` : null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id =
        url.searchParams.get("v") ||
        (["shorts", "live", "embed"].includes(segments[0])
          ? segments[1]
          : null);
      return id ? `youtube:${id}` : null;
    }
    if (["x.com", "twitter.com", "mobile.twitter.com"].includes(host)) {
      const index = segments.indexOf("status");
      return index >= 0 && segments[index + 1]
        ? `x:${segments[index + 1]}`
        : null;
    }
    if (host === "tiktok.com" || host.endsWith(".tiktok.com"))
      return segments.length ? `tiktok:${host}/${segments.join("/")}` : null;
    return null;
  } catch {
    return null;
  }
}

export function validateMonthlyContent(
  entries: MonthlyContentEntry[],
  month: string,
  accountIds: string[],
) {
  const seen = new Set<string>();
  const errors: string[] = [];
  entries.filter(hasContentEntry).forEach((entry, index) => {
    const label = `動画・投稿実績 ${index + 1}`;
    if (!entry.title)
      errors.push(`${label}：動画・投稿内容を入力してください。`);
    if (!accountIds.includes(entry.accountId))
      errors.push(`${label}：投稿者を選択してください。`);
    const key = contentWorkKey(entry.url);
    if (!key)
      errors.push(`${label}：YouTube・TikTok・Xの作品URLを入力してください。`);
    else {
      if (seen.has(key))
        errors.push(
          `${label}：同じ作品が重複しています。1行にまとめて申請項目を選択してください。`,
        );
      seen.add(key);
      const expected = entry.platform.startsWith("youtube")
        ? "youtube"
        : entry.platform;
      if (!key.startsWith(`${expected}:`))
        errors.push(`${label}：プラットフォームとURLが一致しません。`);
    }
    const parsedDate = new Date(`${entry.publishedOn}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.publishedOn) ||
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== entry.publishedOn ||
      entry.publishedOn.slice(0, 7) !== month
    )
      errors.push(`${label}：対象月内の投稿日を入力してください。`);
    if (!entry.claims.length)
      errors.push(`${label}：申請項目を選択してください。`);
    if (
      entry.claims.includes("designated") &&
      !entry.platform.startsWith("youtube")
    )
      errors.push(
        `${label}：指定動画はYouTubeの動画またはShortsを選択してください。`,
      );
    if (entry.claims.includes("hot_x") && entry.platform !== "x")
      errors.push(`${label}：Xの申請はプラットフォームXを選択してください。`);
    if (
      (entry.claims.includes("hot_short") ||
        entry.claims.includes("bonus_video")) &&
      entry.platform === "x"
    )
      errors.push(
        `${label}：動画の申請には動画プラットフォームを選択してください。`,
      );
    if (entry.claims.includes("hot_short") && entry.platform === "youtube")
      errors.push(
        `${label}：ショートの申請はYouTube ShortsまたはTikTokを選択してください。`,
      );
    if (
      entry.claims.includes("hot_video") &&
      (entry.accountId !== "official" || entry.platform === "x")
    )
      errors.push(
        `${label}：公式動画の申請は公式アカウントの動画を選択してください。`,
      );
    for (const [field, required, name] of [
      [
        "views",
        entry.claims.some(
          (claim) => claim === "hot_video" || claim === "bonus_video",
        ),
        "再生回数",
      ],
      [
        "likes",
        entry.claims.some(
          (claim) => claim === "hot_short" || claim === "hot_x",
        ),
        "いいね数",
      ],
      [
        "durationSeconds",
        entry.claims.includes("designated"),
        "動画の長さ（秒）",
      ],
    ] as const) {
      const value = entry[field];
      if (
        (required || value !== "") &&
        (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      )
        errors.push(`${label}：${name}を0以上の整数で入力してください。`);
    }
  });
  return errors;
}

export function contentSubmissionPatch(
  action: string,
  entries: MonthlyContentEntry[],
  acknowledged: boolean,
): { content_entries?: MonthlyContentEntry[]; content_skipped?: boolean } {
  if (action.startsWith("salary_screenshots")) return {};
  const content = entries.filter(hasContentEntry);
  if (shouldConfirmEmptyContent(action, content) && !acknowledged)
    throw new Error(
      "2ページ目の動画・投稿実績が未入力です。入力せずに提出する場合は確認画面で承認してください。",
    );
  return {
    content_entries: content,
    content_skipped:
      action === "submit" && content.length === 0 && acknowledged,
  };
}
