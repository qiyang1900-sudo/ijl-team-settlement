export default function TeamDashboardPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <a href="/" className="text-sm text-slate-400 hover:text-white">
          ← 首页へ戻る
        </a>

        <h1 className="mt-4 text-3xl font-bold">战队后台</h1>
        <p className="mt-3 text-slate-400">
          查看自己的提交项目、审核状态和奖励金信息。
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <a
            href="/team/projects"
            className="rounded-2xl border border-slate-700 bg-slate-900 p-6 hover:bg-slate-800"
          >
            <h2 className="text-xl font-semibold">我的提交项目</h2>
            <p className="mt-2 text-sm text-slate-400">
              查看需要提交的项目、填写资料、保存草稿、提交审核。
            </p>
          </a>

          <a
            href="/team/reward"
            className="rounded-2xl border border-slate-700 bg-slate-900 p-6 hover:bg-slate-800"
          >
            <h2 className="text-xl font-semibold">我的奖励金</h2>
            <p className="mt-2 text-sm text-slate-400">
              暂未开放，后续显示战队奖励金相关内容。
            </p>
          </a>
        </div>
      </div>
    </main>
  );
}
