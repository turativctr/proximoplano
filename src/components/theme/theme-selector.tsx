"use client";

import type { Tema } from "@prisma/client";
import { Check, Palette } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TEMA_LABEL, TEMA_DESCRIPTION, TEMA_VALUES } from "@/lib/theme";
import { applyTheme, useCurrentTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

/** Miniatura da interface real: mesma superfície, moldura e cores funcionais do tema. */
function TemaCard({ tema, selected, onSelect }: {
  tema: Tema;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-theme={tema.toLowerCase()}
      aria-label={`Usar tema ${TEMA_LABEL[tema]}`}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "theme-choice relative overflow-hidden rounded-xl border-2 bg-background text-left text-foreground transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected ? "border-foreground shadow-md" : "border-border hover:shadow-md"
      )}
    >
      <span aria-hidden="true" className="flex h-20 border-b border-border sm:h-24">
        <span className="theme-chrome flex w-9 shrink-0 flex-col gap-2 border-r-[length:var(--chrome-border-width)] border-[rgb(var(--chrome-border))] p-2">
          <span className="h-2 w-2 rounded-sm bg-foreground" />
          <span className="h-1 w-full rounded bg-scheduling-accent" />
          <span className="h-1 w-full rounded bg-budgeting-accent" />
          <span className="h-1 w-full rounded bg-drafts-accent" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="theme-chrome h-4 border-b-[length:var(--chrome-border-width)] border-[rgb(var(--chrome-border))]" />
          <span className="grid flex-1 grid-cols-2 gap-1.5 p-2">
            <span className="rounded border-l-[3px] border-scheduling-accent bg-scheduling-bg" />
            <span className="rounded border-l-[3px] border-budgeting-accent bg-budgeting-bg" />
            <span className="rounded border-l-[3px] border-drafts-accent bg-drafts-bg" />
            <span className="rounded border-l-[3px] border-decupagem-accent bg-decupagem-bg" />
          </span>
        </span>
      </span>
      <span className="block px-3 py-2.5">
        <span className="flex items-center justify-between gap-1 text-sm font-semibold">
          {TEMA_LABEL[tema]}
          {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
        </span>
        <span className="mt-1 block min-h-8 text-xs text-muted-foreground">{TEMA_DESCRIPTION[tema]}</span>
      </span>
    </button>
  );
}

/** Tema é por pessoa (não por projeto) — troca aplica na hora via CSS (ver applyTheme), sem
 *  recarregar a página, e persiste em paralelo (cookie + banco, ver PATCH /api/user/theme).
 *  Onda 2: 10 temas não cabem mais num dropdown de lista única sem ficar gigante e ilegível
 *  (o usuário escolhe pelo clima visual — precisa de um preview grande, não uma linha de
 *  texto com um círculo de 4px) — virou diálogo com grade de amostras (ver PARTE 3 do pedido:
 *  "decidir vendo" — decidido depois de ver o dropdown de 10 itens ficar comprido demais). */
export function ThemeSelector() {
  const { update } = useSession();
  const currentTema = useCurrentTheme();
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSelect(tema: Tema) {
    if (tema === currentTema) {
      setOpen(false);
      return;
    }
    applyTheme(tema);
    setOpen(false);
    setPending(true);
    try {
      const res = await fetch("/api/user/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema }),
      });
      if (!res.ok) throw new Error();
      await update({ tema });
    } catch {
      toast.error("Não foi possível salvar sua preferência de tema.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Tema" aria-label="Escolher tema" disabled={pending}>
          <Palette className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escolher tema</DialogTitle>
          <DialogDescription>
            Escolha o clima da sua tela. Salvo no seu perfil, para todos os projetos.
            Azul planeja, verde organiza o orçamento, roxo identifica o roteiro e teal a decupagem.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {TEMA_VALUES.map((tema) => (
            <TemaCard
              key={tema}
              tema={tema}
              selected={currentTema === tema}
              onSelect={() => handleSelect(tema)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
