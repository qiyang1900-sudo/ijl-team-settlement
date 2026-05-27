import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getAdminStatusLabel } from "@/lib/status-labels";
import ImagePreview from "./ImagePreview";

async function approveSubmission(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const projectTeamId = String(formData.get("project_team_id") || "");

  const { error } = await supabase
    .from("project_teams")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      return_reason: null,
    })
    .eq("id", projectTeamId);

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("review_logs").insert({
    project_team_id: projectTeamId,
    action: "approved",
    comment: "审核通过",
  });

  redirect("/admin/reviews");
}

async function returnSubmission(formData: FormData) {
  "use server";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量没有设置成功");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const projectTeamId = String(formData.get("project_team_id") || "");
  const returnReason = String(formData.get("return_reason") || "");

  const { error } = await supabase
    .from("project_teams")
    .update({
      status: "returned",
      returned_at: new Date().toISOString(),
      return_reason: returnReason,
    })
    .eq("id", projectTeamId);

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("review_logs").insert({
    project_team_id: projectTeamId,
    action: "returned",
    comment: returnReason || "退回修改",
  });

  redirect("/admin/reviews");
}

export default async function AdminSubmissionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; projectTeamId: string }>;
}) {
  const { projectTeamId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">提交详情</h1>
        <p className="mt-4 text-red-400">Supabase 环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: projectTeam, error: projectTeamError } = await supabase
    .from("project_teams")
    .select(
      `
      id,
      status,
      submitted_at,
      returned_at,
      approved_at,
      exported_at,
      return_reason,
      admin_note,
      projects (
        id,
        title,
        description,
        template_type,
        deadline_at,
        edit_deadline_at,
        status
      ),
      teams (
        id,
        name,
        short_name
      )
    `
    )
    .eq("id", projectTeamId)
    .single();

  const { data: companyInfo } = await supabase
    .from("submission_company_info")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .maybeSingle();

  const { data: summaryRows } = await supabase
    .from("settlement_summary_rows")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("row_number", { ascending: true });

  const { data: detailRows } = await supabase
    .from("settlement_detail_rows")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("row_number", { ascending: true });

  const { data: reportRows } = await supabase
    .from("report_rows")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("row_number", { ascending: true });

  const { data: files } = await supabase
    .from("submission_files")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("created_at", { ascending: false });

  const { data: reviewLogs } = await supabase
    .from("review_logs")
    .select("*")
    .eq("project_team_id", projectTeamId)
    .order("created_at", { ascending: false });

  function getReportScreenshot(rowNumber: number) {
    return files?.find((file: any) => {
      return (
        file.file_category === "report_screenshot" &&
        String(file.note || "").includes(`No.${rowNumber}`)
      );
    });
  }

  if (projectTeamError || !projectTeam) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <div className="mx-auto max-w-5xl">
          <a
            href="/admin/reviews"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 返回提交审核
          </a>

          <div className="mt-6 rounded-xl border border-red-500 bg-red-950 p-5">
            <p className="font-bold text-red-300">提交详情读取失败</p>
            <p className="mt-2 text-sm text-red-200">
              {projectTeamError?.message || "数据不存在"}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const project: any = projectTeam.projects;
  const team: any = projectTeam.teams;
  const reportSubtotal =
    reportRows?.reduce((sum: number, row: any) => {
      const amount = Number(row?.amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0) || 0;
  const reportTax = Math.round(reportSubtotal * 0.1);
  const reportTotal = reportSubtotal + reportTax;

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <a
            href="/admin/reviews"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 返回提交审核
          </a>

          <h1 className="mt-4 text-3xl font-bold">提交详情</h1>

          {["approved", "exported"].includes(projectTeam.status) ? (
            <a
              href={`/api/admin/project-teams/${projectTeamId}/export`}
              className="mt-4 inline-block rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
            >
              导出 Excel
            </a>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              审核通过后可导出指定模版 Excel。
            </p>
          )}

          <p className="mt-4 text-slate-400">
            {project?.title || "-"} / {team?.name || "-"}
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <p className="text-sm text-slate-500">战队</p>
              <p className="mt-2 font-semibold">{team?.name || "-"}</p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <p className="text-sm text-slate-500">简称</p>
              <p className="mt-2 font-semibold">{team?.short_name || "-"}</p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <p className="text-sm text-slate-500">提交状态</p>
              <p className="mt-2 font-semibold">
                {getAdminStatusLabel(projectTeam.status)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <p className="text-sm text-slate-500">提交时间</p>
              <p className="mt-2 font-semibold">
                {projectTeam.submitted_at
                  ? new Date(projectTeam.submitted_at).toLocaleString("ja-JP")
                  : "-"}
              </p>
            </div>
          </div>

          {projectTeam.return_reason ? (
            <div className="mt-6 rounded-xl border border-yellow-500 bg-yellow-950 p-5 text-yellow-100">
              <p className="font-bold">退回理由</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {projectTeam.return_reason}
              </p>
            </div>
          ) : null}
        </div>

        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">审核操作</h2>

          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <form
              action={approveSubmission}
              className="rounded-xl border border-slate-700 bg-slate-950 p-5"
            >
              <input
                type="hidden"
                name="project_team_id"
                value={projectTeamId}
              />

              <p className="text-sm text-slate-400">
                确认资料没有问题后，可以点击审核通过。
              </p>

              <button
                type="submit"
                className="mt-4 rounded-xl bg-green-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-green-300"
              >
                审核通过
              </button>
            </form>

            <form
              action={returnSubmission}
              className="rounded-xl border border-slate-700 bg-slate-950 p-5"
            >
              <input
                type="hidden"
                name="project_team_id"
                value={projectTeamId}
              />

              <label className="block text-sm font-medium text-slate-300">
                退回理由
              </label>

              <textarea
                name="return_reason"
                rows={5}
                placeholder="例：截图中无法确认对应选手的出演情况，请补充后再次提交。"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-white"
              />

              <button
                type="submit"
                className="mt-4 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-yellow-300"
              >
                退回修改
              </button>
            </form>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">合同/账户信息</h2>

          {!companyInfo ? (
            <p className="mt-4 text-slate-400">暂无提交资料。</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Info label="合同公司名" value={companyInfo.company_name} />
              <Info label="银行名" value={companyInfo.bank_name} />
              <Info label="口座号码" value={companyInfo.bank_account_number} />
              <Info label="Swift code" value={companyInfo.swift_code} />
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">验收总表</h2>

          {!summaryRows || summaryRows.length === 0 ? (
            <p className="mt-4 text-slate-400">暂无提交资料。</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">本次支付内容</th>
                    <th className="px-4 py-3">合同交付日期</th>
                  </tr>
                </thead>

                <tbody>
                  {summaryRows.map((row: any) => (
                    <tr key={row.id} className="border-t border-slate-700">
                      <td className="px-4 py-3">
                        {row.payment_content || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {row.delivery_due_date || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">结算明细</h2>

          {!detailRows || detailRows.length === 0 ? (
            <p className="mt-4 text-slate-400">暂无提交资料。</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">No.</th>
                    <th className="px-4 py-3">服务/内容项目</th>
                    <th className="px-4 py-3">数量</th>
                    <th className="px-4 py-3">单价</th>
                    <th className="px-4 py-3">小计</th>
                  </tr>
                </thead>

                <tbody>
                  {detailRows.map((row: any) => (
                    <tr key={row.id} className="border-t border-slate-700">
                      <td className="px-4 py-3 text-slate-400">
                        {row.row_number || "-"}
                      </td>
                      <td className="px-4 py-3">{row.service_item || "-"}</td>
                      <td className="px-4 py-3">{row.quantity || "-"}</td>
                      <td className="px-4 py-3">{row.unit_price || "-"}</td>
                      <td className="px-4 py-3">{formatSubtotal(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">结果报告</h2>

          {!reportRows || reportRows.length === 0 ? (
            <p className="mt-4 text-slate-400">暂无提交资料。</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700">
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">No.</th>
                    <th className="px-4 py-3">项目内容</th>
                    <th className="px-4 py-3">类型</th>
                    <th className="px-4 py-3">金额</th>
                    <th className="px-4 py-3">链接</th>
                    <th className="px-4 py-3">截图</th>
                    <th className="px-4 py-3">实施日期</th>
                  </tr>
                </thead>

                <tbody>
                  {reportRows.map((row: any) => {
                    const screenshot = getReportScreenshot(row.row_number);

                    return (
                      <tr key={row.id} className="border-t border-slate-700">
                        <td className="px-4 py-3 text-slate-400">
                          {row.row_number || "-"}
                        </td>

                        <td className="px-4 py-3">
                          {row.item_content || "-"}
                        </td>

                        <td className="px-4 py-3">
                          {row.category_type || "-"}
                        </td>

                        <td className="px-4 py-3">{row.amount || "-"}</td>

                        <td className="px-4 py-3">
                          {row.link_url ? (
                            <a
                              href={row.link_url}
                              target="_blank"
                              className="underline"
                            >
                              打开链接
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {screenshot?.file_url ? (
                            <ImagePreview
                              imageUrl={screenshot.file_url}
                              fileName={screenshot.file_name}
                            />
                          ) : (
                            "-"
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {row.implementation_date || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <AmountInfo label="小计" value={reportSubtotal} />
            <AmountInfo label="消费税（10%）" value={reportTax} />
            <AmountInfo label="合计" value={reportTotal} highlight />
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">审核记录</h2>

          {!reviewLogs || reviewLogs.length === 0 ? (
            <p className="mt-4 text-slate-400">暂无审核记录。</p>
          ) : (
            <div className="mt-4 space-y-3">
              {reviewLogs.map((log: any) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-slate-700 bg-slate-950 p-4"
                >
                  <p className="font-semibold">{log.action}</p>

                  <p className="mt-1 text-sm text-slate-400">
                    {log.created_at
                      ? new Date(log.created_at).toLocaleString("ja-JP")
                      : "-"}
                  </p>

                  {log.comment ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">
                      {log.comment}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 font-semibold">{value || "-"}</p>
    </div>
  );
}

function AmountInfo({
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
          ? "rounded-xl border border-green-500 bg-green-950 p-4"
          : "rounded-xl border border-slate-700 bg-slate-950 p-4"
      }
    >
      <p className={highlight ? "text-sm text-green-200" : "text-sm text-slate-500"}>
        {label}
      </p>
      <p className="mt-2 text-xl font-bold">{value.toLocaleString("zh-CN")}</p>
    </div>
  );
}

function formatSubtotal(row: any) {
  const storedSubtotal = Number(row?.subtotal);

  if (Number.isFinite(storedSubtotal) && storedSubtotal !== 0) {
    return storedSubtotal;
  }

  const quantity = Number(row?.quantity || 0);
  const unitPrice = Number(row?.unit_price || 0);
  const subtotal = quantity * unitPrice;

  return Number.isFinite(subtotal) ? subtotal : "-";
}
