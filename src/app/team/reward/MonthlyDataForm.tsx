"use client";

import { useMemo, useState } from "react";
import {
  MonthlyPlayerRow,
  formatMonthlyNumber,
  sumMonthlyField,
} from "@/lib/monthly-data";

type MonthlyDataFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  teamId: string;
  selectedMonth: string;
  initialOfficialRow: MonthlyPlayerRow;
  initialPlayers: MonthlyPlayerRow[];
  clubActivityLink: string;
  clubActivityImageUrl?: string | null;
  clubActivityImageName?: string | null;
  isLocked: boolean;
};

type PlayerField = keyof MonthlyPlayerRow;

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

export default function MonthlyDataForm({
  action,
  teamId,
  selectedMonth,
  initialOfficialRow,
  initialPlayers,
  clubActivityLink,
  clubActivityImageUrl,
  clubActivityImageName,
  isLocked,
}: MonthlyDataFormProps) {
  const [activityLink, setActivityLink] = useState(clubActivityLink || "");
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
        disabled={isLocked}
      />

      <MetricSection
        title="② X"
        fields={xFields}
        officialRow={officialRow}
        players={players}
        updateOfficial={updateOfficial}
        updatePlayer={updatePlayer}
        disabled={isLocked}
      />

      <MetricSection
        title="③ YouTube"
        fields={youtubeFields}
        officialRow={officialRow}
        players={players}
        updateOfficial={updateOfficial}
        updatePlayer={updatePlayer}
        disabled={isLocked}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">④ クラブ活動</h2>
        <p className="mt-1 text-sm text-slate-500">
          リンクと画像はどちらも提出できます。必要な資料を登録してください。
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">リンク</span>
            <input
              name="club_activity_link"
              value={activityLink}
              onChange={(event) => setActivityLink(event.target.value)}
              placeholder="https://"
              disabled={isLocked}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-500">画像</span>
            <input
              type="file"
              name="club_activity_image"
              accept="image/*"
              disabled={isLocked}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
            />
            {clubActivityImageName ? (
              <span className="mt-1 block text-xs text-slate-500">
                登録済み：{clubActivityImageName}
              </span>
            ) : null}
          </label>
        </div>

        {clubActivityImageUrl ? (
          <a
            href={clubActivityImageUrl}
            target="_blank"
            className="mt-3 inline-block text-sm font-semibold text-sky-700 underline"
          >
            登録済み画像を開く
          </a>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-3">
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
    </form>
  );
}

function MetricSection({
  title,
  fields,
  officialRow,
  players,
  updateOfficial,
  updatePlayer,
  disabled,
}: {
  title: string;
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
        <h2 className="text-base font-bold">{title}</h2>
        <span className="text-xs font-semibold text-slate-400">
          {players.length}名
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
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function SalarySection({
  players,
  updatePlayer,
  disabled,
}: {
  players: MonthlyPlayerRow[];
  updatePlayer: (index: number, key: PlayerField, value: string) => void;
  disabled: boolean;
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
                      disabled={disabled}
                      aria-label={`${player.playerName || `選手 ${index + 1}`} 選手給与`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="w-64 px-2 py-2">
                    <input
                      type="file"
                      name={`salary_screenshot_${index}`}
                      accept="image/*"
                      disabled={disabled}
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
          </table>
        </div>
      ) : null}
    </section>
  );
}
