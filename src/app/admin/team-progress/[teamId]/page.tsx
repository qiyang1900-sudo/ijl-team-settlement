import { redirect } from "next/navigation";

export default async function TeamProgressDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  redirect(`/admin/teams/${teamId}`);
}
