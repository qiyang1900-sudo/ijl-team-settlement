import Link from "next/link";
import { redirect } from "next/navigation";
import { setAdminSession, verifyAdminPassword } from "@/lib/admin-auth";

async function loginAdmin(formData: FormData) {
  "use server";

  const password = String(formData.get("password") || "");
  const nextPath = getSafeAdminNextPath(formData.get("next"));

  if (!verifyAdminPassword(password)) {
    redirect(
      `/admin/login?error=invalid&next=${encodeURIComponent(nextPath)}`
    );
  }

  await setAdminSession();
  redirect(nextPath);
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const nextPath = getSafeAdminNextPath(next);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-md px-6 py-16">
        <Link href="/" className="text-sm text-slate-400 hover:text-white">
          ← 返回首页
        </Link>

        <h1 className="mt-6 text-3xl font-bold">管理员登录</h1>
        <p className="mt-3 text-slate-400">
          输入管理员密码进入后台。
        </p>

        <form
          action={loginAdmin}
          className="mt-8 space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6"
        >
          <input type="hidden" name="next" value={nextPath} />

          <div>
            <label className="block text-sm text-slate-300">管理员账号</label>
            <input
              name="username"
              placeholder="admin"
              defaultValue="admin"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300">密码</label>
            <input
              name="password"
              type="password"
              placeholder="password"
              autoComplete="current-password"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </div>

          {error === "invalid" ? (
            <p className="rounded-xl border border-red-500/50 bg-red-950/50 px-4 py-3 text-sm text-red-100">
              密码不正确，请重新输入。
            </p>
          ) : null}

          <button
            type="submit"
            className="block w-full rounded-xl bg-white px-5 py-3 text-center text-sm font-semibold text-slate-950 hover:bg-slate-200"
          >
            登录
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          ※管理员密码已启用。
        </p>
      </div>
    </main>
  );
}

function getSafeAdminNextPath(value: FormDataEntryValue | string | null | undefined) {
  const path = String(value || "/admin/dashboard");

  if (!path.startsWith("/admin") || path.startsWith("/admin/login")) {
    return "/admin/dashboard";
  }

  return path;
}
