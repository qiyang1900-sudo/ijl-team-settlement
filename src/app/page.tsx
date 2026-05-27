export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-12 text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-slate-500">
            TEAM SETTLEMENT SYSTEM
          </p>
          <h1 className="mt-3 text-4xl font-bold">
            戦隊精算・結案報告提出システム
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">
            管理者入口と戦隊入口を分けて、精算資料・結果報告・審査進捗を管理します。
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <a
            href="/admin/login"
            className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
          >
            <p className="mb-4 inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              管理员
            </p>
            <h2 className="text-2xl font-bold">管理员入口</h2>
            <p className="mt-3 text-slate-600">
              项目管理、战队管理、提交审核、奖励金计算入口。
            </p>
          </a>

          <a
            href="/team/login"
            className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
          >
            <p className="mb-4 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              戦隊
            </p>
            <h2 className="text-2xl font-bold">戦隊入口</h2>
            <p className="mt-3 text-slate-600">
              請求書と結案報告書の確認、資料入力、審査状況の確認はこちら。
            </p>
          </a>
        </div>
      </div>
    </main>
  );
}
