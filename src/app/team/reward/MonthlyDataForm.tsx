"use client";

import { useMemo, useState } from "react";
import {
  MonthlyPlayerRow,
  formatMonthlyNumber,
  sumMonthlyField,
} from "@/lib/monthly-data";
import {
  ClubActivityItem,
  emptyClubActivityItem,
  hasClubActivityContent,
} from "@/lib/club-activities";

type MonthlyDataFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  teamId: string;
  selectedMonth: string;
  initialOfficialRow: MonthlyPlayerRow;
  initialPlayers: MonthlyPlayerRow[];
  clubActivityItems: ClubActivityItem[];
  isLocked: boolean;
  canSaveSalaryScreenshots: boolean;
};

type PlayerField = keyof MonthlyPlayerRow;
type MetricSectionKind = "x" | "youtube";

const xFields: Array<{ key: PlayerField; label: string; shortLabel: string }> = [
  {
    key: "xTweetCount",
    label: "ツイート本数（引用含む）",
    shortLabel: "ツイート",
  },
  { key: "xImpressions", label: "インプレッション", shortLabel: "Imp" },
  { key: "xEngagements", label: "エンゲージメント", shortLabel: "ENG" },
  {
    key: "xFanEventCount",
    label: "ファンイベント回数",
    shortLabel: "ファンEV",
  },
  { key: "xFollowerCount", label: "フォロワー数", shortLabel: "フォロワー" },
];

const youtubeFields: Array<{
  key: PlayerField;
  label: string;
  shortLabel: string;
}> = [
  { key: "youtubeVideoPostCount", label: "投稿本数（動画）", shortLabel: "動画本数" },
  { key: "youtubeVideoViews", label: "視聴回数（動画）", shortLabel: "動画再生" },
  {
    key: "youtubeShortPostCount",
    label: "投稿本数（ショート）",
    shortLabel: "Short本数",
  },
  {
    key: "youtubeShortViews",
    label: "視聴回数（ショート）",
    shortLabel: "Short再生",
  },
  { key: "youtubeLikeCount", label: "いいね数", shortLabel: "いいね" },
  { key: "youtubeStreamCount", label: "配信回数", shortLabel: "配信回数" },
  { key: "youtubeStreamViews", label: "視聴回数（配信）", shortLabel: "配信再生" },
  {
    key: "youtubeTotalImpressions",
    label: "合計インプレッション",
    shortLabel: "合計Imp",
  },
  { key: "youtubeSubscriberCount", label: "登録者数", shortLabel: "登録者" },
];

const japanesePlayerMeta: Record<string, string> = {
  队员: "選手",
  队长: "キャプテン",
  教练: "コーチ",
  求生者: "サバイバー",
  监管者: "ハンター",
};

function toJapanesePlayerMeta(value?: string) {
  if (!value) {
    return "";
  }

  return japanesePlayerMeta[value] || value;
}

type TesseractGlobal = {
  recognize: (
    image: File,
    language?: string,
    options?: {
      logger?: (message: { status?: string; progress?: number }) => void;
    }
  ) => Promise<{ data: { text: string } }>;
};

declare global {
  interface Window {
    Tesseract?: TesseractGlobal;
  }
}

let tesseractLoader: Promise<TesseractGlobal> | null = null;

function loadTesseract() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("ブラウザでのみ利用できます。"));
  }

  if (window.Tesseract) {
    return Promise.resolve(window.Tesseract);
  }

  if (!tesseractLoader) {
    tesseractLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
      script.async = true;
      script.onload = () => {
        if (window.Tesseract) {
          resolve(window.Tesseract);
        } else {
          reject(new Error("OCR ライブラリの読み込みに失敗しました。"));
        }
      };
      script.onerror = () =>
        reject(new Error("OCR ライブラリの読み込みに失敗しました。"));
      document.head.appendChild(script);
    });
  }

  return tesseractLoader;
}

