export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <a href="/" className="text-sm text-slate-400 hover:text-white">
          ← 返回首页
        </a>

        <h1 className="mt-4 text-3xl font-bold">管理者后台</h1>

        <p className="mt-3 text-slate-400">
          项目创建、战队管理、审核、提醒、Excel导出都将在这里管理。
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <a
            href="/admin/projects"
            className="rounded-2xl border border-slate-700 bg-slate-900 p-6 hover:bg-slate-800"
          >
            <h2 className="text-xl font-semibold">项目管理</h2>
            <p className="mt-2 text-sm text-slate-400">
              创建结算/结案报告项目，选择参与战队，查看提交状态。
            </p>
          </a>

          <a
            href="/admin/teams"
            className="rounded-2xl border border-slate-700 bg-slate-900 p-6 hover:bg-slate-800"
          >
            <h2 className="text-xl font-semibold">战队管理</h2>
            <p className="mt-2 text-sm text-slate-400">
              管理战队账号、Webhook、常用资料。
            </p>
          </a>

          <a
            href="/admin/projects"
            className="rounded-2xl border border-slate-700 bg-slate-900 p-6 hover:bg-slate-800"
          >
            <h2 className="text-xl font-semibold">提交审核</h2>
            <p className="mt-2 text-sm text-slate-400">
              查看各战队提交内容，通过或退回修改。
            </p>
          </a>

          <a
            href="/admin/reward"
            className="rounded-2xl border border-slate-700 bg-slate-900 p-6 hover:bg-slate-800"
          >
            <h2 className="text-xl font-semibold">奖励金计算</h2>
            <p className="mt-2 text-sm text-slate-400">
              暂未开放，后续用于战队奖励金计算。
            </p>
          </a>
        </div>
      </div>
    </main>
  );
}
