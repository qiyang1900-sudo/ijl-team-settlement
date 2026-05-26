export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10">
          <p className="text-sm text-slate-400">Team Settlement System</p>
          <h1 className="mt-2 text-4xl font-bold">
            戦隊精算・結案報告提出システム
          </h1>
          <p className="mt-4 text-slate-300">
            戦隊の精算資料、結案報告、証憑アップロード、审核、Excel导出を管理するシステムです。
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <a
            href="/admin"
            className="rounded-2xl border border-slate-700 bg-slate-900 p-6 hover:bg-slate-800"
          >
            <h2 className="text-xl font-semibold">管理者后台</h2>
            <p className="mt-3 text-sm text-slate-400">
              项目创建、战队管理、审核、提醒、Excel导出。
            </p>
          </a>

          <a
            href="/team"
            className="rounded-2xl border border-slate-700 bg-slate-900 p-6 hover:bg-slate-800"
          >
            <h2 className="text-xl font-semibold">战队提交入口</h2>
            <p className="mt-3 text-sm text-slate-400">
              战队登录后填写结案报告、上传收据和截图。
            </p>
          </a>

          <a
            href="/admin/reward"
            className="rounded-2xl border border-slate-700 bg-slate-900 p-6 hover:bg-slate-800"
          >
            <h2 className="text-xl font-semibold">奖励金计算</h2>
            <p className="mt-3 text-sm text-slate-400">
              暂未开放，后续用于战队奖励金计算。
            </p>
          </a>
        </div>
      </div>
    </main>
  );
}