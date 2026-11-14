"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { GLASS_CHROME_BG, GLASS_CHROME_BORDER_COLOR, GLASS_CHROME_BORDER_WIDTH_B } from "@/lib/glass";
import { getActiveModule, MODULE_BADGE_CLASS, MODULE_LABEL } from "@/lib/module-theme";
import { cn } from "@/lib/utils";

import { MobileNavigation } from "./sidebar";

export function Header({ isAdmin }: { isAdmin?: boolean }) {
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const activeModule = getActiveModule(pathname);
  const [activeProjectTitle, setActiveProjectTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) {
      setActiveProjectTitle(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/projects/${params.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setActiveProjectTitle(data?.titulo ?? null);
      })
      .catch(() => {
        if (!cancelled) setActiveProjectTitle(null);
      });

    return () => {
      cancelled = true;
    };
  }, [params?.id]);

  return (
    <header
      className={cn(
        "flex min-h-14 shrink-0 items-center gap-3 rounded-b-2xl px-4 py-3",
        GLASS_CHROME_BORDER_WIDTH_B,
        GLASS_CHROME_BG,
        GLASS_CHROME_BORDER_COLOR
      )}
    >
      <MobileNavigation isAdmin={isAdmin} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
          Projetos
        </Link>
        {activeProjectTitle && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 break-words text-base font-semibold text-foreground [overflow-wrap:anywhere]">{activeProjectTitle}</span>
          </>
        )}
        {activeModule && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${MODULE_BADGE_CLASS[activeModule]}`}
          >
            {MODULE_LABEL[activeModule]}
          </span>
        )}
      </div>
    </header>
  );
}
