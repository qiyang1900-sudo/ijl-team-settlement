import type { TiktokSnapshot } from "@/lib/tiktok-sync-status";

export default function TiktokDataNotice({ snapshot, from, to, team }: { snapshot: TiktokSnapshot | null; from: string; to: string; team?: string | null }) {
  const issues = snapshot?.issues.filter((issue) => issue.month >= from && issue.month <= to && (!team || issue.team === team)) ?? [];
  if (!issues.length) return null;
  return <p className="my-4 rounded-md border border-amber-700 bg-amber-950/30 px-4 py-3 text-sm text-amber-200" role="status">
    TT 源表在当前期间有 {issues.length} 行异常未更新；已有有效数据保留，无历史值的账号暂未计入。<a href="/admin#tiktok-sync" className="ml-2 underline">查看同步明细</a>
  </p>;
}