async function recognizeMetricsFromImage({
  file,
  fields,
}: {
  file: File;
  fields: Array<{ key: PlayerField; label: string; shortLabel: string }>;
}) {
  const tesseract = await loadTesseract();
  const result = await tesseract.recognize(file, "eng+jpn");
  const text = normalizeOcrText(result.data.text);
  const values: Partial<Record<PlayerField, string>> = {};

  for (const field of fields) {
    const value = pickNumberForField(text, field);

    if (value !== null) {
      values[field.key] = String(value);
    }
  }

  if (Object.keys(values).length === 0) {
    const orderedNumbers = extractNumberCandidates(text)
      .map((candidate) => candidate.value)
      .filter((value) => value >= 0)
      .filter((value) => value < 300000000);

    if (
      orderedNumbers.length < fields.length ||
      orderedNumbers.length > fields.length + 2
    ) {
      return {
        values,
        usedFallback: false,
      };
    }

    orderedNumbers.slice(0, fields.length).forEach((value, index) => {
      const field = fields[index];

      if (field) {
        values[field.key] = String(value);
      }
    });

    return {
      values,
      usedFallback: orderedNumbers.length > 0,
    };
  }

  return { values, usedFallback: false };
}

function pickNumberForField(
  text: string,
  field: { key: PlayerField; label: string; shortLabel: string }
) {
  const keywords = [
    field.label,
    field.shortLabel,
    ...(ocrKeywordAliases[field.key] || []),
  ].map(normalizeOcrText);
  const candidates = extractNumberCandidates(text);
  let bestCandidate: { value: number; distance: number } | null = null;

  for (const keyword of keywords) {
    if (!keyword) {
      continue;
    }

    const keywordIndex = text.toLowerCase().indexOf(keyword.toLowerCase());

    if (keywordIndex < 0) {
      continue;
    }

    for (const candidate of candidates) {
      const distance = candidate.index - keywordIndex;

      if (distance < -24 || distance > 140) {
        continue;
      }

      const absoluteDistance = Math.abs(distance);

      if (!bestCandidate || absoluteDistance < bestCandidate.distance) {
        bestCandidate = {
          value: candidate.value,
          distance: absoluteDistance,
        };
      }
    }
  }

  return bestCandidate?.value ?? null;
}

const ocrKeywordAliases: Partial<Record<PlayerField, string[]>> = {
  xTweetCount: ["tweet", "tweets", "post", "posts", "ポスト", "投稿"],
  xImpressions: ["impression", "impressions", "表示回数", "閲覧", "閱讀"],
  xEngagements: ["engagement", "engagements", "反応", "エンゲージ"],
  xFanEventCount: ["event", "events", "イベント"],
  xFollowerCount: ["follower", "followers", "フォロワー"],
  youtubeVideoPostCount: ["video", "videos", "動画", "投稿"],
  youtubeVideoViews: ["video views", "views", "動画再生", "視聴回数"],
  youtubeShortPostCount: ["short", "shorts", "ショート"],
  youtubeShortViews: ["short views", "ショート再生"],
  youtubeLikeCount: ["like", "likes", "いいね"],
  youtubeStreamCount: ["stream", "streams", "live", "配信", "ライブ"],
  youtubeStreamViews: ["stream views", "live views", "配信再生", "ライブ視聴"],
  youtubeTotalImpressions: ["impression", "impressions", "合計インプレッション"],
  youtubeSubscriberCount: ["subscriber", "subscribers", "登録者"],
};

function extractNumberCandidates(text: string) {
  const candidates: Array<{ value: number; index: number }> = [];
  const matcher = /(\d[\d,]*(?:\.\d+)?)(\s*(?:万|億|k|K|m|M))?/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    const value = parseOcrNumber(match[1], match[2]);

    if (value !== null) {
      candidates.push({ value, index: match.index });
    }
  }

  return candidates;
}

function parseOcrNumber(rawNumber: string, rawUnit?: string) {
  const numberValue = Number(rawNumber.replace(/,/g, ""));

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  const unit = String(rawUnit || "").trim().toLowerCase();
  const multiplier = unit.includes("億")
    ? 100000000
    : unit.includes("万")
      ? 10000
      : unit === "m"
        ? 1000000
        : unit === "k"
          ? 1000
          : 1;

  return Math.round(numberValue * multiplier);
}

