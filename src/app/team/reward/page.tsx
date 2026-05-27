import { createClient } from "@supabase/supabase-js";

type ContentIncentiveRow = Record<string, any>;

export default async function TeamRewardPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string }>;
}) {
  const { teamId } = await searchParams;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let team: ContentIncentiveRow | null = null;
  let rows: ContentIncentiveRow[] = [];

  if (teamId && supabaseUrl && supabaseAnonKey) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: teamData } = await supabase
      .from("teams")
      .select("id, name, short_name")
      .eq("id", teamId)
      .maybeSingle();

    team = teamData;

    const { data } = await supabase
      .from("content_incentive_monthly")
      .select("*")
      .eq("team_id", teamId);

    rows = (data || [])
      .map(normalizeIncentiveRow)
      .sort((a, b) => String(b.month).localeCompare(String(a.month)));
  }

  if (!teamId) {
    return (
      <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <h1 className="text-3xl font-bold">コンテンツ奨励</h1>
          <p className="mt-4 text-rose-600">
            戦隊が選択されていません。ログインページから入り直してください。
          </p>
          <a
            href="/team/login"
            className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"
          >
            戦隊ログインへ戻る
          </a>
        </div>
      </main>
    );
  }

  const totalScore = rows.reduce((sum, row) => sum + toNumber(row.score), 0);
  const totalAmount = rows.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const latestRow = rows[0];
  const dashboardHref = `/team/dashboard?teamId=${encodeURIComponent(teamId)}`;

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <a href={dashboardHref} className="text-sm font-medium text-slate-500 hover:text-slate-900">
          ← 戦隊ダッシュボードへ戻る
        </a>

        <div className="mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-3xl font-bold">コンテンツ奨励</h1>
            <p className="mt-3 text-slate-600">
              {team?.name || "読み込み中"}
              {team?.short_name ? `（${team.short_name}）` : ""} の月別実績を確認できます。
            </p>
          </div>

          <div className="rounded-full bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
            X / TT / YouTube
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="最新月"
            value={latestRow ? formatMonth(latestRow.month) : "-"}
          />
          <SummaryCard label="累計スコア" value={formatNumber(totalScore)} />
          <SummaryCard
            label="累計奨励金"
            value={formatCurrency(totalAmount)}
            highlight
          />
        </div>

        <section className="mt-8 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold">月別データ</h2>
          </div>

          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-medium text-slate-700">
                まだコンテンツ奨励データが登録されていません。
              </p>
              <p className="mt-2 text-sm text-slate-500">
                月次データが登録されると、ここにX、TT、YouTube、スコア、金額が表示されます。
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">対象月</th>
                    <th className="px-4 py-3">X</th>
                    <th className="px-4 py-3">TT</th>
                    <th className="px-4 py-3">YouTube</th>
                    <th className="px-4 py-3">月間スコア</th>
                    <th className="px-4 py-3">奨励金</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id || row.month} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium">
                        {formatMonth(row.month)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatNumber(row.xCount)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatNumber(row.ttCount)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatNumber(row.youtubeCount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {formatNumber(row.score)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">
                        {formatCurrency(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${highlight ? "text-emerald-700" : "text-slate-950"}`}>
        {value}
      </p>
    </div>
  );
}

function normalizeIncentiveRow(row: ContentIncentiveRow) {
  return {
    ...row,
    month:
      row.target_month ||
      row.month ||
      row.report_month ||
      row.period ||
      row.created_month ||
      "",
    xCount:
      row.x_count ||
      row.x_posts ||
      row.x_value ||
      row.twitter_count ||
      row.twitter_posts ||
      0,
    ttCount:
      row.tt_count ||
      row.tt_posts ||
      row.tiktok_count ||
      row.tiktok_posts ||
      0,
    youtubeCount:
      row.youtube_count ||
      row.youtube_posts ||
      row.yt_count ||
      row.yt_posts ||
      0,
    score: row.monthly_score || row.score || row.points || 0,
    amount: row.reward_amount || row.amount || row.payment_amount || 0,
  };
}

function toNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatNumber(value: unknown) {
  return new Intl.NumberFormat("ja-JP").format(toNumber(value));
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatMonth(value: unknown) {
  const rawValue = String(value || "");

  if (/^\d{4}-\d{2}/.test(rawValue)) {
    const [year, month] = rawValue.split("-");
    return `${year}年${month}月`;
  }

  if (/^\d{6}$/.test(rawValue)) {
    return `${rawValue.slice(0, 4)}年${rawValue.slice(4)}月`;
  }

  return rawValue || "-";
}
