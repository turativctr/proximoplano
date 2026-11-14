import { renderToBuffer } from "@react-pdf/renderer";

import { CallSheetDocument } from "@/lib/pdf/call-sheet-document";
import type { ShootDayReportData } from "@/lib/report-data";

/** Adaptador isolado para o layout medido pelo react-pdf 4 (versão travada no lockfile).
 * Nunca usa número de caracteres ou quantidade de cenas para estimar altura. */
type LayoutNode = {
  type: string;
  box?: { top: number; height: number; paddingTop?: number; paddingBottom?: number };
  props?: { id?: string; fixed?: boolean };
  children?: LayoutNode[];
};
type PageMeasure = { top: number; capacity: number; bottom: number; anchors: { id: string; y: number }[] };

function measurePages(result: unknown): PageMeasure[] {
  const layout = (result as { _INTERNAL__LAYOUT__DATA_?: LayoutNode })?._INTERNAL__LAYOUT__DATA_;
  if (!layout?.children) throw new Error("Não foi possível medir a paginação da Ordem do Dia.");
  return layout.children.map(page => {
    const top = page.box?.paddingTop ?? 32;
    const capacity = (page.box?.height ?? 841.89) - top - (page.box?.paddingBottom ?? 46);
    const measured: PageMeasure = { top, capacity, bottom: top, anchors: [] };
    function visit(node: LayoutNode, parentTop: number) {
      if (node.props?.fixed) return;
      const y = parentTop + (node.box?.top ?? 0);
      if (node.props?.id?.startsWith("od-hh-")) measured.anchors.push({ id: node.props.id, y });
      if (node.type === "TEXT" || node.type === "IMAGE") {
        measured.bottom = Math.max(measured.bottom, y + (node.box?.height ?? 0));
      } else {
        node.children?.forEach(child => visit(child, y));
      }
    }
    page.children?.forEach(node => visit(node, 0));
    return measured;
  });
}

/** Só redistribui quando sobra menos de 30% de uma folha no final.
 * Antecipar uma quebra segura mantém linhas inteiras e a tipografia original. Não
 * acrescenta páginas, não estica entrelinhas e não remove conteúdo para fazê-lo caber. */
export async function renderCallSheet(data: ShootDayReportData): Promise<Buffer> {
  let pages: PageMeasure[] = [];
  const original = await renderToBuffer(<CallSheetDocument data={data} onRender={result => { pages = measurePages(result); }} />);
  if (pages.length < 2) return original;
  const last = pages[pages.length - 1];
  const previous = pages[pages.length - 2];
  const lastDepth = last.bottom - last.top;
  const minimum = last.capacity * 0.3;
  if (lastDepth >= minimum) return original;

  const candidates = previous.anchors.map(anchor => {
    const before = anchor.y - previous.top;
    const after = previous.bottom - anchor.y + lastDepth;
    return { ...anchor, before, after, difference: Math.abs(before - after) };
  }).filter(anchor => anchor.before >= minimum && anchor.after >= minimum && anchor.after < last.capacity - 24)
    .sort((a, b) => a.difference - b.difference);

  for (const candidate of candidates.slice(0, 3)) {
    let balanced: PageMeasure[] = [];
    const buffer = await renderToBuffer(<CallSheetDocument data={data} breakBefore={candidate.id}
      onRender={result => { balanced = measurePages(result); }} />);
    if (balanced.length !== pages.length) continue;
    if (balanced.slice(-2).every(page => page.bottom - page.top >= minimum)) return buffer;
  }
  // Documento muito curto ou sem planos: não inventar espaço nem criar outra página.
  return original;
}
