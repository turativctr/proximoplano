"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatPaginas } from "@/lib/paginas";
import { toggleDailySceneSelection, type DailySceneOption } from "@/lib/daily-scene-picker";
import { NewDailySceneDialog } from "@/components/breakdown/new-daily-scene-dialog";

export function AddDailyScenesDialog({ projectId, shootDayId, numeroDia, onAdded }: {
  projectId: string; shootDayId: string; numeroDia: number; onAdded?: () => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<DailySceneOption[]>([]);
  const [selected, setSelected] = useState<DailySceneOption[]>([]);
  const [query, setQuery] = useState("");
  const [showScheduled, setShowScheduled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const submitting = useRef(false);
  const endpoint = `/api/projects/${projectId}/shoot-days/${shootDayId}/scenes`;
  const needle = query.trim().toLocaleLowerCase("pt-BR");
  const visible = options.filter((option) => (showScheduled || !option.blocked) && `${option.numero} ${option.part ?? ""} ${option.set ?? ""} ${option.locacao ?? ""} ${option.sinopse ?? ""}`.toLocaleLowerCase("pt-BR").includes(needle));
  const available = options.filter((o) => !o.blocked).length;

  async function load() {
    const id = ++requestId.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(endpoint);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar as cenas.");
      if (id !== requestId.current) return;
      setOptions(data.options); setLoaded(true);
      // Uma atualização pode revelar que uma seleção foi agendada em outra aba.
      setSelected((previous) => previous.filter((item) => data.options.some((o: DailySceneOption) => o.key === item.key && !o.blocked)));
    } catch (e) { if (id === requestId.current) setError(e instanceof Error ? e.message : "Falha de conexão. Tente novamente."); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  function changeOpen(next: boolean) {
    if (submitting.current) return;
    setOpen(next);
    if (next) {
      setSelected([]); setQuery(""); setShowScheduled(false); setOptions([]); setLoaded(false);
      void load();
    } else { requestId.current++; setLoading(false); }
  }
  async function add() {
    if (!selected.length || submitting.current) return;
    submitting.current = true; setSaving(true); setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(endpoint, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: selected.map(({ sceneId, scenePartId }) => ({ sceneId, scenePartId })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível adicionar as cenas.");
      toast.success(result.added ? `${result.added} ${result.added === 1 ? "cena adicionada" : "cenas adicionadas"} à diária ${numeroDia}.` : "As cenas selecionadas já estão nesta diária.");
      if (result.warning) toast.warning(result.warning, { duration: 12000 });
      setSelected([]); setOpen(false);
      try { await onAdded?.(); }
      catch { toast.warning("Cenas adicionadas. Recarregue a tela para atualizar a lista exibida.", { duration: 10000 }); }
      router.refresh();
    } catch (e) { setError(e instanceof DOMException && e.name === "AbortError" ? "O servidor demorou a responder. Atualize a lista para conferir se as cenas entraram; tentar novamente não duplica cenas." : e instanceof Error ? e.message : "Falha de conexão. Você pode tentar novamente sem duplicar cenas."); }
    finally { clearTimeout(timeout); submitting.current = false; setSaving(false); }
  }

  return <><NewDailySceneDialog projectId={projectId} shootDayId={shootDayId} numeroDia={numeroDia} onAdded={onAdded} /><Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button variant="outline">Adicionar cenas</Button></DialogTrigger>
    <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-3xl flex-col gap-3 overflow-hidden p-4 sm:p-6" onEscapeKeyDown={(e) => { if (saving) e.preventDefault(); }} onPointerDownOutside={(e) => { if (saving) e.preventDefault(); }}>
      <DialogHeader className="shrink-0 pr-6"><DialogTitle>Adicionar cenas à diária {numeroDia}</DialogTitle><DialogDescription>Escolha cenas ou partes ainda sem diária. Elas entram no final do dia; os horários são recalculados conforme a jornada.</DialogDescription></DialogHeader>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Input aria-label="Buscar cenas para adicionar" className="min-w-0 flex-1" placeholder="Cena, set, locação ou sinopse" value={query} onChange={(e) => setQuery(e.target.value)} disabled={saving} />
        <Button variant="ghost" disabled={loading || saving} onClick={load}>Atualizar lista</Button>
      </div>
      <label className="flex shrink-0 items-center gap-2 text-sm"><input type="checkbox" checked={showScheduled} onChange={(e) => setShowScheduled(e.target.checked)} disabled={saving} />Mostrar também cenas já agendadas</label>
      <p className="shrink-0 text-xs text-muted-foreground">{loaded ? `${available} opções disponíveis · ` : ""}Uma parte de cada cena por diária. Cenas omitidas do roteiro não aparecem.</p>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border" aria-busy={loading}>
        {loading ? <p role="status" className="p-6 text-center text-sm">Carregando cenas…</p> : visible.length > 0 ? <ul className="divide-y">{visible.map((option) => {
          const checked = selected.some((item) => item.key === option.key);
          const siblingSelected = selected.some((item) => item.sceneId === option.sceneId && item.key !== option.key);
          const reason = option.blocked || (siblingSelected ? "Outra parte desta cena está selecionada" : null);
          return <li key={option.key} className={checked ? "bg-accent/40" : ""}>
            <label className="flex cursor-pointer items-start gap-3 p-3">
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={checked} disabled={saving || Boolean(reason) || (!checked && selected.length >= 100)} aria-label={`Cena ${option.numero}${option.part ? ` — ${option.part}` : ""}${reason ? ` — ${reason}` : ""}`} onChange={() => setSelected((previous) => toggleDailySceneSelection(previous, option))} />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-sm font-semibold">Cena {option.numero}{option.part ? ` · ${option.part}` : ""} <span className="font-normal text-muted-foreground">· {formatPaginas(option.paginas)} pág.</span></span>
                <span className="block break-words text-sm">{option.set || "Set a definir"}{option.locacao ? ` · ${option.locacao}` : ""}</span>
                {option.sinopse && <span className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">{option.sinopse}</span>}
                {reason && <span className="block text-xs font-medium text-muted-foreground">{reason}</span>}
              </span>
            </label>
          </li>;
        })}</ul> : loaded && <div className="space-y-2 p-6 text-center text-sm"><p>{needle ? "Nenhuma cena corresponde à busca." : available === 0 ? "Não há cenas disponíveis para adicionar." : "Nenhuma cena para mostrar."}</p>{needle && <Button variant="link" onClick={() => setQuery("")}>Limpar busca</Button>}{!showScheduled && available === 0 && <p className="text-muted-foreground">Mostre as cenas já agendadas para conferir onde estão. Para cadastrar uma cena agora, feche este seletor e use “Nova cena nesta diária”.</p>}</div>}
      </div>
      <div className="shrink-0 space-y-2">
        {selected.length > 0 && <div className="flex items-start justify-between gap-2 text-xs"><p className="max-h-16 overflow-y-auto break-words text-muted-foreground">Selecionadas ({selected.length}): {selected.map((o) => `${o.numero}${o.part ? ` (${o.part})` : ""}`).join(", ")}{selected.some((item) => !visible.some((o) => o.key === item.key)) ? " · Inclui seleções ocultas pela busca." : ""}</p><Button size="sm" variant="ghost" disabled={saving} onClick={() => setSelected([])}>Limpar</Button></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2"><Button variant="outline" disabled={saving} onClick={() => changeOpen(false)}>Cancelar</Button><Button disabled={loading || saving || !selected.length} onClick={add}>{saving ? "Adicionando…" : `Adicionar ${selected.length || ""} ${selected.length === 1 ? "cena" : "cenas"}`}</Button></DialogFooter>
      </div>
    </DialogContent>
  </Dialog></>;
}
