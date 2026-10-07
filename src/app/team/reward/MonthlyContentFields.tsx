"use client";

import { Fragment } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  contentClaimLabels,
  contentPlatformLabels,
  emptyContentEntry,
  type MonthlyContentEntry,
} from "@/lib/monthly-content";

const fieldClass =
  "w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm disabled:bg-slate-100";

export default function MonthlyContentFields({
  entries,
  onChange,
  accounts,
  disabled,
}: {
  entries: MonthlyContentEntry[];
  onChange: (entries: MonthlyContentEntry[]) => void;
  accounts: Array<{ id: string; name: string }>;
  disabled: boolean;
}) {
  const update = (id: string, patch: Partial<MonthlyContentEntry>) =>
    onChange(
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  return (
    <div className="space-y-6">
      {(["designated", "popular"] as const).map((section) => {
        const rows = entries.filter((entry) => entry.section === section);
        const title =
          section === "designated" ? "指定動画" : "超人気動画・投稿";
        return (
          <section
            key={section}
            className="border-y border-slate-200 bg-white py-4"
          >
            <div className="mb-4 flex items-center justify-between gap-3 px-4">
              <h2 className="text-base font-bold">{title}</h2>
              <button
                type="button"
                disabled={disabled || entries.length >= 100}
                onClick={() =>
                  onChange([
                    ...entries,
                    emptyContentEntry(crypto.randomUUID(), section),
                  ])
                }
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                <Plus size={16} />
                {section === "designated" ? "動画追加" : "投稿追加"}
              </button>
            </div>
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[740px] table-fixed text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th className="w-14 px-3 py-2">番号</th>
                      {section === "popular" && (
                        <th className="w-40 px-2 py-2">プラットフォーム</th>
                      )}
                      <th className="px-2 py-2">動画内容</th>
                      <th className="px-2 py-2">動画リンク</th>
                      <th className="w-36 px-2 py-2">
                        {section === "designated" ? "投稿日" : "再生回数"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((entry, index) => (
                      <Fragment key={entry.id}>
                        <tr className="border-t border-slate-200">
                          <td className="px-3 py-3 align-top">{index + 1}</td>
                          {section === "popular" && (
                            <td className="px-2 py-3 align-top">
                              <select
                                aria-label={`${title} ${index + 1} プラットフォーム`}
                                disabled={disabled}
                                value={entry.platform}
                                onChange={(event) =>
                                  update(entry.id, {
                                    platform: event.target
                                      .value as MonthlyContentEntry["platform"],
                                  })
                                }
                                className={fieldClass}
                              >
                                {Object.entries(contentPlatformLabels).map(
                                  ([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </td>
                          )}
                          <td className="px-2 py-3 align-top">
                            <input
                              aria-label={`${title} ${index + 1} 動画内容`}
                              maxLength={300}
                              disabled={disabled}
                              value={entry.title}
                              onChange={(event) =>
                                update(entry.id, { title: event.target.value })
                              }
                              className={fieldClass}
                            />
                          </td>
                          <td className="px-2 py-3 align-top">
                            <input
                              aria-label={`${title} ${index + 1} 動画リンク`}
                              disabled={disabled}
                              value={entry.url}
                              onChange={(event) =>
                                update(entry.id, { url: event.target.value })
                              }
                              placeholder="https://"
                              className={fieldClass}
                            />
                          </td>
                          <td className="px-2 py-3 align-top">
                            {section === "designated" ? (
                              <input
                                type="date"
                                aria-label={`${title} ${index + 1} 投稿日`}
                                disabled={disabled}
                                value={entry.publishedOn}
                                onChange={(event) =>
                                  update(entry.id, {
                                    publishedOn: event.target.value,
                                  })
                                }
                                className={fieldClass}
                              />
                            ) : (
                              <input
                                inputMode="numeric"
                                aria-label={`${title} ${index + 1} 再生回数`}
                                disabled={disabled}
                                value={entry.views}
                                onChange={(event) =>
                                  update(entry.id, {
                                    views: event.target.value,
                                  })
                                }
                                className={fieldClass}
                              />
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td
                            colSpan={section === "popular" ? 5 : 4}
                            className="px-3 pb-3"
                          >
                            <details className="border-t border-slate-100 pt-2">
                              <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                                投稿者・申請項目・証明画像
                              </summary>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <label className="grid gap-1 text-xs text-slate-600">
                                  投稿者
                                  <select
                                    aria-label={`${title} ${index + 1} 投稿者`}
                                    disabled={disabled}
                                    value={entry.accountId}
                                    onChange={(event) =>
                                      update(entry.id, {
                                        accountId: event.target.value,
                                        accountName:
                                          accounts.find(
                                            (account) =>
                                              account.id === event.target.value,
                                          )?.name || "",
                                      })
                                    }
                                    className={fieldClass}
                                  >
                                    <option value="">選択してください</option>
                                    {accounts.map((account) => (
                                      <option
                                        key={account.id}
                                        value={account.id}
                                      >
                                        {account.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                {section === "designated" ? (
                                  <label className="grid gap-1 text-xs text-slate-600">
                                    プラットフォーム
                                    <select
                                      aria-label={`${title} ${index + 1} 種別`}
                                      disabled={disabled}
                                      value={entry.platform}
                                      onChange={(event) =>
                                        update(entry.id, {
                                          platform: event.target
                                            .value as MonthlyContentEntry["platform"],
                                        })
                                      }
                                      className={fieldClass}
                                    >
                                      <option value="youtube">
                                        YouTube 動画
                                      </option>
                                      <option value="youtube_short">
                                        YouTube Shorts
                                      </option>
                                    </select>
                                  </label>
                                ) : (
                                  <label className="grid gap-1 text-xs text-slate-600">
                                    投稿日
                                    <input
                                      type="date"
                                      aria-label={`${title} ${index + 1} 投稿日`}
                                      disabled={disabled}
                                      value={entry.publishedOn}
                                      onChange={(event) =>
                                        update(entry.id, {
                                          publishedOn: event.target.value,
                                        })
                                      }
                                      className={fieldClass}
                                    />
                                  </label>
                                )}
                                <label className="grid gap-1 text-xs text-slate-600">
                                  いいね数
                                  <input
                                    aria-label={`${title} ${index + 1} いいね数`}
                                    inputMode="numeric"
                                    disabled={disabled}
                                    value={entry.likes}
                                    onChange={(event) =>
                                      update(entry.id, {
                                        likes: event.target.value,
                                      })
                                    }
                                    className={fieldClass}
                                  />
                                </label>
                                {section === "designated" && (
                                  <label className="grid gap-1 text-xs text-slate-600">
                                    再生回数
                                    <input
                                      inputMode="numeric"
                                      disabled={disabled}
                                      value={entry.views}
                                      onChange={(event) =>
                                        update(entry.id, {
                                          views: event.target.value,
                                        })
                                      }
                                      className={fieldClass}
                                    />
                                  </label>
                                )}
                                {entry.claims.includes("designated") && (
                                  <>
                                    <label className="grid gap-1 text-xs text-slate-600">
                                      内容区分
                                      <select
                                        disabled={disabled}
                                        value={entry.topic}
                                        onChange={(event) =>
                                          update(entry.id, {
                                            topic: event.target
                                              .value as MonthlyContentEntry["topic"],
                                          })
                                        }
                                        className={fieldClass}
                                      >
                                        <option value="general">
                                          第五人格・所属選手関連
                                        </option>
                                        <option value="game_event">
                                          ゲーム内イベント
                                        </option>
                                      </select>
                                    </label>
                                    <label className="grid gap-1 text-xs text-slate-600">
                                      動画の長さ（秒）
                                      <input
                                        aria-label={`${title} ${index + 1} 動画の長さ`}
                                        inputMode="numeric"
                                        disabled={disabled}
                                        value={entry.durationSeconds}
                                        onChange={(event) =>
                                          update(entry.id, {
                                            durationSeconds: event.target.value,
                                          })
                                        }
                                        className={fieldClass}
                                      />
                                    </label>
                                  </>
                                )}
                              </div>
                              <fieldset
                                disabled={disabled}
                                className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs"
                              >
                                <legend className="mb-2 font-semibold text-slate-600">
                                  申請項目
                                </legend>
                                {Object.entries(contentClaimLabels).map(
                                  ([value, label]) => (
                                    <label
                                      key={value}
                                      className="flex items-start gap-2"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={entry.claims.includes(
                                          value as MonthlyContentEntry["claims"][number],
                                        )}
                                        onChange={(event) =>
                                          update(entry.id, {
                                            claims: event.target.checked
                                              ? [
                                                  ...entry.claims,
                                                  value as MonthlyContentEntry["claims"][number],
                                                ]
                                              : entry.claims.filter(
                                                  (claim) => claim !== value,
                                                ),
                                          })
                                        }
                                      />
                                      {label}
                                    </label>
                                  ),
                                )}
                              </fieldset>
                              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                <label className="grid min-w-0 max-w-full gap-1 text-xs text-slate-600">
                                  証明画像
                                  <input
                                    type="file"
                                    name={`content_image_${entry.id}`}
                                    accept="image/*"
                                    disabled={disabled}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      update(entry.id, {
                                        imageName:
                                          file?.name || entry.imageName,
                                      });
                                    }}
                                    className="max-w-full text-xs"
                                  />
                                  {entry.imageUrl && (
                                    <a
                                      href={entry.imageUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-sky-700 underline"
                                    >
                                      登録済み画像を開く
                                    </a>
                                  )}
                                </label>
                                <button
                                  type="button"
                                  disabled={disabled}
                                  title="この投稿を削除"
                                  aria-label={`${title} ${index + 1} を削除`}
                                  onClick={() => {
                                    if (
                                      window.confirm("この投稿を削除しますか？")
                                    )
                                      onChange(
                                        entries.filter(
                                          (item) => item.id !== entry.id,
                                        ),
                                      );
                                  }}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-600"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </details>
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-5 text-sm text-slate-500">申請なし</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
