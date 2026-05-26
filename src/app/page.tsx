export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-12 text-center">
          <p className="text-sm text-slate-400">Team Settlement System</p>
          <h1 className="mt-3 text-4xl font-bold">
            戦隊精算・結案報告提出システム
          </h1>
          <p className="mt-4 text-slate-400">
            管理者と戦隊で入口を分けて、精算資料・結案報告・审核進捗を管理します。
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <a
            href="/admin/login"
            className="rounded-2xl border border-slate-700 bg-slate-900 p-8 hover:bg-slate-800"
          >
            <h2 className="text-2xl font-bold">管理员入口</h2>
            <p className="mt-3 text-slate-400">
              项目管理、战队管理、提交审核、奖励金计算入口。
            </p>
          </a>

          <a
            href="/team/login"
            className="rounded-2xl border border-slate-700 bg-slate-900 p-8 hover:bg-slate-800"
          >
            <h2 className="text-2xl font-bold">战队入口</h2>
            <p className="mt-3 text-slate-400">
              查看自己的提交项目、填写资料、确认审核进度。
            </p>
          </a>
        </div>
      </div>
    </main>
  );
}
