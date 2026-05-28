import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">
          ← 返回首页
        </Link>

        <h1 className="mt-4 text-3xl font-bold">管理员后台</h1>

        <p className="mt-3 text-slate-600">
          项目创建、战队管理、审核、提醒、Excel导出都将在这里管理。
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/projects"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">项目管理</h2>
            <p className="mt-2 text-sm text-slate-600">
              创建结算/结案报告项目，选择参与战队，查看提交状态。
            </p>
          </Link>

          <Link
            href="/admin/teams"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">战队管理 / 进度</h2>
            <p className="mt-2 text-sm text-slate-600">
              管理战队账号、Webhook、常用资料，并查看项目和月数据进度。
            </p>
          </Link>

          <Link
            href="/admin/reviews"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">提交审核</h2>
            <p className="mt-2 text-sm text-slate-600">
              查看各战队提交内容，通过或退回修改。
            </p>
          </Link>

          <Link
            href="/admin/reward"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">月数据审核</h2>
            <p className="mt-2 text-sm text-slate-600">
              审核战队提交的月数据资料。
            </p>
          </Link>

          <Link
            href="/admin/players"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">选手管理</h2>
            <p className="mt-2 text-sm text-slate-600">
              管理选手当前所属战队，供月数据表自动同步。
            </p>
          </Link>

          <Link
            href="/admin/league-summary"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">联盟数据汇总</h2>
            <p className="mt-2 text-sm text-slate-600">
              按月份和期间查看联盟数据汇总框架。
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
