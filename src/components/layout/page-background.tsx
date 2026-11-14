"use client";

import { usePathname } from "next/navigation";

import { getActiveModule, MODULE_ACCENT_VAR } from "@/lib/module-theme";

/** Fundo e dois orbs na cor do módulo ativo. Ausente do Modo Set.
 * As variáveis CSS respondem à troca de tema sem reidratação ou efeitos em listas. */
export function PageBackground() {
  const pathname = usePathname();
  const activeModule = getActiveModule(pathname);
  const moduleAccent = activeModule ? MODULE_ACCENT_VAR[activeModule] : "rgb(var(--neutro-accent))";
  const accent = moduleAccent;

  return (
    <div className="bg-gradient-to-br from-page-bg-from via-page-bg-via to-page-bg-to pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute -left-40 -top-40 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: accent, opacity: "var(--orb-opacity)" }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: accent, opacity: "var(--orb-opacity)" }}
      />
    </div>
  );
}
