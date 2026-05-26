"use client";

import { useMemo, useState } from "react";
import SubmitButtons from "./SubmitButtons";

type DetailRow = {
  service_item: string;
  quantity: number;
  unit_price: number;
  amount_match: boolean;
  note: string;
};

type ReportRow = {
  category_type: string;
  link_url: string;
  implementation_date: string;
  note: string;
};

export default function SubmissionForm({
  action,
  projectTeamId,
  teamId,
  currentStatus,
  companyInfo,
  profile,
  summaryRow,
  detailRows,
  reportRows,
}: {
  action: (formData: FormData) => void;
  projectTeamId: string;
  teamId: string;
  currentStatus: string;
  companyInfo: any;
  profile: any;
  summaryRow: any;
  detailRows: any[];
  reportRows: any[];
}) {
  const defaultCompanyName =
    companyInfo?.company_name || profile?.company_name || "";
  const defaultBankName = companyInfo?.bank_name || profile?.bank_name || "";
  const defaultBankAccountNumber =
    companyInfo?.bank_account_number || profile?.bank_account_number || "";
  const defaultSwiftCode = companyInfo?.swift_code || profile?.swift_code || "";

  const [details, setDetails] = useState<DetailRow[]>(
    detailRows && detailRows.length > 0
      ? detailRows.map((row) => ({
          service_item: row.service_item || "",
          quantity: Number(row.quantity || 1),
          unit_price: Number(row.unit_price || 0),
          amount_match: row.amount_match !== false,
          note: row.note || "",
        }))
      : [
          {
            service_item: "",
            quantity: 1,
            unit_price: 0,
            amount_match: true,
            note: "",
          },
        ]
  );

  const [reports, setReports] = useState<ReportRow[]>(
    reportRows && reportRows.length > 0
      ? reportRows.map((row) => ({
          category_type: row.category_type || "",
          link_url: row.link_url || "",
          implementation_date: row.implementation_date || "",
          note: row.note || "",
        }))
      : [
          {
            category_type: "",
            link_url: "",
            implementation_date: "",
            note: "",
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
        note: "",
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
    if (details.length >= 10) {
      alert("最大10項目まで追加できます。");
      return;
    }

    setDetails([
      ...details,
      {
        service_item: "",
        quantity: 1,
        unit_price: 0,
        amount_match: true,
        note: "",
      },
    ]);

    setReports([
      ...reports,
      {
        category_type: "",
        link_url: "",
        implementation_date: "",
        note: "",
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
      <input type="hidden" name="detail_count" value={details.length} />

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-lg font-bold">① 契約・口座情報</h2>
        <p className="mt-1 text-xs text-slate-400">
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

        <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            name="save_profile"
            className="h-4 w-4"
            defaultChecked={companyInfo?.used_saved_profile || false}
          />
          この情報を次回以降も使用する
        </label>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-lg font-bold">② 検収総表</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Field
            label="今回の支払内容"
            name="payment_content"
            defaultValue={summaryRow?.payment_content || ""}
            placeholder="例：2025年秋季リーグ補助金"
          />
          <Field
            label="契約上の納品期日"
            name="delivery_due_date"
            defaultValue={summaryRow?.delivery_due_date || ""}
            placeholder="例：2025-12-31"
          />
          <Field
            label="契約支払基準"
            name="contract_payment_standard"
            defaultValue={summaryRow?.contract_payment_standard || "時間通り"}
          />
          <Field
            label="業務完了基準"
            name="completion_standard"
            defaultValue={summaryRow?.completion_standard || "時間通り"}
          />
          <Field
            label="プロジェクトチーム確認"
            name="project_team_confirmation"
            defaultValue={summaryRow?.project_team_confirmation || "確認"}
          />
          <Field
            label="備考"
            name="summary_note"
            defaultValue={summaryRow?.note || "全額支払い"}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">③ 精算明細</h2>
            <p className="mt-1 text-xs text-slate-400">
              必要に応じて項目を追加してください。小計は自動計算されます。
            </p>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-slate-200"
          >
            ＋項目追加
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-700">
          <table className="min-w-[1100px] w-full border-collapse text-left text-xs">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="w-12 px-3 py-2">No.</th>
                <th className="px-3 py-2">サービス / 内容項目</th>
                <th className="w-24 px-3 py-2">数量</th>
                <th className="w-32 px-3 py-2">単価</th>
                <th className="w-32 px-3 py-2">小計</th>
                <th className="w-32 px-3 py-2">金額一致</th>
                <th className="px-3 py-2">備考</th>
                <th className="w-20 px-3 py-2">削除</th>
              </tr>
            </thead>

            <tbody>
              {details.map((row, index) => (
                <tr key={index} className="border-t border-slate-700">
                  <td className="px-3 py-2 text-slate-400">{index + 1}</td>

                  <td className="px-3 py-2">
                    <input
                      name={`service_item_${index}`}
                      value={row.service_item}
                      onChange={(e) =>
                        updateDetail(index, "service_item", e.target.value)
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 outline-none focus:border-white"
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
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 outline-none focus:border-white"
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
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 outline-none focus:border-white"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <input
                      name={`subtotal_${index}`}
                      value={totals[index]}
                      readOnly
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-slate-300"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <select
                      name={`amount_match_${index}`}
                      value={row.amount_match ? "true" : "false"}
                      onChange={(e) =>
                        updateDetail(
                          index,
                          "amount_match",
                          e.target.value === "true"
                        )
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 outline-none focus:border-white"
                    >
                      <option value="true">はい</option>
                      <option value="false">いいえ</option>
                    </select>
                  </td>

                  <td className="px-3 py-2">
                    <input
                      name={`detail_note_${index}`}
                      value={row.note}
                      onChange={(e) =>
                        updateDetail(index, "note", e.target.value)
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 outline-none focus:border-white"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="rounded-md border border-red-500 px-2 py-1 text-red-300 hover:bg-red-950"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-lg font-bold">④ 結案報告・証憑提出</h2>
        <p className="mt-1 text-xs text-slate-400">
          精算明細の項目数に合わせて自動生成されます。リンク欄には、出演費関連の場合の出演当日リンク、または資料が多い場合のGoogle Driveリンクをご記入ください。
        </p>

        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
          ※1項目につき、リンクは1つ、スクリーンショットは1枚までです。複数資料がある場合は、リンク欄にGoogle Driveリンクをご記入ください。
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-700">
          <table className="min-w-[1250px] w-full border-collapse text-left text-xs">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="w-12 px-3 py-2">No.</th>
                <th className="px-3 py-2">項目内容</th>
                <th className="w-28 px-3 py-2">種別</th>
                <th className="w-32 px-3 py-2">金額</th>
                <th className="px-3 py-2">リンク</th>
                <th className="w-36 px-3 py-2">実施日</th>
                <th className="w-56 px-3 py-2">スクリーンショット</th>
                <th className="px-3 py-2">備考</th>
              </tr>
            </thead>

            <tbody>
              {details.map((detail, index) => {
                const report = reports[index] || {
                  category_type: "",
                  link_url: "",
                  implementation_date: "",
                  note: "",
                };

                return (
                  <tr key={index} className="border-t border-slate-700">
                    <td className="px-3 py-2 text-slate-400">{index + 1}</td>

                    <td className="px-3 py-2">
                      <input
                        name={`item_content_${index}`}
                        value={detail.service_item}
                        readOnly
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-slate-300"
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        name={`category_type_${index}`}
                        value={report.category_type}
                        onChange={(e) =>
                          updateReport(index, "category_type", e.target.value)
                        }
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 outline-none focus:border-white"
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        name={`report_amount_${index}`}
                        value={totals[index]}
                        readOnly
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-slate-300"
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
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 outline-none focus:border-white"
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
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 outline-none focus:border-white"
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        type="file"
                        name={`report_screenshot_${index}`}
                        accept="image/*"
                        onChange={validateSingleImage}
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2"
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        name={`report_note_${index}`}
                        value={report.note}
                        onChange={(e) =>
                          updateReport(index, "note", e.target.value)
                        }
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 outline-none focus:border-white"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {fileError ? (
          <div className="mt-3 rounded-lg border border-red-500 bg-red-950 p-3 text-xs text-red-200">
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
      <label className="block text-xs font-medium text-slate-300">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm outline-none focus:border-white"
      />
    </div>
  );
}
