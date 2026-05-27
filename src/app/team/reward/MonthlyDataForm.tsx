"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MonthlyPlayerRow,
  emptyMonthlyPlayerRow,
  formatMonthlyNumber,
} from "@/lib/monthly-data";

type MonthlyDataFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  teamId: string;
  selectedMonth: string;
  initialPlayers: MonthlyPlayerRow[];
  clubActivityLink: string;
  clubActivityImageUrl?: string | null;
  clubActivityImageName?: string | null;
  isLocked: boolean;
};

type PlayerField = keyof MonthlyPlayerRow;

const xFields: Array<{ key: PlayerField; label: string }> = [
  { key: "xTweetCount", label: "ツイート本数（引用含む）" },
  { key: "xImpressions", label: "インプレッション" },
  { key: "xEngagements", label: "エンゲージメント" },
  { key: "xFanEventCount", label: "ファンイベント回数" },
  { key: "xFollowerCount", label: "フォロワー数" },
];

const youtubeFields: Array<{ key: PlayerField; label: string }> = [
  { key: "youtubeVideoPostCount", label: "投稿本数（動画）" },
  { key: "youtubeVideoViews", label: "視聴回数（動画）" },
  { key: "youtubeShortPostCount", label: "投稿本数（ショート）" },
  { key: "youtubeShortViews", label: "視聴回数（ショート）" },
  { key: "youtubeLikeCount", label: "いいね数" },
  { key: "youtubeStreamCount", label: "配信回数" },
  { key: "youtubeStreamViews", label: "視聴回数（配信）" },
  { key: "youtubeTotalImpressions", label: "合計インプレッション" },
  { key: "youtubeSubscriberCount", label: "登録者数" },
];

export default function MonthlyDataForm({
  action,
  teamId,
  selectedMonth,
  initialPlayers,
  clubActivityLink,
  clubActivityImageUrl,
  clubActivityImageName,
  isLocked,
}: MonthlyDataFormProps) {
  const storageKey = `monthly-data-player-names:${teamId}`;
  const [useDefaultNames, setUseDefaultNames] = useState(true);
  const [activityLink, setActivityLink] = useState(clubActivityLink || "");
  const [players, setPlayers] = useState<MonthlyPlayerRow[]>(() => {
    if (initialPlayers.length > 0) {
      return initialPlayers;
    }

    if (typeof window === "undefined") {
      return [emptyMonthlyPlayerRow(0)];
    }

    const savedNames = window.localStorage.getItem(storageKey);

    if (!savedNames) {
      return [emptyMonthlyPlayerRow(0)];
    }

    try {
      const names = JSON.parse(savedNames);

      if (Array.isArray(names) && names.length > 0) {
        return names.map((name, index) => ({
          ...emptyMonthlyPlayerRow(index),
          playerName: String(name || ""),
        }));
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }

    return [emptyMonthlyPlayerRow(0)];
  });

  useEffect(() => {
    if (!useDefaultNames) {
      return;
    }

    const names = players
      .map((player) => player.playerName.trim())
      .filter(Boolean);

    window.localStorage.setItem(storageKey, JSON.stringify(names));
  }, [players, storageKey, useDefaultNames]);

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

  function addPlayer() {
    setPlayers((current) => [...current, emptyMonthlyPlayerRow(current.length)]);
  }

  function removePlayer(index: number) {
    setPlayers((current) =>
      current.length <= 1
        ? current
        : current.filter((_, playerIndex) => playerIndex !== index)
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="player_rows" value={JSON.stringify(players)} />
      <input type="hidden" name="selected_month" value={selectedMonth} />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">対象月</p>
            <input
              type="month"
              name="target_month"
              defaultValue={selectedMonth}
              disabled={isLocked}
              className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
            />
          </div>

          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <p className="text-slate-500">選手給与合計</p>
            <p className="mt-1 text-xl font-bold text-slate-950">
              {formatMonthlyNumber(totalSalary)} 円
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-bold">① 選手名・選手給与</h2>
            <p className="mt-1 text-sm text-slate-500">
              選手は自由に追加できます。選手名は次回以降の初期値として保存できます。
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={useDefaultNames}
              onChange={(event) => setUseDefaultNames(event.target.checked)}
              className="h-4 w-4"
              disabled={isLocked}
            />
            選手名を次回以降も使用する
          </label>
        </div>

        <div className="mt-5 space-y-4">
          {players.map((player, index) => (
            <div
              key={player.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_80px] md:items-end">
                <Field
                  label={`選手名 ${index + 1}`}
                  value={player.playerName}
                  onChange={(value) => updatePlayer(index, "playerName", value)}
                  disabled={isLocked}
                />
                <Field
                  label="選手給与"
                  value={player.salaryAmount}
                  onChange={(value) =>
                    updatePlayer(index, "salaryAmount", value)
                  }
                  disabled={isLocked}
                  type="number"
                  min="0"
                />
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">
                    給与スクリーンショット
                  </span>
                  <input
                    type="file"
                    name={`salary_screenshot_${index}`}
                    accept="image/*"
                    disabled={isLocked}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                  {player.salaryScreenshotName ? (
                    player.salaryScreenshotUrl ? (
                      <a
                        href={player.salaryScreenshotUrl}
                        target="_blank"
                        className="mt-1 block text-xs font-semibold text-sky-700 underline"
                      >
                        登録済み画像を開く
                      </a>
                    ) : (
                      <span className="mt-1 block text-xs text-slate-500">
                        登録済み：{player.salaryScreenshotName}
                      </span>
                    )
                  ) : null}
                </label>
                <button
                  type="button"
                  onClick={() => removePlayer(index)}
                  disabled={isLocked || players.length <= 1}
                  className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addPlayer}
          disabled={isLocked}
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          選手を追加
        </button>
      </section>

      <MetricSection
        title="② X"
        fields={xFields}
        players={players}
        updatePlayer={updatePlayer}
        disabled={isLocked}
      />

      <MetricSection
        title="③ YouTube"
        fields={youtubeFields}
        players={players}
        updatePlayer={updatePlayer}
        disabled={isLocked}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">④ クラブ活動</h2>
        <p className="mt-1 text-sm text-slate-500">
          リンク提出または画像アップロードのどちらか一方を選択してください。
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
              disabled={isLocked || Boolean(activityLink.trim())}
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
          disabled={isLocked}
          className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          下書き保存
        </button>

        <button
          type="submit"
          name="action_type"
          value="submit"
          disabled={isLocked}
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
  players,
  updatePlayer,
  disabled,
}: {
  title: string;
  fields: Array<{ key: PlayerField; label: string }>;
  players: MonthlyPlayerRow[];
  updatePlayer: (index: number, key: PlayerField, value: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-4 space-y-5">
        {players.map((player, index) => (
          <div key={`${player.id}-${title}`} className="rounded-lg bg-slate-50 p-4">
            <p className="font-semibold">
              {player.playerName || `選手 ${index + 1}`}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  value={String(player[field.key] || "")}
                  onChange={(value) => updatePlayer(index, field.key, value)}
                  disabled={disabled}
                  type="number"
                  min="0"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: string;
  min?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input
        type={type}
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
      />
    </label>
  );
}
