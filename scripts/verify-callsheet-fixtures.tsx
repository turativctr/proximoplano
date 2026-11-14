/** Renderiza uma cópia local de dados de relatório, sem banco nem acesso a produção.
 * Dados reais devem ficar fora do repositório. O PDF original é opcional para conferir conteúdo. */
import { readFileSync, writeFileSync } from "node:fs";

import { renderCallSheet } from "../src/lib/pdf/render-call-sheet";
import type { ShootDayReportData } from "../src/lib/report-data";
import { encontrarColisoes } from "./lib/pdf-colisoes";

async function inspect(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
  const bodies: string[] = [];
  const depths: number[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    const body = content.items.filter(item => "str" in item && item.str.trim() && item.transform[5] > 40);
    bodies.push(body.map(item => "str" in item ? item.str : "").join(" "));
    depths.push(Math.max(...body.map(item => "str" in item ? 841.89 - item.transform[5] - 32 : 0)));
  }
  await doc.cleanup();
  // A hifenização pode mudar ao repaginar. Rodapés/números de página não são conteúdo da diária.
  const text = bodies.join(" ").replace(/-\s+/g, "").replace(/\s+/g, "");
  return { text, bodies, depths };
}

async function main() {
  const [input, output, source] = process.argv.slice(2);
  if (!input || !output) throw new Error("Uso: entrada.json saida.pdf [original.pdf]");
  const data = JSON.parse(readFileSync(input, "utf8")) as ShootDayReportData;
  const buffer = await renderCallSheet(data);
  const actual = await inspect(buffer);
  const { colisoes } = await encontrarColisoes(buffer);
  if (colisoes.length) throw new Error("O PDF apresentou colisões de texto.");
  if (actual.depths.length > 1 && actual.depths.at(-1)! < 220) throw new Error("Última página quase vazia.");
  for (const title of ["CENAS DO DIA", "Escaleta do AD"]) {
    const page = actual.bodies.find(body => body.includes(title));
    if (!page?.includes(data.scenes[0].numero + " ")) throw new Error(`Título isolado: ${title}`);
  }
  if (source && (await inspect(readFileSync(source))).text !== actual.text) {
    throw new Error("O conteúdo difere do PDF original; conferir antes de entregar.");
  }
  writeFileSync(output, buffer);
  console.log(`Diária ${data.shootDay.numeroDia}: ${actual.depths.length} páginas; zero colisões; ocupação (pt): ${actual.depths.map(Math.round).join(", ")}${source ? "; conteúdo igual ao original" : ""}.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
