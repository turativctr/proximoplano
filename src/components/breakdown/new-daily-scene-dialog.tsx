"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { newDailySceneSchema } from "@/lib/validation/daily-scene";

const emptyForm = { numero: "", tipo: "INT" as "INT" | "EXT" | "", periodo: "DIA", set: "", sinopse: "", paginas: "" };

export function NewDailySceneDialog({ projectId, shootDayId, numeroDia, onAdded }: {
  projectId: string; shootDayId: string; numeroDia: number; onAdded?: () => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const id = useRef("");
  const submitting = useRef(false);
  useEffect(() => {
    if (!open || !dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [open, dirty]);
  function changeOpen(next: boolean) {
    if (submitting.current) return;
    if (!next && dirty) { setConfirmClose(true); return; }
    if (next) { setForm(emptyForm); setDirty(false); setUncertain(false); setError(""); id.current = crypto.randomUUID(); }
    setOpen(next);
  }
  function update(key: keyof typeof form, value: string) {
    setDirty(true); setError(""); setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const parsed = newDailySceneSchema.safeParse({ ...form, tipo: form.tipo || null, requestId: id.current });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    submitting.current = true; setSaving(true); setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`/api/projects/${projectId}/shoot-days/${shootDayId}/scenes/new`, {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok) {
        // Uma resposta 4xx confirma rejeição; um 5xx pode ter ocorrido depois da gravação.
        setUncertain(response.status >= 500);
        setError(result.error || "Não foi possível criar a cena.");
        return;
      }
      setDirty(false); setOpen(false); setUncertain(false);
      toast.success(`Cena ${result.numero} criada e adicionada à diária ${numeroDia}.`);
      if (result.warning) toast.warning(result.warning, { duration: 12000 });
      try { await onAdded?.(); }
      catch { toast.warning("A cena foi criada. Recarregue a tela para atualizar a lista."); }
      router.refresh();
    } catch {
      setUncertain(true);
      setError("Não recebemos a confirmação do servidor. Tente novamente com os mesmos dados para conferir e concluir sem duplicar a cena.");
    } finally { clearTimeout(timeout); submitting.current = false; setSaving(false); }
  }
  return <>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><Button variant="outline">Nova cena nesta diária</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-xl overflow-y-auto" onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }} onPointerDownOutside={(event) => { if (saving) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>Nova cena na diária {numeroDia}</DialogTitle><DialogDescription>A cena será cadastrada no projeto e adicionada ao final desta diária. Você pode completar o breakdown e os planos depois.</DialogDescription></DialogHeader>
        <form onSubmit={create} className="space-y-4">
          <fieldset disabled={saving || uncertain} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="daily-scene-number">Número *</Label><Input id="daily-scene-number" value={form.numero} onChange={(e) => update("numero", e.target.value)} required maxLength={100} placeholder="Ex.: 12A" /></div>
              <div className="space-y-1.5"><Label htmlFor="daily-scene-type">Tipo</Label><select id="daily-scene-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.tipo} onChange={(e) => update("tipo", e.target.value)}><option value="INT">INT</option><option value="EXT">EXT</option><option value="">Não definido</option></select></div>
              <div className="space-y-1.5"><Label htmlFor="daily-scene-period">Período</Label><Input id="daily-scene-period" value={form.periodo} onChange={(e) => update("periodo", e.target.value)} maxLength={100} list="daily-period-options" /><datalist id="daily-period-options"><option value="DIA" /><option value="NOITE" /><option value="AMANHECER" /><option value="ENTARDECER" /></datalist></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="daily-scene-set">Set</Label><Input id="daily-scene-set" value={form.set} onChange={(e) => update("set", e.target.value)} maxLength={500} placeholder="Ex.: SALA DE ANA" /></div>
            <div className="space-y-1.5"><Label htmlFor="daily-scene-synopsis">Sinopse</Label><Textarea id="daily-scene-synopsis" value={form.sinopse} onChange={(e) => update("sinopse", e.target.value)} maxLength={10000} placeholder="O que acontece nesta cena?" /></div>
            <div className="space-y-1.5"><Label htmlFor="daily-scene-pages">Páginas (opcional)</Label><Input id="daily-scene-pages" value={form.paginas} onChange={(e) => update("paginas", e.target.value)} placeholder="Ex.: 1 2/8" aria-describedby="daily-pages-help" /><p id="daily-pages-help" className="text-xs text-muted-foreground">Se deixar vazio, a cena começa com 0 páginas. Você pode ajustar depois em Cenas.</p></div>
          </fieldset>
          {uncertain && <p className="text-sm text-muted-foreground">Os campos ficam preservados até confirmar esta tentativa. Repetir não cria outra cena.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Criando e adicionando…" : uncertain ? "Conferir e tentar novamente" : "Criar e adicionar à diária"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{uncertain ? "Fechar sem confirmar a criação?" : "Descartar a nova cena?"}</AlertDialogTitle><AlertDialogDescription>{uncertain ? "A cena pode já ter sido criada. Ao fechar, confira as cenas da diária antes de iniciar outro cadastro." : "Os dados preenchidos ainda não foram salvos. Continue editando para mantê-los."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Continuar editando</AlertDialogCancel><AlertDialogAction onClick={() => { setDirty(false); setOpen(false); if (uncertain) { void onAdded?.().catch(() => undefined); router.refresh(); } }}>{uncertain ? "Fechar e conferir diária" : "Descartar rascunho"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
