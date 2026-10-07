import {
  contentClaimLabels,
  contentPlatformLabels,
  parseMonthlyContent,
} from "@/lib/monthly-content";
import ImagePreview from "../reward/ImagePreview";

export default function MonthlyContentReview({
  value,
  skipped,
}: {
  value: unknown;
  skipped?: boolean;
}) {
  const entries = parseMonthlyContent(value);
  return (
    <section className="border-t border-slate-700 pt-4">
      <h3 className="text-sm font-bold text-slate-100">
        第二页：视频及投稿实绩
      </h3>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">
          {skipped ? "战队已确认不填写第二页并提交。" : "无申报资料。"}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-amber-300">
            需人工复核：指定主题、原创性、作品所属账号、提交数字与凭证是否一致。申报不代表已获得加分。
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  {[
                    "编号",
                    "投稿者 / 平台",
                    "作品",
                    "发布日期",
                    "播放 / 点赞",
                    "申请项目",
                    "凭证",
                  ].map((label) => (
                    <th key={label} className="px-3 py-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr
                    key={entry.id}
                    className="border-t border-slate-800 align-top"
                  >
                    <td className="px-3 py-3">{index + 1}</td>
                    <td className="px-3 py-3">
                      {entry.accountName || "未选择"}
                      <br />
                      {contentPlatformLabels[entry.platform]}
                    </td>
                    <td className="max-w-sm px-3 py-3">
                      <p>{entry.title || "未填写"}</p>
                      {/^https?:\/\//i.test(entry.url) && (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block break-all text-sky-300 underline"
                        >
                          {entry.url}
                        </a>
                      )}
                      {entry.claims.includes("designated") && (
                        <p className="mt-1 text-slate-400">
                          {entry.topic === "game_event"
                            ? "游戏内活动"
                            : "第五人格 / 成员相关"}{" "}
                          · {entry.durationSeconds || "未填"} 秒
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {entry.publishedOn || "未填写"}
                    </td>
                    <td className="px-3 py-3">
                      {entry.views === "" ? "未填" : entry.views} /{" "}
                      {entry.likes === "" ? "未填" : entry.likes}
                    </td>
                    <td className="px-3 py-3">
                      {entry.claims.map((claim) => (
                        <p key={claim}>{contentClaimLabels[claim]}</p>
                      ))}
                    </td>
                    <td className="px-3 py-3">
                      {entry.imageUrl ? (
                        <ImagePreview
                          imageUrl={entry.imageUrl}
                          fileName={entry.imageName}
                        />
                      ) : (
                        "未附图片"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
