/** Leitura conservadora: a fonte permanece disponível e nenhuma inferência substitui o original. */
export type ImportShot = {
  id: string; numero: string; descricao: string; tamanho: string; angulo: string;
  movimento: string; lente: string; notasDirecao: string; original: string; origem: string;
  avisos: string[]; incluir: boolean; numeroAmbiguo?: boolean;
};
export type ImportField = 'numero' | 'descricao' | 'tamanho' | 'angulo' | 'movimento' | 'lente';
export const IMPORT_FIELDS: Record<ImportField, string> = {
  numero: 'Número', descricao: 'Descrição / ação', tamanho: 'Enquadramento', angulo: 'Ângulo', movimento: 'Movimento', lente: 'Lente',
};
export type TableCell = { text: string; warning?: string };
export type ImportTable = { rows: TableCell[][]; rowNumbers: number[]; headerIndex: number };
export type ImportGroup = {
  id: string; label: string; sceneHint: string; avisos: string[]; notes: string[]; shots: ImportShot[];
  table?: ImportTable; mapping?: Partial<Record<ImportField, number>>;
};
export type ImportDocument = { name: string; groups: ImportGroup[]; notes: string[]; avisos: string[] };
export const clean = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const sceneMatch = (s: string) => s.match(/\bcena\s*([0-9]+[a-z]?)(?=[\s.:–—-]|$)/i)?.[1] ?? '';
export function technicalHints(text: string) {
  const t = clean(text);
  const tamanho = t.match(/primeirissimo plano|primeiro plano|plano geral|plano americano|plano conjunto|plano detalhe|close|\baberto\b|\bmedio\b|\bfechado\b|\bdetalhe\b/)?.[0] ?? '';
  const angulo = t.match(/contra[- ]?plongee|plongee|zenital|top view|over the shoulder|\bfrontal\b|\b3\/4\b|¾/)?.[0] ?? '';
  const movimento = t.match(/dolly\s*(?:in|out)|travelling|panoramica|camera na mao|freehand|\bestatico\b|\bfollow\b/)?.[0] ?? '';
  const lente = text.match(/\b\d+(?:[.,]\d+)?\s*mm\b/i)?.[0] ?? '';
  const labels: Record<string, string> = { medio: 'Médio', 'plano medio': 'Plano Médio', plongee: 'Plongée', 'contra-plongee': 'Contra-plongée', 'contra plongee': 'Contra-plongée', 'camera na mao': 'Câmera na mão', estatico: 'Estático', panoramica: 'Panorâmica', 'primeirissimo plano': 'Primeiríssimo Plano' };
  return { tamanho: labels[tamanho] ?? tamanho, angulo: labels[angulo] ?? angulo, movimento: labels[movimento] ?? movimento, lente };
}
export function blankShot(id: string, origem: string): ImportShot {
  return { id, origem, numero: '', descricao: '', tamanho: '', angulo: '', movimento: '', lente: '', notasDirecao: '', original: '', avisos: [], incluir: true };
}
/** Mantém aspas e quebras dentro de células copiadas do Excel/Sheets. */
export function parseDelimited(text: string, delimiter = '\t'): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && (quoted || !cell)) {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (c === delimiter || c === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (c === '\n') { rows.push(row); row = []; }
    } else cell += c;
  }
  row.push(cell.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function guessMapping(headers: string[]): Partial<Record<ImportField, number>> {
  const patterns: Record<ImportField, RegExp> = {
    numero: /^(plano|numero|n[º°o.]?|shot|id)$/, descricao: /^(acao|descricao|conteudo|action|description)$/,
    tamanho: /^(enquadramento|tamanho|recorte|shot size)$/, angulo: /^(angulo|angle)$/,
    movimento: /^(movimento.*|camera movement)$/, lente: /^(lente|objetiva|lens)$/,
  };
  const result: Partial<Record<ImportField, number>> = {};
  for (const key of Object.keys(patterns) as ImportField[]) {
    const index = headers.findIndex(h => patterns[key].test(clean(h)));
    if (index >= 0) result[key] = index;
  }
  return result;
}
export function tableHeaders(table: ImportTable): string[] {
  return table.headerIndex >= 0 ? (table.rows[table.headerIndex] ?? []).map(c => c.text) : Array.from({ length: Math.max(0, ...table.rows.map(r => r.length)) }, (_, i) => `Coluna ${i + 1}`);
}
export function tableGroup(id: string, label: string, table: ImportTable, suppliedMapping?: Partial<Record<ImportField, number>>): ImportGroup {
  const headers = tableHeaders(table);
  const mapping = suppliedMapping ?? guessMapping(headers);
  const before = [...new Set(table.rows.slice(0, Math.max(0, table.headerIndex)).flat().map(c => c.text).filter(Boolean))];
  const hint = sceneMatch(label) || before.map(sceneMatch).find(Boolean) || '';
  const conflicts = before.map(sceneMatch).filter(n => n && hint && n !== hint);
  const group: ImportGroup = { id, label, sceneHint: hint, avisos: [], notes: before, shots: [], table, mapping };
  if (conflicts.length) group.avisos.push(`O nome da aba indica cena ${hint}, mas o cabeçalho indica cena ${conflicts[0]}. Confira o destino.`);
  if (mapping.descricao === undefined) group.avisos.push('Associe a coluna de descrição / ação antes de importar.');
  for (let i = table.headerIndex + 1; i < table.rows.length; i++) {
    const cells = table.rows[i]; if (!cells.some(c => c.text.trim())) continue;
    const read = (k: ImportField) => mapping[k] === undefined ? '' : cells[mapping[k]!]?.text.trim() ?? '';
    // Cabeçalhos repetidos no meio de uma tabela não viram planos.
    if (clean(read('numero')) === 'plano' && guessMapping(cells.map(c => c.text)).descricao !== undefined) continue;
    const s = blankShot(`${id}-${i}`, `${label}, linha ${table.rowNumbers[i]}`);
    for (const field of Object.keys(IMPORT_FIELDS) as ImportField[]) s[field] = read(field);
    const original = cells.map((c, n) => c.text ? `${headers[n] || `Coluna ${n + 1}`}: ${c.text}` : '').filter(Boolean).join('\n');
    if (!s.numero && !s.descricao) { group.notes.push(`${s.origem}\n${original}`); continue; }
    s.original = original;
    const hints = technicalHints(`${s.tamanho}\n${s.movimento}`);
    s.angulo ||= hints.angulo;
    const equipment = cells.filter((_, n) => /equipamento/.test(clean(headers[n] ?? ''))).map(c => c.text).join(' ');
    s.lente ||= technicalHints(equipment).lente;
    if (/^(tripe|shoulder\s?rig)$/i.test(clean(s.movimento))) {
      s.movimento = ''; s.avisos.push('Suporte de câmera não define movimento. Valor preservado nas notas.');
    }
    const extras = cells.map((c, n) => !Object.values(mapping).includes(n) && c.text ? `${headers[n] || `Coluna ${n + 1}`}: ${c.text}` : '').filter(Boolean);
    s.notasDirecao = extras.join('\n');
    const warning = mapping.numero === undefined ? undefined : cells[mapping.numero]?.warning;
    if (warning) { s.numeroAmbiguo = true; s.avisos.push(warning); }
    if (!s.descricao) { s.incluir = false; s.avisos.push('Sem descrição: excluído do lote até ser preenchido.'); }
    group.shots.push(s);
  }
  return group;
}
export function parseTextLines(lines: { text: string; origem: string }[], name: string): ImportDocument {
  const doc: ImportDocument = { name, groups: [], notes: [], avisos: [] };
  let group: ImportGroup | undefined, current: ImportShot | undefined;
  let pendingHeading = "";
  const normalizedLines = lines.map(l => ({ ...l, text: l.text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/^\s*[●•▪◦–—-]\s*/, '').trim() }));
  const hasExplicitShots = normalizedLines.some(l => /^\s*plano\s+\d+[\w.-]*(?:\s|:|$)/i.test(l.text));
  const flush = () => { if (current) { const hints = technicalHints(current.descricao); Object.assign(current, hints); current.original = current.descricao; current.incluir = !!current.descricao.trim(); current = undefined; } };
  const ensureGroup = () => group ?? (group = { id: `g${doc.groups.length}`, label: 'Sem cena identificada', sceneHint: '', avisos: [], notes: [], shots: [] }, doc.groups.push(group), group);
  for (const line of normalizedLines) {
    const text = line.text.trim(); if (!text) continue;
    const scene = text.match(/^cena\s*([0-9]+[a-z]?)(?:\s|[.:–—-]|$)/i);
    if (scene) {
      flush(); group = { id: `g${doc.groups.length}`, label: text, sceneHint: scene[1], avisos: [], notes: pendingHeading ? [pendingHeading] : [], shots: [] }; pendingHeading = ''; doc.groups.push(group); continue;
    }
    if (/^\(?obs(?:erva[cç][aã]o|erva[cç][oõ]es|\d*)\s*[:.]/i.test(text)) {
      flush(); (group?.notes ?? doc.notes).push(`${line.origem}: ${text}`); continue;
    }
    const shot = text.match(/^plano\s+(\d+[a-z]?(?:[.-]\d+)?)(?:\s*(?:flashback)?\s*[:–—-]\s*|\s+|$)(.*)$/i)
      ?? (!hasExplicitShots ? text.match(/^(\d+[a-z]?(?:\.\d+)?)[.)\s–—-]+(.+)$/i) : null);
    if (shot) {
      flush(); const g = ensureGroup(); current = { ...blankShot(`${g.id}-${g.shots.length}`, line.origem), numero: shot[1], descricao: shot[2] ?? '' }; g.shots.push(current); continue;
    }
    // Cabeçalhos de locação em caixa alta entre cenas não integram a descrição anterior.
    if (hasExplicitShots && text === text.toUpperCase() && /^[A-ZÀ-Ú\s]+$/.test(text) && text.length < 70) { flush(); if (doc.groups.length || !/decupagem/i.test(text)) pendingHeading = `${line.origem}: ${text}`; else doc.notes.push(`${line.origem}: ${text}`); continue; }
    if (current) { current.descricao += `${current.descricao ? '\n' : ''}${text}`; }
    else if (hasExplicitShots) (group?.notes ?? doc.notes).push(`${line.origem}: ${text}`);
    else {
      const g = ensureGroup(); const s = { ...blankShot(`${g.id}-${g.shots.length}`, line.origem), descricao: text, original: text, ...technicalHints(text) };
      g.shots.push(s);
    }
  }
  flush();
  if (!hasExplicitShots) doc.avisos.push('Texto livre: cada linha ou item numerado foi interpretado como um plano. Revise ou una os itens.');
  return doc;
}
export function parsePasted(text: string): ImportDocument {
  if (text.includes('\t')) {
    const rows = parseDelimited(text).map(r => r.map(text => ({ text })));
    const headerIndex = rows.findIndex(r => Object.keys(guessMapping(r.map(c => c.text))).length >= 2);
    return { name: 'Tabela colada', notes: [], avisos: [], groups: [tableGroup('t0', 'Tabela colada', { rows, rowNumbers: rows.map((_, i) => i + 1), headerIndex: Math.max(0, headerIndex) })] };
  }
  return parseTextLines(text.split(/\r?\n/).map((text, i) => ({ text, origem: `Texto, linha ${i + 1}` })), 'Texto colado');
}
