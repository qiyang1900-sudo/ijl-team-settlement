import Link from "next/link";

export default function AdminDashboardPage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">
          ← 返回首页
        </Link>

        <h1 className="mt-4 text-3xl font-bold">管理员后台</h1>
        <p className="mt-3 text-slate-600">
          管理项目进度、战队资料与进度、选手名单、提交审核和月数据审核。
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/projects"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">项目进度</h2>
            <p className="mt-2 text-sm text-slate-600">
              按项目查看各战队的提交状态、审核状态和导出状态。
            </p>
          </Link>

          <Link
            href="/admin/reviews"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">提交审核</h2>
            <p className="mt-2 text-sm text-slate-600">
              直接查看待审核、已退回、重新提交、审核通过的资料。
            </p>
          </Link>

          <Link
            href="/admin/teams"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">战队管理 / 进度</h2>
            <p className="mt-2 text-sm text-slate-600">
              管理战队资料，并按战队查看项目提交和月数据提交进度。
            </p>
          </Link>

          <Link
            href="/admin/reward"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">月数据审核</h2>
            <p className="mt-2 text-sm text-slate-600">
              审核战队提交的选手給与、X、YouTube 和俱乐部活动资料。
            </p>
          </Link>

          <Link
            href="/admin/players"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">选手管理</h2>
            <p className="mt-2 text-sm text-slate-600">
              管理联盟选手名单、所属战队和月数据表选手来源。
            </p>
          </Link>

          <Link
            href="/admin/league-summary"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">联盟数据汇总</h2>
            <p className="mt-2 text-sm text-slate-600">
              查看月数据汇总、可视化和导出框架。
            </p>
          </Link>

          <Link
            href="/admin/monthly-import"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-fuchsia-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">历史月数据导入</h2>
            <p className="mt-2 text-sm text-slate-600">
              粘贴过往 X / YouTube 表格，预览确认后导入为已通过月数据。
            </p>
          </Link>

          <Link
            href="/admin/team-scores"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">战队积分计算</h2>
            <p className="mt-2 text-sm text-slate-600">
              按月计算各战队分数，并整理自动扣分项。
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
