'use client';

import { Files, Plus, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { IMPORT_FIELDS, blankShot, parsePasted, tableGroup, tableHeaders, type ImportDocument, type ImportField, type ImportShot } from '@/lib/shot-import/parse';
import { nextFreeShotNumero, parseDuracaoTake } from '@/lib/shots-shared';
import type { ShotData } from './shot-types';

type Receipt = { undoToken: string; count: number };
const selectClass = 'h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm';

export function ImportShotsDialog({ projectId, sceneId, sceneNumero, shots, onCreated }: {
  projectId: string; sceneId: string; sceneNumero: string; shots: ShotData[]; onCreated: (shots: ShotData[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [doc, setDoc] = useState<ImportDocument | null>(null);
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [duplicatesAccepted, setDuplicatesAccepted] = useState(false);
  const [takes, setTakes] = useState('3');
  const [duration, setDuration] = useState('2:00');
  const [reset, setReset] = useState('0');
  const [sourceUrl, setSourceUrl] = useState('');
  const request = useRef({ id: '', body: '' });
  const generation = useRef(0);
  const extraction = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const key = `proximoplano:shot-import:${sceneId}`;
  const base = `/api/projects/${projectId}/scenes/${sceneId}/shots/import`;
  const group = doc?.groups.find(g => g.id === groupId);
  const selected = group?.shots.filter(s => s.incluir) ?? [];
  const numbers = selected.map(s => s.numero.trim().toUpperCase());
  const conflicts = selected.filter((s, i) => !s.numero.trim() || s.numero.trim().length > 10 || numbers.indexOf(numbers[i]) !== i || shots.some(p => p.numero.toUpperCase() === numbers[i]));
  const possibleDuplicates = selected.filter(s => shots.some(p => p.descricao.trim().toLowerCase() === s.descricao.trim().toLowerCase()));
  const ambiguous = selected.some(s => s.numeroAmbiguo);
  const validTime = Number.isInteger(Number(takes)) && Number(takes) >= 1 && Number(takes) <= 100 && parseDuracaoTake(duration) !== null && (parseDuracaoTake(duration) ?? 0) <= 600 && Number.isInteger(Number(reset)) && Number(reset) >= 0 && Number(reset) <= 600;
  const canSave = selected.length > 0 && selected.length <= 200 && !conflicts.length && selected.every(s => s.descricao.trim()) && !ambiguous && confirmed && validTime && (!possibleDuplicates.length || duplicatesAccepted);

  useEffect(() => { try { const stored = sessionStorage.getItem(`${key}:receipt`); if (stored) setReceipt(JSON.parse(stored)); } catch { /* modo privado */ } }, [key]);
  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);
  useEffect(() => {
    if (!doc) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [doc]);

  function patch(id: string, data: Partial<ImportShot>) {
    setDoc(prev => prev ? { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, shots: g.shots.map(s => s.id === id ? { ...s, ...data } : s) } : g) } : prev);
    setConfirmed(false); setDuplicatesAccepted(false);
  }
  function acceptDocument(next: ImportDocument) {
    if (!next.groups.some(g => g.shots.length || g.table)) throw new Error('Nenhum plano reconhecido. Cole o texto ou uma tabela para revisar manualmente.');
    setDoc(next); setGroupId(next.groups.length === 1 ? next.groups[0].id : ''); setConfirmed(false); setDuplicatesAccepted(false); setError('');
  }
  async function readFile(file?: File) {
    if (!file) return;
    const current = ++generation.current;
    extraction.current?.abort(); extraction.current = new AbortController();
    setBusy('Lendo arquivo…'); setError('');
    try {
      const { readShotFile } = await import('@/lib/shot-import/files');
      const next = await readShotFile(file, extraction.current.signal);
      if (current !== generation.current) return;
      acceptDocument(next); setSourceUrl(URL.createObjectURL(file));
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'Não foi possível ler este arquivo.'); }
    finally { if (current === generation.current) setBusy(''); }
  }
  function addRow() {
    if (!group) return;
    const row = blankShot(crypto.randomUUID(), 'Adicionado na revisão');
    setDoc(prev => prev ? { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, shots: [...g.shots, row] } : g) } : prev); setConfirmed(false);
  }
  function split(id: string) {
    if (!group) return;
    const row = group.shots.find(s => s.id === id)!;
    const position = row.descricao.indexOf('\n');
    if (position < 0) { toast.info('Insira uma quebra de linha na descrição onde quer separar os planos.'); return; }
    const second = { ...row, id: crypto.randomUUID(), numero: '', descricao: row.descricao.slice(position + 1).trim(), numeroAmbiguo: false };
    setDoc(prev => prev ? { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, shots: g.shots.flatMap(s => s.id === id ? [{ ...s, descricao: s.descricao.slice(0, position).trim() }, second] : [s]) } : g) } : prev); setConfirmed(false);
  }
  function join(index: number) {
    if (!group || !group.shots[index + 1]) return;
    const row = group.shots[index], next = group.shots[index + 1];
    setDoc(prev => prev ? { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, shots: g.shots.flatMap(s => s.id === next.id ? [] : s.id === row.id ? [{ ...s, descricao: `${s.descricao}\n${next.descricao}`, original: `${s.original}\n${next.original}`, origem: `${s.origem}; ${next.origem}`, notasDirecao: `${s.notasDirecao}\n${next.notasDirecao}`, avisos: [...s.avisos, 'União manual: confira os campos técnicos com os dois textos originais.'] }] : [s]) } : g) } : prev); setConfirmed(false);
  }
  function fillNumbers() {
    if (!group) return;
    const used = [...shots.map(s => s.numero), ...group.shots.map(s => s.numero).filter(Boolean)];
    setDoc(prev => prev ? { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, shots: g.shots.map(s => {
      if (s.numero.trim()) return s;
      const numero = nextFreeShotNumero(used); used.push(numero); return { ...s, numero };
    }) } : g) } : prev); setConfirmed(false);
  }
  function storeReceipt(value: Receipt | null) { setReceipt(value); try { if (value) sessionStorage.setItem(`${key}:receipt`, JSON.stringify(value)); else sessionStorage.removeItem(`${key}:receipt`); } catch { /* ainda disponível nesta tela */ } }
  async function save() {
    if (!canSave || !doc || !group) return;
    setBusy('Adicionando planos…'); setError('');
    const payload = { source: doc.name, defaults: { takesPrevistos: Number(takes), duracaoTakeMin: parseDuracaoTake(duration), resetEntreTakesMin: Number(reset) }, shots: selected.map(s => ({ numero: s.numero, descricao: s.descricao, tamanho: s.tamanho, angulo: s.angulo, movimento: s.movimento, lente: s.lente,
      notasDirecao: [s.notasDirecao, `Origem: ${doc.name} — ${s.origem}`, s.original && `Texto original:\n${s.original}`, [...doc.notes, ...group.notes].length ? `Notas da fonte (confira o alcance):\n${[...doc.notes, ...group.notes].join('\n')}` : '', 'Tempo inicial definido na importação; não extraído do documento.'].filter(Boolean).join('\n\n'),
    })) };
    const serialized = JSON.stringify(payload);
    if (request.current.body !== serialized) request.current = { id: crypto.randomUUID(), body: serialized };
    try {
      const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, requestId: request.current.id }) });
      const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Erro ao adicionar os planos.');
      onCreated(result.shots); storeReceipt({ undoToken: result.undoToken, count: result.count });
      toast.success(`${result.count} planos adicionados à cena ${sceneNumero}.`); if (result.warning) toast.warning(result.warning);
      setDoc(null); setText(''); setSourceUrl(''); setOpen(false); request.current = { id: '', body: '' };
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha de conexão. Sua revisão está preservada; tente novamente.'); }
    finally { setBusy(''); }
  }
  async function undo() {
    if (!receipt) return;
    setBusy('Desfazendo…');
    try {
      const res = await fetch(base, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ undoToken: receipt.undoToken }) });
      const result = await res.json(); if (!res.ok) throw new Error(result.error);
      onCreated(result.shots); storeReceipt(null); toast.success('Importação desfeita.'); if (result.warning) toast.warning(result.warning);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível desfazer.'); } finally { setBusy(''); }
  }

  return <div className="space-y-2">
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogTrigger asChild><Button type="button" variant="outline" className="w-full" size="sm"><Files className="mr-2 h-4 w-4" />{doc ? 'Retomar revisão dos planos' : 'Adicionar vários planos'}</Button></DialogTrigger>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-5xl flex-col overflow-hidden p-4 sm:p-6" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader className="shrink-0 pr-6"><DialogTitle>Adicionar vários planos</DialogTitle><DialogDescription>Destino: cena {sceneNumero}. Leia a fonte, revise os planos e confirme o lote. Os planos atuais mantêm seus números.</DialogDescription></DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1"><fieldset disabled={!!busy} className="min-w-0 space-y-4">
          {!doc ? <>
            <div className="rounded-xl border border-dashed p-4"><Label htmlFor={`file-${sceneId}`}>Arquivo de decupagem</Label><Input ref={fileInput} id={`file-${sceneId}`} type="file" accept=".pdf,.xlsx,.docx" className="mt-2" disabled={!!busy} onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ''; }} /><p className="mt-2 text-xs text-muted-foreground">PDF com texto, Excel (.xlsx) ou Word (.docx), até 100 MB. Para Google Docs/Sheets, baixe uma cópia ou cole o conteúdo. Imagens permanecem no original.</p></div>
            <div className="space-y-2"><Label htmlFor={`paste-${sceneId}`}>Ou cole texto ou células de uma tabela</Label><Textarea id={`paste-${sceneId}`} rows={7} value={text} disabled={!!busy} onChange={e => setText(e.target.value)} placeholder={'Cena 5\nPlano 1: Plano geral — personagem entra na sala\nPlano 2: Close — reação'} /><Button disabled={!text.trim() || !!busy} onClick={() => { try { acceptDocument(parsePasted(text)); } catch (e) { setError((e as Error).message); } }}>Ler e revisar</Button></div>
          </> : <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3"><span className="break-all text-sm font-medium">{doc.name} · {doc.groups.reduce((n, g) => n + g.shots.length, 0)} itens encontrados</span><div className="flex gap-2">{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" download={doc.name.endsWith('.pdf') ? undefined : doc.name} className="text-sm underline">Consultar original</a>}<Button size="sm" variant="ghost" disabled={!!busy} onClick={() => { setDoc(null); setSourceUrl(''); setConfirmed(false); setError(''); }}>Trocar fonte</Button></div></div>
            {doc.avisos.map((a, i) => <p className="text-sm text-muted-foreground" key={i}>{a}</p>)}
            <div className="space-y-2"><Label htmlFor={`group-${sceneId}`}>Qual cena ou aba da fonte deseja trazer para a cena {sceneNumero}?</Label><select id={`group-${sceneId}`} className={selectClass} value={groupId} disabled={!!busy} onChange={e => { setGroupId(e.target.value); setConfirmed(false); setDuplicatesAccepted(false); }}><option value="">Selecione uma cena ou aba</option>{doc.groups.map(g => <option key={g.id} value={g.id}>{g.label} — {g.shots.length} itens</option>)}</select></div>
            {group && <>
              {group.avisos.map((a, i) => <p key={i} className="rounded-md border p-3 text-sm">Atenção: {a}</p>)}
              {group.table && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Conferir associação das colunas</summary><p className="my-2 text-xs text-muted-foreground">Mudar a associação relê esta aba e substitui a revisão dela. Colunas extras ficam nas notas.</p><label className="mb-3 block space-y-1 text-sm"><span>Linha de cabeçalho</span><select className={selectClass} value={group.table.headerIndex} onChange={e => {
                const next = tableGroup(group.id, group.label, { ...group.table!, headerIndex: Number(e.target.value) });
                setDoc({ ...doc, groups: doc.groups.map(g => g.id === group.id ? next : g) }); setConfirmed(false);
              }}><option value={-1}>Sem cabeçalho — todas as linhas são dados</option>{group.table.rows.map((row, index) => <option value={index} key={index}>Linha {group.table!.rowNumbers[index]}: {row.map(c => c.text).join(' / ').slice(0, 100)}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-3">{(Object.entries(IMPORT_FIELDS) as [ImportField, string][]).map(([field, label]) => <label className="space-y-1 text-sm" key={field}><span>{label}</span><select aria-label={`Coluna de ${label}`} className={selectClass} value={group.mapping?.[field] ?? -1} onChange={e => {
                const mapping = { ...group.mapping }; if (+e.target.value < 0) delete mapping[field]; else mapping[field] = +e.target.value;
                const next = tableGroup(group.id, group.label, group.table!, mapping);
                setDoc({ ...doc, groups: doc.groups.map(g => g.id === group.id ? next : g) }); setConfirmed(false);
              }}><option value={-1}>Não informado</option>{tableHeaders(group.table!).map((header, i) => <option key={i} value={i}>{header || `Coluna ${i + 1}`}</option>)}</select></label>)}</div></details>}
              {!!(doc.notes.length + group.notes.length) && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Notas e cabeçalhos da fonte — não são planos ({doc.notes.length + group.notes.length})</summary><p className="my-2 text-xs text-muted-foreground">Serão preservados nas notas de direção, identificados como contexto da fonte. Revise a quais cenas se aplicam.</p><p className="whitespace-pre-wrap break-words text-sm">{[...doc.notes, ...group.notes].join('\n\n')}</p></details>}
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{selected.length} de {group.shots.length} itens no lote</p><Button size="sm" variant="outline" onClick={fillNumbers}>Preencher números vazios</Button></div>
              <div className="space-y-3">{group.shots.map((s, i) => <article key={s.id} className={`space-y-3 rounded-xl border p-3 ${!s.incluir ? 'bg-muted' : 'bg-card'}`} aria-label={`Revisar plano ${s.numero || i + 1}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={s.incluir} onChange={e => patch(s.id, { incluir: e.target.checked })} />Incluir plano {s.numero || 'sem número'}</label><span className="text-xs text-muted-foreground">{s.origem}</span></div>
                <div className="grid gap-3 sm:grid-cols-[7rem_1fr]"><label className="space-y-1 text-sm"><span>Número</span><Input aria-label={`Número do item ${i + 1}`} maxLength={10} value={s.numero} onChange={e => patch(s.id, { numero: e.target.value })} /></label><label className="space-y-1 text-sm"><span>Descrição / ação</span><Textarea aria-label={`Descrição do item ${i + 1}`} rows={3} value={s.descricao} onChange={e => patch(s.id, { descricao: e.target.value })} /></label></div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(['tamanho', 'angulo', 'movimento', 'lente'] as const).map(field => <label key={field} className="space-y-1 text-sm"><span>{IMPORT_FIELDS[field]}</span><Input aria-label={`${IMPORT_FIELDS[field]} do item ${i + 1}`} value={s[field]} placeholder="Não informado" onChange={e => patch(s.id, { [field]: e.target.value })} /></label>)}</div>
                {s.avisos.map((a, n) => <p className="text-xs text-muted-foreground" key={n}>{a}</p>)}
                {s.numeroAmbiguo && <Button size="sm" variant="outline" onClick={() => patch(s.id, { numeroAmbiguo: false })}>Confirmar número {s.numero || '(preencha acima)'}</Button>}
                <details><summary className="cursor-pointer text-xs underline">Texto original e notas preservadas</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{s.original}</p><label className="mt-2 block text-sm">Notas adicionais<Textarea value={s.notasDirecao} onChange={e => patch(s.id, { notasDirecao: e.target.value })} /></label></details>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => split(s.id)}>Separar na primeira quebra de linha</Button>{i < group.shots.length - 1 && <Button size="sm" variant="ghost" onClick={() => join(i)}>Unir ao próximo</Button>}</div>
              </article>)}</div>
              <Button size="sm" variant="outline" onClick={addRow}><Plus className="mr-2 h-4 w-4" />Adicionar linha</Button>
              <fieldset className="space-y-2 rounded-lg border p-3"><legend className="px-1 text-sm font-medium">Tempo inicial dos novos planos</legend><p className="text-xs text-muted-foreground">Valores do app, não extraídos do arquivo. Aplicados a cada plano; podem alterar a estimativa da cena. O Rod digitado manualmente é preservado.</p><div className="grid grid-cols-3 gap-3"><label className="text-sm">Takes<Input aria-label="Takes do lote" type="number" min={1} max={100} value={takes} onChange={e => setTakes(e.target.value)} /></label><label className="text-sm">Duração/take<Input aria-label="Duração por take do lote" value={duration} onChange={e => setDuration(e.target.value)} placeholder="m:ss" /></label><label className="text-sm">Reset (min)<Input aria-label="Reset entre takes do lote" type="number" min={0} max={600} value={reset} onChange={e => setReset(e.target.value)} /></label></div></fieldset>
              {selected.length > 200 && <p role="alert" className="text-sm text-destructive">Selecione no máximo 200 planos por lote.</p>}
              {!!conflicts.length && <p role="alert" className="text-sm text-destructive">Preencha números únicos (até 10 caracteres). Há {conflicts.length} número(s) ausente(s), repetido(s) ou já existente(s) na cena.</p>}
              {selected.some(s => !s.descricao.trim()) && <p role="alert" className="text-sm text-destructive">Preencha a descrição ou desmarque os itens vazios.</p>}
              {ambiguous && <p className="text-sm">Confirme os números armazenados como data antes de continuar.</p>}
              {!!possibleDuplicates.length && <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={duplicatesAccepted} onChange={e => setDuplicatesAccepted(e.target.checked)} />Há {possibleDuplicates.length} descrição(ões) igual(is) a planos existentes. Conferi e quero incluir mesmo assim.</label>}
              {!validTime && <p role="alert" className="text-sm text-destructive">Confira os tempos: takes de 1 a 100, duração em m:ss e reset inteiro de 0 a 600 min.</p>}
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>Revisei os dados e o destino: adicionar {selected.length} planos de “{group.label}” à <strong>cena {sceneNumero}</strong>.</span></label>
            </>}
          </>}
          {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}
        </fieldset></div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3"><span className="text-xs text-muted-foreground" role="status">{busy || (doc ? 'Fechar preserva a revisão enquanto esta página estiver aberta.' : 'Os dados só são gravados após sua revisão.')}</span><div className="flex gap-2">{busy === 'Lendo arquivo…' && <Button variant="outline" onClick={() => { generation.current++; extraction.current?.abort(); setBusy(''); }}>Cancelar leitura</Button>}<Button variant="outline" disabled={!!busy} onClick={() => setOpen(false)}>{doc ? 'Continuar depois' : 'Cancelar'}</Button>{doc && <Button disabled={!canSave || !!busy} onClick={() => void save()}>Adicionar {selected.length} planos</Button>}</div></div>
      </DialogContent>
    </Dialog>
    {receipt && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><span>Último lote: {receipt.count} planos adicionados.</span><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void undo()}><Undo2 className="mr-2 h-4 w-4" />Desfazer importação</Button></div>}
  </div>;
}
