import BackupPanel from "./BackupPanel";
export default async function BackupPage({ searchParams }: { searchParams: Promise<{ authorization?: string }> }) {
  return <BackupPanel authorization={(await searchParams).authorization} />;
}
