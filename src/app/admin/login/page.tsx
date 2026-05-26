export default function AdminLoginPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-md px-6 py-16">
        <a href="/" className="text-sm text-slate-400 hover:text-white">
          ← 首页へ戻る
        </a>

        <h1 className="mt-6 text-3xl font-bold">管理员登录</h1>
        <p className="mt-3 text-slate-400">
          输入管理员账号和密码进入后台。
        </p>

        <form className="mt-8 space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <div>
            <label className="block text-sm text-slate-300">管理员账号</label>
            <input
              placeholder="admin"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300">密码</label>
            <input
              type="password"
              placeholder="password"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </div>

          <a
            href="/admin/dashboard"
            className="block rounded-xl bg-white px-5 py-3 text-center text-sm font-semibold text-slate-950 hover:bg-slate-200"
          >
            登录
          </a>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          ※现在是框架版，后续会接入真实密码验证。
        </p>
      </div>
    </main>
  );
}