function normalizeOcrText(value: string) {
  return value
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    )
    .replace(/[，、]/g, ",")
    .replace(/[：]/g, ":")
    .replace(/\s+/g, " ")
    .trim();
}

export default function MonthlyDataForm({
  action,
  teamId,
  selectedMonth,
  initialOfficialRow,
  initialPlayers,
  clubActivityItems,
  isLocked,
  canSaveSalaryScreenshots,
}: MonthlyDataFormProps) {
  const [activities, setActivities] = useState<ClubActivityItem[]>(
    clubActivityItems.length > 0 ? clubActivityItems : [emptyClubActivityItem()]
  );
  const [officialRow, setOfficialRow] =
    useState<MonthlyPlayerRow>(initialOfficialRow);
  const [players, setPlayers] = useState<MonthlyPlayerRow[]>(initialPlayers);

  const totalSalary = useMemo(
    () =>
      players.reduce((sum, player) => {
        const amount = Number(player.salaryAmount || 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
    [players]
  );

  function updatePlayer(index: number, key: PlayerField, value: string) {
    setPlayers((current) =>
      current.map((player, playerIndex) =>
        playerIndex === index ? { ...player, [key]: value } : player
      )
    );
  }

  function updateOfficial(key: PlayerField, value: string) {
    setOfficialRow((current) => ({ ...current, [key]: value }));
  }

  function updateActivity(index: number, patch: Partial<ClubActivityItem>) {
    setActivities((current) =>
      current.map((activity, activityIndex) =>
        activityIndex === index ? { ...activity, ...patch } : activity
      )
    );
  }

  function addActivity() {
    setActivities((current) => [
      ...current,
      emptyClubActivityItem(Date.now() + current.length),
    ]);
  }

  function removeActivity(index: number) {
    if (!window.confirm("このクラブ活動項目を削除しますか？")) {
      return;
    }

    setActivities((current) => {
      const next = current.filter((_, activityIndex) => activityIndex !== index);

      return next.length > 0 ? next : [emptyClubActivityItem()];
    });
  }

  const isSubmitDisabled = isLocked || players.length === 0;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="team_id" value={teamId} />
      <input
        type="hidden"
        name="official_row"
        value={JSON.stringify([officialRow])}
      />
      <input type="hidden" name="player_rows" value={JSON.stringify(players)} />
      <input type="hidden" name="selected_month" value={selectedMonth} />
      <input type="hidden" name="target_month" value={selectedMonth} />
      <input
        type="hidden"
        name="club_activity_items"
        value={JSON.stringify(activities)}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">対象月</p>
            <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950">
              {selectedMonth}
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <p className="text-slate-500">選手給与合計</p>
            <p className="mt-1 text-xl font-bold text-slate-950">
              {formatMonthlyNumber(totalSalary)} 円
            </p>
          </div>
        </div>
      </section>

      <SalarySection
        players={players}
        updatePlayer={updatePlayer}
        isSalaryAmountDisabled={isLocked}
        isScreenshotDisabled={!canSaveSalaryScreenshots}
        canSubmit={canSaveSalaryScreenshots && players.length > 0}
      />

      <MetricSection
        title="② X"
        kind="x"
        fields={xFields}
        officialRow={officialRow}
        players={players}
        updateOfficial={updateOfficial}
        updatePlayer={updatePlayer}
        disabled={isLocked}
      />

      <MetricSection
        title="③ YouTube"
        kind="youtube"
        fields={youtubeFields}
        officialRow={officialRow}
        players={players}
        updateOfficial={updateOfficial}
        updatePlayer={updatePlayer}
        disabled={isLocked}
      />

      <ClubActivitySection
        activities={activities}
        updateActivity={updateActivity}
        addActivity={addActivity}
        removeActivity={removeActivity}
        disabled={isLocked}
      />

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-slate-900">月データ</p>
        <p className="mt-1 text-xs text-slate-500">
          X、YouTube、クラブ活動の内容を保存・提出します。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="submit"
            name="action_type"
            value="draft"
            disabled={isSubmitDisabled}
            className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下書き保存
          </button>

          <button
            type="submit"
            name="action_type"
            value="submit"
            disabled={isSubmitDisabled}
            className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            審査提出
          </button>
        </div>
      </div>
    </form>
  );
}

function ClubActivitySection({
  activities,
  updateActivity,
  addActivity,
  removeActivity,
  disabled,
}: {
  activities: ClubActivityItem[];
  updateActivity: (index: number, patch: Partial<ClubActivityItem>) => void;
  addActivity: () => void;
  removeActivity: (index: number) => void;
  disabled: boolean;
}) {
  const submittedCount = activities.filter(hasClubActivityContent).length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">④ クラブ活動</h2>
          <p className="mt-1 text-sm text-slate-500">
            活動ごとにリンクと画像を登録できます。複数ある場合は項目を追加してください。
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
          {submittedCount}件
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {activities.map((activity, index) => (
          <div
            key={activity.id}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-800">
                クラブ活動 {index + 1}
              </h3>
              <button
                type="button"
                onClick={() => removeActivity(index)}
                disabled={disabled || activities.length <= 1}
                className="text-xs font-semibold text-rose-600 underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
              >
                削除
              </button>
            </div>

            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">
                  リンク
                </span>
                <input
                  value={activity.link}
                  onChange={(event) =>
                    updateActivity(index, { link: event.target.value })
                  }
                  placeholder="https://"
                  disabled={disabled}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-500">
                  画像
                </span>
                <input
                  type="file"
                  name={`club_activity_image_${activity.id}`}
                  accept="image/*"
                  disabled={disabled}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      updateActivity(index, { imageName: file.name });
                    }
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                />
                {activity.imageName ? (
                  <span className="mt-1 block text-xs text-slate-500">
                    登録済み / 選択中：{activity.imageName}
                  </span>
                ) : null}
              </label>
            </div>

            {activity.imageUrl ? (
              <a
                href={activity.imageUrl}
                target="_blank"
                className="mt-3 inline-block text-sm font-semibold text-sky-700 underline"
              >
                登録済み画像を開く
              </a>
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addActivity}
        disabled={disabled}
        className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        項目追加
      </button>
    </section>
  );
}

function MetricSection({
  title,
  kind,
  fields,
  officialRow,
  players,
  updateOfficial,
  updatePlayer,
  disabled,
}: {
  title: string;
  kind: MetricSectionKind;
  fields: Array<{ key: PlayerField; label: string; shortLabel: string }>;
  officialRow: MonthlyPlayerRow;
  players: MonthlyPlayerRow[];
  updateOfficial: (key: PlayerField, value: string) => void;
  updatePlayer: (index: number, key: PlayerField, value: string) => void;
  disabled: boolean;
}) {
  const totalRows = [officialRow, ...players];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">
            画像読み取りは入力補助です。反映後の数字は必ず修正できます。
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {players.length}名 / {kind === "x" ? "X" : "YouTube"}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-max border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 w-44 min-w-44 border-r border-slate-200 bg-slate-50 px-3 py-2">
                選手
              </th>
              {fields.map((field) => (
                <th
                  key={field.key}
                  title={field.label}
                  className="w-28 min-w-28 px-2 py-2"
                >
                  {field.shortLabel}
                </th>
              ))}
              <th className="w-56 min-w-56 px-2 py-2">画像読み取り</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-200 bg-sky-50/60">
              <th className="sticky left-0 z-10 w-44 min-w-44 border-r border-slate-200 bg-sky-50 px-3 py-2 align-middle">
                <span className="block truncate text-sm font-semibold text-slate-950">
                  公式アカウント
                </span>
                <span className="block truncate text-xs font-normal text-slate-400">
                  {officialRow.playerName}
                </span>
              </th>
              {fields.map((field) => (
                <td key={field.key} className="w-28 min-w-28 px-2 py-2">
                  <input
                    type="number"
                    min="0"
                    value={String(officialRow[field.key] || "")}
                    onChange={(event) =>
                      updateOfficial(field.key, event.target.value)
                    }
                    disabled={disabled}
                    aria-label={`公式アカウント ${field.label}`}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
                  />
                </td>
              ))}
              <td className="w-56 min-w-56 px-2 py-2">
                <OcrCell
                  fields={fields}
                  disabled={disabled}
                  onApply={(values) => {
                    for (const [key, value] of Object.entries(values)) {
                      if (typeof value === "string") {
                        updateOfficial(key as PlayerField, value);
                      }
                    }
                  }}
                />
              </td>
            </tr>
            {players.map((player, index) => (
              <tr key={`${player.id}-${title}`} className="border-t border-slate-200">
                <th className="sticky left-0 z-10 w-44 min-w-44 border-r border-slate-200 bg-white px-3 py-2 align-middle">
                  <span className="block truncate text-sm font-semibold text-slate-950">
                    {player.playerName || `選手 ${index + 1}`}
                  </span>
                  {player.playerReading ? (
                    <span className="block truncate text-xs font-normal text-slate-400">
                      {player.playerReading}
                    </span>
                  ) : null}
                </th>
                {fields.map((field) => (
                  <td key={field.key} className="w-28 min-w-28 px-2 py-2">
                    <input
                      type="number"
                      min="0"
                      value={String(player[field.key] || "")}
                      onChange={(event) =>
                        updatePlayer(index, field.key, event.target.value)
                      }
                      disabled={disabled}
                      aria-label={`${player.playerName || `選手 ${index + 1}`} ${field.label}`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
                    />
                  </td>
                ))}
                <td className="w-56 min-w-56 px-2 py-2">
                  <OcrCell
                    fields={fields}
                    disabled={disabled}
                    onApply={(values) => {
                      for (const [key, value] of Object.entries(values)) {
                        if (typeof value === "string") {
                          updatePlayer(index, key as PlayerField, value);
                        }
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-300 bg-slate-100 text-xs font-bold text-slate-700">
            <tr>
              <th className="sticky left-0 z-10 w-44 min-w-44 border-r border-slate-200 bg-slate-100 px-3 py-2">
                合計
              </th>
              {fields.map((field) => (
                <td key={field.key} className="w-28 min-w-28 px-2 py-2">
                  {formatMonthlyNumber(sumMonthlyField(totalRows, field.key))}
                </td>
              ))}
              <td className="w-56 min-w-56 px-2 py-2 text-xs text-slate-500">
                -
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function OcrCell({
  fields,
  disabled,
  onApply,
}: {
  fields: Array<{ key: PlayerField; label: string; shortLabel: string }>;
  disabled: boolean;
  onApply: (values: Partial<Record<PlayerField, string>>) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [isReading, setIsReading] = useState(false);

  async function handleRecognize() {
    if (!file) {
      setStatus("画像を選択してください。");
      return;
    }

    setIsReading(true);
    setStatus("画像を読み取り中...");

    try {
      const result = await recognizeMetricsFromImage({ file, fields });
      const recognizedCount = Object.keys(result.values).length;

      if (recognizedCount === 0) {
        setStatus("数字を自動対応できませんでした。手入力してください。");
      } else {
        onApply(result.values);
        const resultText = formatOcrResult(fields, result.values);
        setStatus(
          result.usedFallback
            ? `${recognizedCount}項目を順番で推定しました：${resultText}。数字を確認してください。`
            : `${recognizedCount}項目を反映しました：${resultText}。`
        );
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "画像読み取りに失敗しました。"
      );
    } finally {
      setIsReading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept="image/*"
        disabled={disabled || isReading}
        onChange={(event) => {
          setFile(event.target.files?.[0] || null);
          setStatus("");
        }}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs disabled:bg-slate-100"
      />
      <button
        type="button"
        disabled={disabled || isReading || !file}
        onClick={handleRecognize}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isReading ? "読み取り中..." : "数字を反映"}
      </button>
      {status ? (
        <p
          className={`rounded-md px-2 py-1 text-[11px] leading-4 ${
            status.includes("反映") || status.includes("推定")
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-50 text-slate-500"
          }`}
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}

function formatOcrResult(
  fields: Array<{ key: PlayerField; label: string; shortLabel: string }>,
  values: Partial<Record<PlayerField, string>>
) {
  return fields
    .filter((field) => values[field.key])
    .map((field) => `${field.shortLabel} ${formatMonthlyNumber(values[field.key])}`)
    .join(" / ");
}

function SalarySection({
  players,
  updatePlayer,
  isSalaryAmountDisabled,
  isScreenshotDisabled,
  canSubmit,
}: {
  players: MonthlyPlayerRow[];
  updatePlayer: (index: number, key: PlayerField, value: string) => void;
  isSalaryAmountDisabled: boolean;
  isScreenshotDisabled: boolean;
  canSubmit: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">① 選手・選手給与</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            選手一覧は管理者が設定した当月の選手リストから自動反映されます。
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {players.length}名
        </span>
      </div>

      {players.length === 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          この月の選手リストがまだ設定されていません。管理者に確認してください。
        </div>
      ) : null}

      {players.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 w-44 min-w-44 border-r border-slate-200 bg-slate-50 px-3 py-2">
                  選手
                </th>
                <th className="w-36 px-2 py-2">給与</th>
                <th className="w-64 px-2 py-2">給与スクリーンショット</th>
                <th className="w-44 px-2 py-2">登録済み画像</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => (
                <tr key={player.id} className="border-t border-slate-200">
                  <th className="sticky left-0 z-10 w-44 min-w-44 border-r border-slate-200 bg-white px-3 py-2 align-middle">
                    <span className="block truncate text-sm font-semibold text-slate-950">
                      {player.playerName || `選手 ${index + 1}`}
                    </span>
                    <span className="block truncate text-xs font-normal text-slate-400">
                      {[
                        player.playerReading,
                        toJapanesePlayerMeta(player.playerPosition),
                        toJapanesePlayerMeta(player.playerRole),
                      ]
                        .filter(Boolean)
                        .join(" / ") || "管理者設定"}
                    </span>
                  </th>
                  <td className="w-36 px-2 py-2">
                    <input
                      type="number"
                      min="0"
                      value={player.salaryAmount}
                      onChange={(event) =>
                        updatePlayer(index, "salaryAmount", event.target.value)
                      }
                      disabled={isSalaryAmountDisabled}
                      aria-label={`${player.playerName || `選手 ${index + 1}`} 選手給与`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="w-64 px-2 py-2">
                    <input
                      type="file"
                      name={`salary_screenshot_${index}`}
                      accept="image/*"
                      disabled={isScreenshotDisabled}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs disabled:bg-slate-100"
                    />
                  </td>
                  <td className="w-44 px-2 py-2 text-xs">
                    {player.salaryScreenshotName ? (
                      player.salaryScreenshotUrl ? (
                        <a
                          href={player.salaryScreenshotUrl}
                          target="_blank"
                          className="font-semibold text-sky-700 underline"
                        >
                          画像を開く
                        </a>
                      ) : (
                        <span className="text-slate-500">
                          {player.salaryScreenshotName}
                        </span>
                      )
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-300 bg-slate-100 text-sm font-bold text-slate-800">
              <tr>
                <th className="sticky left-0 z-10 w-44 min-w-44 border-r border-slate-200 bg-slate-100 px-3 py-2 text-left">
                  合計
                </th>
                <td className="w-36 px-2 py-2">
                  {formatMonthlyNumber(sumMonthlyField(players, "salaryAmount"))} 円
                </td>
                <td className="px-2 py-2 text-xs text-slate-500" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-bold text-slate-900">
          給与スクリーンショット
        </p>
        <p className="mt-1 text-xs text-slate-500">
          選手給与と給与スクリーンショットのみ保存・提出します。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="submit"
            name="action_type"
            value="salary_screenshots_draft"
            disabled={!canSubmit}
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下書き保存
          </button>

          <button
            type="submit"
            name="action_type"
            value="salary_screenshots_submit"
            disabled={!canSubmit}
            className="rounded-lg bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            審査提出
          </button>
        </div>
      </div>
    </section>
  );
}
