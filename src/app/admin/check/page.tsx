import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function CheckPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <h1 className="text-3xl font-bold">Supabase Connection Check</h1>
        <p className="mt-4 text-red-400">环境变量没有设置成功。</p>
      </main>
    );
  }

  const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase
    .from("teams")
    .select("id, name")
    .limit(5);

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <h1 className="text-3xl font-bold">Supabase Connection Check</h1>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500 bg-red-950 p-5">
          <p className="font-bold text-red-300">连接失败</p>
          <p className="mt-2 text-sm text-red-200">{error.message}</p>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-green-500 bg-green-950 p-5">
          <p className="font-bold text-green-300">连接成功</p>
          <p className="mt-2 text-sm text-green-200">
            已成功读取 teams 表。当前读取到 {data?.length ?? 0} 条数据。
          </p>
        </div>
      )}
    </main>
  );
}