"use client";

import { useMemo, useState } from "react";
import SubmitButtons from "./SubmitButtons";

type SummaryRow = {
  payment_content: string;
  delivery_due_date: string;
};

type DetailRow = {
  service_item: string;
  quantity: number;
  unit_price: number;
};

type ReportRow = {
  category_type: string;
  link_url: string;
  implementation_date: string;
};

function getScreenshotRowNumber(note?: string | null) {
  const match = String(note || "").match(/No\.(\d+)/);
  return match ? Number(match[1]) : null;
}

export default function SubmissionForm({
  action,
  projectTeamId,
  teamId,
  currentStatus,
  companyInfo,
  profile,
  summaryRows,
  detailRows,
  reportRows,
  screenshotFiles,
}: {
  action: (formData: FormData) => void;
  projectTeamId: string;
  teamId: string;
  currentStatus: string;
  companyInfo: any;
  profile: any;
  summaryRows: any[];
  detailRows: any[];
  reportRows: any[];
  screenshotFiles: any[];
}) {
  const defaultCompanyName =
    companyInfo?.company_name || profile?.company_name || "";
  const defaultBankName = companyInfo?.bank_name || profile?.bank_name || "";
  const defaultBankAccountNumber =
    companyInfo?.bank_account_number || profile?.bank_account_number || "";
  const defaultSwiftCode = companyInfo?.swift_code || profile?.swift_code || "";

  const [summaries, setSummaries] = useState<SummaryRow[]>(
    summaryRows && summaryRows.length > 0
      ? summaryRows.slice(0, 3).map((row) => ({
          payment_content: row.payment_content || "",
          delivery_due_date: row.delivery_due_date || "",
        }))
      : [
          {
            payment_content: "",
            delivery_due_date: "",
          },
        ]
  );

  const [details, setDetails] = useState<DetailRow[]>(
    detailRows && detailRows.length > 0
      ? detailRows.slice(0, 7).map((row) => ({
          service_item: row.service_item || "",
          quantity: Number(row.quantity || 1),
          unit_price: Number(row.unit_price || 0),
        }))
      : [
          {
            service_item: "",
            quantity: 1,
            unit_price: 0,
          },
        ]
  );

  const [reports, setReports] = useState<ReportRow[]>(
    reportRows && reportRows.length > 0
      ? reportRows.slice(0, 21).map((row) => ({
          category_type: row.category_type || "",
          link_url: row.link_url || "",
          implementation_date: row.implementation_date || "",
        }))
      : [
          {
            category_type: "",
            link_url: "",
            implementation_date: "",
          },
        ]
  );

  const [fileError, setFileError] = useState("");

  const totals = useMemo(() => {
    return details.map((row) => {
      const quantity = Number(row.quantity || 0);
      const unitPrice = Number(row.unit_price || 0);
      return quantity * unitPrice;
    });
  }, [details]);
  const subtotalAmount = useMemo(
    () => totals.reduce((sum, amount) => sum + amount, 0),
    [totals]
  );
  const taxAmount = Math.round(subtotalAmount * 0.1);
  const totalAmount = subtotalAmount + taxAmount;

  function getScreenshotForRow(index: number) {
    const rowNumber = index + 1;

    return screenshotFiles?.find((file: any) => {
      return (
        file.file_category === "report_screenshot" &&
        getScreenshotRowNumber(file.note) === rowNumber
      );
    });
  }

  function updateSummary(index: number, key: keyof SummaryRow, value: string) {
    const nextSummaries = [...summaries];
    nextSummaries[index] = {
      ...nextSummaries[index],
      [key]: value,
    };
    setSummaries(nextSummaries);
  }

  function addSummaryRow() {
    if (summaries.length >= 3) {
      alert("最大3項目まで追加できます。");
      return;
    }

    setSummaries([
      ...summaries,
      {
        payment_content: "",
        delivery_due_date: "",
      },
    ]);
  }

  function removeSummaryRow(index: number) {
    if (summaries.length <= 1) {
      alert("最低1項目は必要です。");
      return;
    }

    setSummaries(summaries.filter((_, i) => i !== index));
  }

  function updateDetail(index: number, key: keyof DetailRow, value: any) {
    const nextDetails = [...details];
    nextDetails[index] = {
      ...nextDetails[index],
      [key]: value,
    };
    setDetails(nextDetails);

    if (!reports[index]) {
      const nextReports = [...reports];
      nextReports[index] = {
        category_type: "",
        link_url: "",
        implementation_date: "",
      };
      setReports(nextReports);
    }
  }

  function updateReport(index: number, key: keyof ReportRow, value: string) {
    const nextReports = [...reports];
    nextReports[index] = {
      ...nextReports[index],
      [key]: value,
    };
    setReports(nextReports);
  }

  function addRow() {
    if (details.length >= 7) {
      alert("最大7項目まで追加できます。");
      return;
    }

    setDetails([
      ...details,
      {
        service_item: "",
        quantity: 1,
        unit_price: 0,
      },
    ]);

    setReports([
      ...reports,
      {
        category_type: "",
        link_url: "",
        implementation_date: "",
      },
    ]);
  }

  function removeRow(index: number) {
    if (details.length <= 1) {
      alert("最低1項目は必要です。");
      return;
    }

    setDetails(details.filter((_, i) => i !== index));
    setReports(reports.filter((_, i) => i !== index));
  }

  function validateSingleImage(event: React.ChangeEvent<HTMLInputElement>) {
    setFileError("");

    const files = Array.from(event.target.files || []);

    if (files.length === 0) {
      return;
    }

    if (files.length > 1) {
      setFileError(
        "1項目につきアップロードできるスクリーンショットは1枚までです。複数ある場合はリンク欄にGoogle Driveリンクをご記入ください。"
      );
      event.target.value = "";
      return;
    }

    const file = files[0];

    if (!file.type.startsWith("image/")) {
      setFileError(
        "アップロードできるのは画像のみです。PDF / Excel / 複数ファイルはリンク欄にGoogle Driveリンクをご記入ください。"
      );
      event.target.value = "";
      return;
    }

    if (file.size > 300 * 1024) {
      setFileError(
        "画像は1枚300KB以内にしてください。大きい場合はリンク欄にGoogle Driveリンクをご記入ください。"
      );
      event.target.value = "";
    }
  }

  return (
    <form
      action={action}
      encType="multipart/form-data"
      className="space-y-5 text-sm"
    >
      <input type="hidden" name="project_team_id" value={projectTeamId} />
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="current_status" value={currentStatus} />
      <input type="hidden" name="summary_count" value={summaries.length} />
      <input type="hidden" name="detail_count" value={details.length} />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">① 契約・口座情報</h2>
        <p className="mt-1 text-xs text-slate-500">
          今後も同じ情報を使用する場合は、「次回以降も使用する」を選択してください。
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Field
            label="契約会社名"
            name="company_name"
            defaultValue={defaultCompanyName}
          />
          <Field
            label="銀行名"
            name="bank_name"
            defaultValue={defaultBankName}
          />
          <Field
            label="口座番号"
            name="bank_account_number"
            defaultValue={defaultBankAccountNumber}
          />
          <Field
            label="Swift code"
            name="swift_code"
            defaultValue={defaultSwiftCode}
          />
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            name="save_profile"
            className="h-4 w-4"
            defaultChecked={companyInfo?.used_saved_profile || false}
          />
          この情報を次回以降も使用する
        </label>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">② 検収総表</h2>

          <button
            type="button"
            onClick={addSummaryRow}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            ＋項目追加
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[760px] w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="w-12 px-3 py-2">No.</th>
                <th className="px-3 py-2">今回の支払内容</th>
                <th className="w-48 px-3 py-2">契約上の納品期日</th>
                <th className="w-20 px-3 py-2">削除</th>
              </tr>
            </thead>

            <tbody>
              {summaries.map((row, index) => (
                <tr key={index} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-500">{index + 1}</td>

                  <td className="px-3 py-2">
                    <input
                      name={`payment_content_${index}`}
                      value={row.payment_content}
                      onChange={(e) =>
                        updateSummary(index, "payment_content", e.target.value)
                      }
                      placeholder="例：2025年秋季リーグ補助金"
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 outline-none focus:border-emerald-500"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <input
                      name={`delivery_due_date_${index}`}
                      value={row.delivery_due_date}
                      onChange={(e) =>
                        updateSummary(index, "delivery_due_date", e.target.value)
                      }
                      placeholder="2025-12-31"
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 outline-none focus:border-emerald-500"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeSummaryRow(index)}
                      className="rounded-md border border-rose-300 px-2 py-1 text-rose-700 hover:bg-rose-50"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">③ 精算明細</h2>
            <p className="mt-1 text-xs text-slate-500">
              必要に応じて項目を追加してください。小計は自動計算されます。
            </p>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            ＋項目追加
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[860px] w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="w-12 px-3 py-2">No.</th>
                <th className="px-3 py-2">サービス / 内容項目</th>
                <th className="w-24 px-3 py-2">数量</th>
                <th className="w-32 px-3 py-2">単価</th>
                <th className="w-32 px-3 py-2">小計</th>
                <th className="w-20 px-3 py-2">削除</th>
              </tr>
            </thead>

            <tbody>
              {details.map((row, index) => (
                <tr key={index} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-500">{index + 1}</td>

                  <td className="px-3 py-2">
                    <input
                      name={`service_item_${index}`}
                      value={row.service_item}
                      onChange={(e) =>
                        updateDetail(index, "service_item", e.target.value)
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 outline-none focus:border-emerald-500"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <input
                      name={`quantity_${index}`}
                      type="number"
                      value={row.quantity}
                      onChange={(e) =>
                        updateDetail(index, "quantity", Number(e.target.value))
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 outline-none focus:border-emerald-500"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <input
                      name={`unit_price_${index}`}
                      type="number"
                      value={row.unit_price}
                      onChange={(e) =>
                        updateDetail(
                          index,
                          "unit_price",
                          Number(e.target.value)
                        )
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 outline-none focus:border-emerald-500"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <input
                      name={`subtotal_${index}`}
                      value={totals[index]}
                      readOnly
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="rounded-md border border-rose-300 px-2 py-1 text-rose-700 hover:bg-rose-50"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">④ 結果報告</h2>

        <div className="mt-3 rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-700">
          ※1項目につき、リンクは1つ、スクリーンショットは1枚までです。新しい画像を選択した場合、現在のスクリーンショットを差し替えます。新しい画像を選択しない場合、現在のスクリーンショットは保持されます。
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[1200px] w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="w-12 px-3 py-2">No.</th>
                <th className="px-3 py-2">項目内容</th>
                <th className="w-28 px-3 py-2">種別</th>
                <th className="w-32 px-3 py-2">金額</th>
                <th className="px-3 py-2">リンク</th>
                <th className="w-36 px-3 py-2">実施日</th>
                <th className="w-64 px-3 py-2">スクリーンショット</th>
              </tr>
            </thead>

            <tbody>
              {details.map((detail, index) => {
                const report = reports[index] || {
                  category_type: "",
                  link_url: "",
                  implementation_date: "",
                };

                const uploadedScreenshot = getScreenshotForRow(index);

                return (
                  <tr key={index} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-500">{index + 1}</td>

                    <td className="px-3 py-2">
                      <input
                        name={`item_content_${index}`}
                        value={detail.service_item}
                        readOnly
                        className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700"
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        name={`category_type_${index}`}
                        value={report.category_type}
                        onChange={(e) =>
                          updateReport(index, "category_type", e.target.value)
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 outline-none focus:border-emerald-500"
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        name={`report_amount_${index}`}
                        value={totals[index]}
                        readOnly
                        className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700"
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        name={`link_url_${index}`}
                        value={report.link_url}
                        onChange={(e) =>
                          updateReport(index, "link_url", e.target.value)
                        }
                        placeholder="出演リンクまたはGoogle Driveリンク"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 outline-none focus:border-emerald-500"
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        name={`implementation_date_${index}`}
                        value={report.implementation_date}
                        onChange={(e) =>
                          updateReport(
                            index,
                            "implementation_date",
                            e.target.value
                          )
                        }
                        placeholder="2025-12-31"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 outline-none focus:border-emerald-500"
                      />
                    </td>

                    <td className="px-3 py-2">
                      {uploadedScreenshot?.file_name ? (
                        <div className="mb-2 rounded-md border border-slate-300 bg-white p-2">
                          <p className="text-[11px] text-slate-500">
                            現在のファイル：
                            <span className="text-slate-700">
                              {uploadedScreenshot.file_name}
                            </span>
                          </p>

                          <label className="mt-2 flex items-center gap-2 text-[11px] text-rose-700">
                            <input
                              type="checkbox"
                              name={`delete_screenshot_${index}`}
                              value="true"
                              className="h-3 w-3"
                            />
                            この画像を削除する
                          </label>
                        </div>
                      ) : null}

                      <input
                        type="file"
                        name={`report_screenshot_${index}`}
                        accept="image/*"
                        onChange={validateSingleImage}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
                      />

                      <p className="mt-1 text-[11px] text-slate-500">
                        新しい画像を選択した場合のみ差し替えます。
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <AmountCard label="小計" value={subtotalAmount} />
          <AmountCard label="消費税（10%）" value={taxAmount} />
          <AmountCard label="合計" value={totalAmount} highlight />
        </div>

        {fileError ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {fileError}
          </div>
        ) : null}
      </section>

      <SubmitButtons />
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-950 outline-none focus:border-emerald-500"
      />
    </div>
  );
}

function AmountCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-lg border border-emerald-200 bg-emerald-50 p-4"
          : "rounded-lg border border-slate-200 bg-slate-50 p-4"
      }
    >
      <p className={highlight ? "text-xs text-emerald-700" : "text-xs text-slate-500"}>
        {label}
      </p>
      <p className="mt-1 text-xl font-bold">
        {value.toLocaleString("ja-JP")}
      </p>
    </div>
  );
}
