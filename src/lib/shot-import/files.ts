import { guessMapping, parseTextLines, tableGroup, type ImportDocument, type TableCell } from './parse';
import type ExcelJS from 'exceljs';

export function excelCell(cell: ExcelJS.Cell): TableCell {
  const value = cell.value;
  if (value instanceof Date) {
    const format = cell.numFmt ?? '';
    const text = format === 'd.m' ? `${value.getUTCDate()}.${value.getUTCMonth() + 1}` : value.toISOString().slice(0, 10);
    return { text, warning: `Número armazenado como data (${value.toISOString().slice(0, 10)}, formato ${format || 'não informado'}). Confirme a identificação exibida: ${text}.` };
  }
  if (value && typeof value === 'object') {
    if ('richText' in value) return { text: value.richText.map(t => t.text).join('') };
    if ('error' in value) return { text: value.error, warning: 'A célula contém um erro da planilha.' };
    if ('formula' in value || 'sharedFormula' in value) return { text: String(value.result ?? ''), warning: 'Resultado salvo de fórmula; não recalculado.' };
    if ('text' in value) return { text: value.text };
  }
  return { text: value == null ? '' : String(value) };
}
/** Não envia o binário a terceiros; XLSX e DOCX são lidos no dispositivo. */
export async function readXlsx(data: ArrayBuffer, name: string): Promise<ImportDocument> {
  const { default: Excel } = await import('exceljs');
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(data);
  const doc: ImportDocument = { name, groups: [], notes: [], avisos: [] };
  let imageCount = 0;
  for (const sheet of workbook.worksheets) {
    const rows: TableCell[][] = [], rowNumbers: number[] = [];
    if (sheet.actualRowCount > 10000 || sheet.actualColumnCount > 100) throw new Error('Planilha muito extensa. Exporte apenas as abas e colunas da decupagem.');
    sheet.eachRow((row, n) => {
      const cells: TableCell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cell.isMerged && cell.master.address !== cell.address ? { text: '' } : excelCell(cell); });
      if (!cells.some(c => c?.text.trim())) return;
      rows.push(Array.from({ length: cells.length }, (_, i) => cells[i] ?? { text: '' })); rowNumbers.push(n);
    });
    if (!rows.length) continue;
    const headerIndex = rows.findIndex(row => Object.keys(guessMapping(row.map(c => c.text))).length >= 2);
    const group = tableGroup(`sheet${sheet.id}`, sheet.name, { rows, rowNumbers, headerIndex: Math.max(0, headerIndex) });
    const images = sheet.getImages().length;
    imageCount += images;
    if (images) group.avisos.push(`${images} referência(s) em imagem nesta aba. Nesta versão, consulte-as no arquivo original; as imagens não serão anexadas aos planos.`);
    doc.groups.push(group);
  }
  if (imageCount) doc.avisos.push(`Há ${imageCount} imagens no arquivo. Esta versão importa texto e indica a origem, mas não copia as imagens.`);
  return doc;
}
export async function readShotFile(file: File, signal?: AbortSignal): Promise<ImportDocument> {
  if (file.size > 100 * 1024 * 1024) throw new Error('O limite por arquivo é 100 MB. Divida a decupagem em arquivos menores.');
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx') return readXlsx(await file.arrayBuffer(), file.name);
  if (ext === 'pdf') {
    const { extractPdfPagesInBrowser } = await import('@/lib/pdf-script-extract-browser');
    try {
      const pages = await extractPdfPagesInBrowser(file, signal);
      const doc = parseTextLines(pages.flatMap((p, i) => p.lines.map(l => ({ text: l.text, origem: `${file.name}, página ${i + 1}` }))), file.name);
      doc.avisos.push('PDF: a ordem de leitura pode exigir ajustes. Imagens e desenhos permanecem no original; esta versão importa somente o texto.');
      return doc;
    } catch (error) {
      if (error instanceof Error && error.name === 'PasswordException') throw new Error('PDF protegido por senha. Exporte uma cópia sem senha.');
      if (error instanceof Error && error.message.includes('estrutura')) throw new Error('Não foi encontrado texto suficiente. PDFs escaneados precisam de reconhecimento de texto (OCR) antes da importação.');
      throw error;
    }
  }
  if (ext === 'docx') {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) throw new Error('Este arquivo não contém um documento DOCX válido.');
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (document.querySelector('parsererror')) throw new Error('Não foi possível ler o DOCX. Exporte uma nova cópia.');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const content = (node: Element) => Array.from(node.getElementsByTagNameNS(ns, 't')).map(n => n.textContent ?? '').join('');
    const tables = Array.from(document.getElementsByTagNameNS(ns, 'tbl'));
    const paragraphs = Array.from(document.getElementsByTagNameNS(ns, 'p')).filter(p => !p.closest('tbl') && !tables.some(t => t.contains(p)));
    const doc = parseTextLines(paragraphs.map((p, i) => ({ text: content(p), origem: `${file.name}, parágrafo ${i + 1}` })), file.name);
    tables.forEach((table, i) => {
      const rows = Array.from(table.getElementsByTagNameNS(ns, 'tr')).map(tr => Array.from(tr.getElementsByTagNameNS(ns, 'tc')).map(tc => ({ text: Array.from(tc.getElementsByTagNameNS(ns, 'p')).map(content).join('\n') })));
      const headerIndex = Math.max(0, rows.findIndex(r => Object.keys(guessMapping(r.map(c => c.text))).length >= 2));
      doc.groups.push(tableGroup(`docx${i}`, `Tabela ${i + 1}`, { rows, rowNumbers: rows.map((_, n) => n + 1), headerIndex }));
    });
    doc.avisos.push('DOCX: imagens não são anexadas e tabelas são revisadas separadamente dos parágrafos.');
    return doc;
  }
  throw new Error('Formato não suportado. Use PDF, XLSX ou DOCX, ou cole o conteúdo.');
}
