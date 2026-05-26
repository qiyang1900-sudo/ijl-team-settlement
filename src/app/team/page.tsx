export default function TeamPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <a href="/" className="text-sm text-slate-400 hover:text-white">
          ← 首页へ戻る
        </a>

        <h1 className="mt-4 text-3xl font-bold">战队提交入口</h1>

        <p className="mt-3 text-slate-400">
          战队可以在这里查看需要提交的项目、填写结案报告资料、确认审核状态。
        </p>

        <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">我的提交项目</h2>

          <p className="mt-2 text-sm text-slate-400">
            查看当前需要提交的项目，并进行填写、保存草稿或提交审核。
          </p>

          <a
            href="/team/projects"
            className="mt-6 inline-block rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200"
          >
            查看提交项目
          </a>
        </div>
      </div>
    </main>
  );
}
