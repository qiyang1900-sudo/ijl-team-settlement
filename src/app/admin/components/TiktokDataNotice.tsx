import type { TiktokSnapshot } from "@/lib/tiktok-sync-status";

export default function TiktokDataNotice({ snapshot, from, to, team }: { snapshot: TiktokSnapshot | null; from: string; to: string; team?: string | null }) {
  const issues = snapshot?.issues.filter((issue) => issue.month >= from && issue.month <= to && (!team || issue.team === team)) ?? [];
  if (!issues.length) return null;
  return <p className="my-4 rounded-md border border-amber-700 bg-amber-950/30 px-4 py-3 text-sm text-amber-200" role="status">
    TT 源表在当前期间有 {issues.length} 项异常；异常值未按 0 处理，已有有效数据保留。<a href="/admin#tiktok-sync" className="ml-2 underline">查看影响范围及同步明细</a>
  </p>;
}
