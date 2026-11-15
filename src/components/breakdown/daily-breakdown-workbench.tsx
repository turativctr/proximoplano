"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AddDailyScenesDialog } from "@/components/breakdown/add-daily-scenes-dialog";
import { ShotListPanel } from "@/components/breakdown/shot-list-panel";
import type { getDailyBreakdown } from "@/lib/daily-breakdown";
import { DAILY_FIELDS, addDailyValue, dailyField, groupDailyValues, sameValues, type DailyChange, type DailyField } from "@/lib/daily-breakdown-shared";

type Data = NonNullable<Awaited<ReturnType<typeof getDailyBreakdown>>>;
const departments = [...new Set(DAILY_FIELDS.map((f) => f.department))];
const selectClass = "h-10 max-w-full rounded-md border bg-background px-3 text-sm";

export function DailyBreakdownWorkbench({ projectId, initialData }: { projectId: string; initialData: Data }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [mode, setMode] = useState<"department" | "scene">("department");
  const [field, setField] = useState<DailyField>("objetos");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [addition, setAddition] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [plans, setPlans] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<DailyChange[] | null>(null);
  const dayUrl = `/projects/${projectId}/shootdays/${data.id}`;
  const api = `/api/projects/${projectId}/shoot-days/${data.id}/breakdown`;
  const key = (sceneId: string, f: DailyField) => `${sceneId}:${f}`;
  const value = (scene: Data["scenes"][number], f: DailyField) => drafts[key(scene.id, f)] ?? scene.values[f];
  const changes: DailyChange[] = data.scenes.flatMap((scene) => DAILY_FIELDS.flatMap(({ key: f }) => {
    if (drafts[key(scene.id, f)] === undefined) return [];
    const raw = value(scene, f);
    const after = dailyField(f).kind === "list" ? raw.map((v) => v.trim()).filter(Boolean) : raw;
    return sameValues(after, scene.values[f]) ? [] : [{ sceneId: scene.id, field: f, before: scene.values[f], after }];
  }));
  const dirty = changes.length > 0;
  const changedScenes = new Set(changes.map((c) => c.sceneId)).size;
  const visible = data.scenes.filter((s) => `${s.numero} ${s.set ?? ""} ${s.sinopse ?? ""}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const definition = dailyField(field);
  const optionsFor = (f: DailyField) => f === "characterIds" ? data.cast : data.extras;
  const labelFor = (f: DailyField, v: string) => ["characterIds", "extraIds"].includes(f) ? optionsFor(f).find((o) => o.id === v)?.label ?? v : v;
  const grouped = useMemo(() => groupDailyValues(data.scenes.map((s) => ({ ...s, values: { ...s.values, [field]: drafts[`${s.id}:${field}`] ?? s.values[field] } })), field), [data, drafts, field]);

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    // Protege também links da sidebar, fora desta tela. Salvar é explícito e atômico.
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (link && !event.ctrlKey && !event.metaKey && !window.confirm("Há alterações não salvas. Sair e descartá-las?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);

  function edit(sceneId: string, f: DailyField, next: string[]) {
    setDrafts((previous) => ({ ...previous, [key(sceneId, f)]: next }));
    setMessage(""); setError("");
  }
  function applyAddition() {
    if (!addition.trim() || !selected.length) return;
    setDrafts((previous) => {
      const next = { ...previous };
      for (const scene of data.scenes.filter((s) => selected.includes(s.id))) {
        next[key(scene.id, field)] = addDailyValue(value(scene, field), addition, field);
        if (["characterIds", "extraIds"].includes(field)) next[key(scene.id, field)].sort();
      }
      return next;
    });
    setAddition(""); setMessage("Item aplicado à seleção. Salve para atualizar as cenas e a OD."); setError("");
  }
  async function persist(batch: DailyChange[], isUndo = false) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes: batch }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar.");
      // Atualiza a base local com o lote confirmado, sem depender de uma segunda requisição.
      setData((previous) => ({ ...previous, scenes: previous.scenes.map((scene) => ({ ...scene, values: {
        ...scene.values, ...Object.fromEntries(batch.filter((c) => c.sceneId === scene.id).map((c) => [c.field, c.after])),
      } })) }));
      setDrafts({});
      router.refresh();
      setUndo(isUndo ? null : batch.map((c) => ({ ...c, before: c.after, after: c.before })));
      setMessage(isUndo ? "Último salvamento desfeito." : "Salvo nas cenas. Disponível nos alertas da Ordem do Dia.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha de conexão. Suas edições continuam aqui."); }
    finally { setBusy(false); }
  }
  async function openPlans(sceneId: string) {
    if (plans === sceneId) { setPlans(null); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(api);
      if (!response.ok) throw new Error("Não foi possível carregar os planos.");
      const fresh: Data = await response.json();
      setData((previous) => ({ ...previous, scenes: previous.scenes.map((scene) => {
        const updated = fresh.scenes.find((s) => s.id === scene.id);
        return updated ? { ...scene, shots: updated.shots, parts: updated.parts, duracaoAlvoMin: updated.duracaoAlvoMin, tempoEstimadoMin: updated.tempoEstimadoMin } : scene;
      }) }));
      setPlans(sceneId);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar planos."); }
    finally { setBusy(false); }
  }
  async function scenesAdded() {
    const response = await fetch(api);
    if (!response.ok) throw new Error("Não foi possível atualizar as cenas.");
    const fresh: Data = await response.json();
    setData((previous) => ({ ...fresh, scenes: fresh.scenes.map((scene) => {
      const original = previous.scenes.find((s) => s.id === scene.id);
      // Preserva o valor anterior dos rascunhos: a detecção de concorrência continua válida.
      return original ? { ...scene, values: { ...scene.values, ...Object.fromEntries(DAILY_FIELDS
        .filter((f) => drafts[key(scene.id, f.key)] !== undefined).map((f) => [f.key, original.values[f.key]])) } } : scene;
    }) }));
    setMessage("Cenas adicionadas. Você já pode preparar o breakdown delas aqui.");
  }
  async function reload() {
    if (dirty && !window.confirm("Recarregar descarta as alterações não salvas desta tela. Continuar?")) return;
    setBusy(true);
    try {
      const response = await fetch(api);
      if (!response.ok) throw new Error("Não foi possível recarregar.");
      setData(await response.json()); setDrafts({}); setSelected([]); setUndo(null); setError(""); setMessage("Dados atualizados.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha de conexão."); }
    finally { setBusy(false); }
  }
  function editor(scene: Data["scenes"][number], f: DailyField) {
    const def = dailyField(f);
    const current = value(scene, f);
    if (def.kind === "cast" || def.kind === "extras") return <fieldset className="flex flex-wrap gap-x-4 gap-y-2" aria-label={`${def.label} — cena ${scene.numero}`}>
      {optionsFor(f).length === 0 && <span className="text-sm text-muted-foreground">Nenhum cadastro. <Link className="underline" href={`/projects/${projectId}/${f === "characterIds" ? "cast" : "extras"}`}>Cadastrar {def.label.toLowerCase()}</Link></span>}
      {optionsFor(f).map((option) => <label key={option.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={current.includes(option.id)} onChange={(e) => edit(scene.id, f, (e.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id)).sort())} />{option.label}</label>)}
    </fieldset>;
    return <Textarea aria-label={`${def.label} — cena ${scene.numero}`} rows={Math.min(7, Math.max(2, current.join("\n").split("\n").length))} className="min-h-[64px] resize-y bg-background" value={current.join("\n")} placeholder="Sem informação" onChange={(e) => edit(scene.id, f, def.kind === "text" ? (e.target.value ? [e.target.value] : []) : e.target.value.split("\n"))} />;
  }
  function sceneLabel(scene: Data["scenes"][number]) {
    return <><span className="font-semibold">Cena {scene.numero}</span>{scene.part && <span className="ml-2 text-xs">Parte: {scene.part}</span>}{scene.omitida && <span className="ml-2 text-xs text-destructive">Omitida do roteiro</span>}<p className="mt-1 text-sm text-muted-foreground break-words">{scene.set || "Set a definir"}</p><details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Ver sinopse</summary><p className="mt-1 whitespace-pre-wrap break-words">{scene.sinopse || "Sinopse a definir"}</p></details></>;
  }

  return <div className="min-w-0 space-y-4 pb-24">
    <Link href={dayUrl} className="text-sm text-muted-foreground underline">← Voltar à diária</Link>
    <header className="space-y-2">
      <p className="text-sm text-muted-foreground">Diária {data.numeroDia} · {new Date(data.data).toLocaleDateString("pt-BR", { timeZone: "UTC" })} · {data.scenes.length} cenas</p>
      <h1 className="text-2xl font-semibold">Preparar breakdown da diária</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Prepare só as cenas deste dia. Os dados acompanham a cena e são compartilhados entre suas partes.</p>
    </header>
    <nav aria-label="Preparação da diária" className="flex flex-wrap gap-2">
      <AddDailyScenesDialog projectId={projectId} shootDayId={data.id} numeroDia={data.numeroDia} onAdded={scenesAdded} />
      <Button asChild variant="outline"><Link href={`${dayUrl}/ordem-do-dia?step=2`}>Planos e horários</Link></Button>
      <Button asChild><Link href={`${dayUrl}/ordem-do-dia?step=4`}>Revisar Ordem do Dia</Link></Button>
    </nav>
    {data.scenes.length === 0 ? <div className="border-y py-12 text-center space-y-3"><h2 className="text-lg font-medium">Comece pelas cenas desta diária</h2><p className="text-muted-foreground">Use “Adicionar cenas” acima para escolher o que será filmado. Depois, prepare os departamentos aqui, sem preencher o restante do filme.</p></div> : <>
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Visualização" className="flex gap-1"><Button variant={mode === "department" ? "default" : "outline"} aria-pressed={mode === "department"} onClick={() => setMode("department")}>Por departamento</Button><Button variant={mode === "scene" ? "default" : "outline"} aria-pressed={mode === "scene"} onClick={() => setMode("scene")}>Por cena</Button></div>
        <label className="flex min-w-0 flex-col gap-1 text-sm">Buscar cenas<Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Número, set ou sinopse" /></label>
        <Button variant="ghost" disabled={busy} onClick={reload}>Recarregar dados</Button>
      </div>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
      {mode === "department" && <>
        <div className="flex flex-wrap items-end gap-3 border-y py-4">
          <label className="flex min-w-0 flex-col gap-1 text-sm">Departamento / informação<select className={selectClass} value={field} onChange={(e) => { setField(e.target.value as DailyField); setAddition(""); }}>{departments.map((department) => <optgroup key={department} label={department}>{DAILY_FIELDS.filter((f) => f.department === department).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</optgroup>)}</select></label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-sm">Adicionar às cenas selecionadas
            {definition.kind === "cast" || definition.kind === "extras" ? <select className={selectClass} value={addition} onChange={(e) => setAddition(e.target.value)}><option value="">Escolher {definition.label.toLowerCase()}</option>{optionsFor(field).map((o) => <option value={o.id} key={o.id}>{o.label}</option>)}</select> : <Input value={addition} maxLength={2000} onChange={(e) => setAddition(e.target.value)} placeholder={field === "figurino" || field === "make" ? "Personagem_descrição" : field === "objetos" ? "Ex.: [CRÍTICO] Taça de vidro" : definition.kind === "text" ? "Nota a acrescentar" : "Item a acrescentar"} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyAddition(); } }} />}
          </label>
          <Button variant="outline" disabled={!selected.length || !addition.trim()} onClick={applyAddition}>Aplicar a {selected.length} cenas</Button>
        </div>
        <p className="text-xs text-muted-foreground">{definition.kind === "list" ? "Um item por linha. Preserve Personagem_descrição para associar ao elenco e [CRÍTICO] para objetos críticos. " : ""}Adicionar em lote preserva os itens existentes. Salvar altera somente os campos editados.</p>
        <div className="flex flex-wrap items-center gap-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={visible.length > 0 && visible.every((s) => selected.includes(s.id))} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...visible.map((s) => s.id)])] : selected.filter((id) => !visible.some((s) => s.id === id)))} />Selecionar cenas visíveis ({visible.length})</label>{selected.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Limpar seleção ({selected.length})</Button>}</div>
        {selected.length > 0 && <p className="text-xs text-muted-foreground">Selecionadas: {data.scenes.filter((s) => selected.includes(s.id)).map((s) => s.numero).join(", ")}.{selected.some((id) => !visible.some((s) => s.id === id)) && " A seleção inclui cenas ocultas pela busca."}</p>}
        <div className="overflow-x-auto rounded-md border"><table className="w-full table-fixed text-left"><caption className="sr-only">{definition.label} nas cenas desta diária</caption><thead className="bg-muted text-sm"><tr><th className="w-10 p-2"><span className="sr-only">Selecionar</span></th><th className="w-[32%] p-3">Cena</th><th className="p-3">{definition.label}</th></tr></thead><tbody>{visible.map((scene) => <tr key={scene.id} className="border-t align-top"><td className="p-3"><input aria-label={`Selecionar cena ${scene.numero}`} type="checkbox" checked={selected.includes(scene.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, scene.id] : selected.filter((id) => id !== scene.id))} /></td><td className="p-3">{sceneLabel(scene)}</td><td className="p-3">{editor(scene, field)}</td></tr>)}</tbody></table></div>
        <details className="border-b py-3"><summary className="cursor-pointer font-medium">Resumo de {definition.label.toLowerCase()} · {grouped.length} {grouped.length === 1 ? "item" : "itens"} em toda a diária{dirty ? " (inclui rascunho)" : ""}</summary><ul className="mt-3 divide-y">{grouped.map((group) => <li key={group.value} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="min-w-0 whitespace-pre-wrap break-words">{labelFor(field, group.value)}</span><span className="text-muted-foreground">Cenas {group.sceneIds.map((id) => data.scenes.find((s) => s.id === id)!.numero).join(", ")}</span></li>)}</ul>{grouped.length === 0 && <p className="py-3 text-sm text-muted-foreground">Sem informação cadastrada para este departamento.</p>}</details>
      </>}
      {mode === "scene" && <div className="divide-y border-y">{visible.map((scene) => <Fragment key={scene.id}><div className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>{sceneLabel(scene)}<p className="mt-2 text-xs text-muted-foreground">{DAILY_FIELDS.filter((f) => value(scene, f.key).some((v) => v.trim())).length} campos com informação · {scene.shots.length} planos na cena</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" aria-expanded={expanded === scene.id} onClick={() => setExpanded(expanded === scene.id ? null : scene.id)}> {expanded === scene.id ? "Recolher breakdown" : "Editar breakdown"}</Button><Button variant="outline" aria-expanded={plans === scene.id} onClick={() => openPlans(scene.id)}>{plans === scene.id ? "Recolher planos" : "Abrir planos"}</Button></div>
      </div>{expanded === scene.id && <div className="divide-y pb-4">{DAILY_FIELDS.map((f) => <div key={f.key} className="grid gap-2 py-3 md:grid-cols-[210px_minmax(0,1fr)]"><p className="text-sm font-medium">{f.label}{f.kind === "list" && <span className="block text-xs font-normal text-muted-foreground">Um item por linha</span>}</p>{editor(scene, f.key)}</div>)}</div>}
      {plans === scene.id && <div className="min-w-0 pb-5"><p className="mb-3 text-sm text-muted-foreground">Planos salvam separadamente. {scene.part ? "Esta cena é dividida: confira a parte atribuída a cada plano. " : ""}Os horários da diária são organizados em “Planos e horários”.</p><ShotListPanel projectId={projectId} sceneId={scene.id} sceneNumero={scene.numero} initialShots={scene.shots} initialDuracaoAlvoMin={scene.duracaoAlvoMin} tempoEstimadoMin={scene.tempoEstimadoMin} partes={scene.parts} oitavosCena={scene.oitavos} /></div>}
      </Fragment>)}</div>}
      {visible.length === 0 && <p className="py-8 text-center text-muted-foreground">Nenhuma cena corresponde à busca. <Button variant="link" onClick={() => setQuery("")}>Limpar busca</Button></p>}
      </fieldset>
      <p className="text-xs text-muted-foreground">“Sem informação” não significa revisado nem “não precisa”. Você pode continuar a OD com informações pendentes. Esta versão não registra a revisão dos departamentos.</p>
    </>}
    <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 shadow-lg" aria-label="Salvar breakdown">
      <Button disabled={busy || !dirty} onClick={() => persist(changes)}>{busy ? "Salvando…" : dirty ? `Salvar ${changedScenes} ${changedScenes === 1 ? "cena" : "cenas"}` : "Tudo salvo"}</Button>
      {dirty && <Button disabled={busy} variant="ghost" onClick={() => { if (window.confirm("Descartar as alterações não salvas do breakdown?")) { setDrafts({}); setError(""); setMessage("Rascunho descartado."); } }}>Descartar rascunho</Button>}
      {undo && !dirty && <Button disabled={busy} variant="outline" onClick={() => persist(undo, true)}>Desfazer último salvamento</Button>}
      <p role="status" className="text-sm text-muted-foreground">{message || (dirty ? "Alterações ainda não salvas" : "")}</p>
      {error && <p role="alert" className="w-full text-sm text-destructive">{error} <button className="underline" disabled={busy} onClick={reload}>Recarregar dados</button></p>}
    </div>
  </div>;
}
