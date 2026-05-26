import { createClient } from "@supabase/supabase-js";

export default async function AdminSubmissionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; projectTeamId: string }>;
}) {
  const { projectId, projectTeamId } = await params;

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
    .select(`
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
    `)
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

  if (projectTeamError || !projectTeam) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <div className="mx-auto max-w-5xl">
          <a
            href={`/admin/projects/${projectId}`}
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 项目详情へ戻る
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

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <a
            href={`/admin/projects/${projectId}`}
            className="text-sm text-slate-400 hover:text-white"
          >
            ← 项目详情へ戻る
          </a>

          <h1 className="mt-4 text-3xl font-bold">提交详情</h1>
          <p className="mt-2 text-slate-400">
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
              <p className="mt-2 font-semibold">{projectTeam.status}</p>
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
        </div>

        <section className="mt-10 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">契約・口座情報</h2>

          {!companyInfo ? (
            <p className="mt-4 text-slate-400">暂无提交资料。</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Info label="契約会社名" value={companyInfo.company_name} />
              <Info label="銀行名" value={companyInfo.bank_name} />
              <Info label="口座番号" value={companyInfo.bank_account_number} />
              <Info label="Swift code" value={companyInfo.swift_code} />
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">検収総表</h2>

          {!summaryRows || summaryRows.length === 0 ? (
            <p className="mt-4 text-slate-400">暂无提交资料。</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">今回の支払内容</th>
                    <th className="px-4 py-3">納品期日</th>
                    <th className="px-4 py-3">支払基準</th>
                    <th className="px-4 py-3">完了基準</th>
                    <th className="px-4 py-3">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row: any) => (
                    <tr key={row.id} className="border-t border-slate-700">
                      <td className="px-4 py-3">{row.payment_content || "-"}</td>
                      <td className="px-4 py-3">{row.delivery_due_date || "-"}</td>
                      <td className="px-4 py-3">{row.contract_payment_standard || "-"}</td>
                      <td className="px-4 py-3">{row.completion_standard || "-"}</td>
                      <td className="px-4 py-3">{row.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">精算明細</h2>

          {!detailRows || detailRows.length === 0 ? (
            <p className="mt-4 text-slate-400">暂无提交资料。</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">サービス / 内容項目</th>
                    <th className="px-4 py-3">数量</th>
                    <th className="px-4 py-3">単価</th>
                    <th className="px-4 py-3">小計</th>
                    <th className="px-4 py-3">一致</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((row: any) => (
                    <tr key={row.id} className="border-t border-slate-700">
                      <td className="px-4 py-3">{row.service_item || "-"}</td>
                      <td className="px-4 py-3">{row.quantity || "-"}</td>
                      <td className="px-4 py-3">{row.unit_price || "-"}</td>
                      <td className="px-4 py-3">{row.subtotal || "-"}</td>
                      <td className="px-4 py-3">{row.amount_match ? "はい" : "いいえ"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">結案報告</h2>

          {!reportRows || reportRows.length === 0 ? (
            <p className="mt-4 text-slate-400">暂无提交资料。</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">項目内容</th>
                    <th className="px-4 py-3">種別</th>
                    <th className="px-4 py-3">金額</th>
                    <th className="px-4 py-3">リンク</th>
                    <th className="px-4 py-3">実施日</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row: any) => (
                    <tr key={row.id} className="border-t border-slate-700">
                      <td className="px-4 py-3">{row.item_content || "-"}</td>
                      <td className="px-4 py-3">{row.category_type || "-"}</td>
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
                      <td className="px-4 py-3">{row.implementation_date || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">上传文件</h2>

          {!files || files.length === 0 ? (
            <p className="mt-4 text-slate-400">暂无上传文件。</p>
          ) : (
            <div className="mt-4 space-y-3">
              {files.map((file: any) => (
                <div
                  key={file.id}
                  className="rounded-xl border border-slate-700 bg-slate-950 p-4"
                >
                  <p className="font-semibold">{file.file_name || file.file_category || "文件"}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {file.submit_method || "-"} / {file.mime_type || "-"}
                  </p>
                  {file.external_url ? (
                    <a href={file.external_url} target="_blank" className="mt-2 block text-sm underline">
                      Google Drive / 外部链接
                    </a>
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