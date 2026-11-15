import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { DailyBreakdownWorkbench } from "@/components/breakdown/daily-breakdown-workbench";
import { authOptions } from "@/lib/auth";
import { getDailyBreakdown } from "@/lib/daily-breakdown";
import { findOwnedProject } from "@/lib/project-access";

export default async function DailyBreakdownPage({ params }: { params: { id: string; shootDayId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !await findOwnedProject(params.id, session.user.id, session.user.role)) notFound();
  const data = await getDailyBreakdown(params.id, params.shootDayId);
  if (!data) notFound();
  return <DailyBreakdownWorkbench projectId={params.id} initialData={data} />;
}
