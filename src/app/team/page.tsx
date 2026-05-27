export default function TeamPage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <a href="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">
          ← ホームへ戻る
        </a>

        <h1 className="mt-4 text-3xl font-bold">戦隊提出入口</h1>

        <p className="mt-3 text-slate-600">
          提出が必要なプロジェクト、結果報告資料、審査状況を確認できます。
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">請求書と結案報告書提出</h2>

            <p className="mt-2 text-sm text-slate-600">
              現在の提出対象を確認し、下書き保存または審査提出ができます。
            </p>

            <a
              href="/team/projects"
              className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              プロジェクトを見る
            </a>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">月データ提出</h2>

            <p className="mt-2 text-sm text-slate-600">
              選手給与、X、YouTube、クラブ活動の月次データを提出できます。
            </p>

            <a
              href="/team/reward"
              className="mt-6 inline-block rounded-lg bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-500"
            >
              月データを見る
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
