import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";

import { Header } from "@/components/layout/header";
import { PageBackground } from "@/components/layout/page-background";
import { Sidebar } from "@/components/layout/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authOptions } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/projects");

  return (
    <TooltipProvider delayDuration={200}>
      <PageBackground />
      <div className="relative z-10 flex h-dvh w-full overflow-hidden">
        <Sidebar isAdmin={session.user.role === "ADMIN"} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header isAdmin={session.user.role === "ADMIN"} />
          <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">{children}</main>
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </TooltipProvider>
  );
}
