/** Regressão da paginação da OD: dados sintéticos em memória, sem gravar no banco. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderCallSheet } from "../src/lib/pdf/render-call-sheet";
import { prisma } from "../src/lib/prisma";
import { getShootDayReportData, type ShootDayReportData } from "../src/lib/report-data";
import { formatHHh } from "../src/lib/schedule";
import { encontrarColisoes } from "./lib/pdf-colisoes";

function fixture(base: ShootDayReportData, count: number, planosPorCena = 2) {
  const data = structuredClone(base);
  data.project = { ...data.project, titulo: "TESTE - Paginacao da Ordem do Dia", logoUrl: null, diretor: "Direcao de teste", producao: "Producao de teste", sistemaIdElenco: "ID_CURTO" };
  data.shootDay = { ...data.shootDay, observacoesGerais: "Documento ficticio para conferir a paginacao.", locacaoNome: "Estudio de teste", locacaoEndereco: "Endereco ficticio", transporteEndereco: "Ponto de encontro de teste", baseInfo: "Base de teste", estacionamento: "Estacionamento de teste", hospitalNome: "Hospital de teste", hospitalEndereco: "Endereco de teste", hospitalTelefone: "Nao informado" };
  data.shotSchedule = [];
  data.blocosDeTempo = [];
  data.castPresente = [];
  data.extrasPresente = [];
  data.castMeals = { total: 0, cafe: 0, almoco: 0 };
  data.scenes = Array.from({ length: count }, (_, i) => {
    const scene = structuredClone(base.scenes[i % base.scenes.length]);
    const tag = String(i + 1).padStart(3, "0");
    return { ...scene, sceneId: `teste-${tag}`, numero: `C${tag}`, setLocacaoDisplay: `SET${tag} - Estudio de teste com descricao longa`, sinopseAD: `Acao de teste ${tag}: personagem atravessa o estudio e confere os objetos antes de iniciar a cena.`, sinopse: "Cena ficticia.", observacoes: null, cast: [], extras: [], bloco: "MANHA" as const, ordem: i };
  });
  data.manhaScenes = data.scenes;
  data.tardeScenes = [];
  data.horaAHoraPlanos = data.scenes.map((scene, i) => ({
    kind: "cena" as const, tipo: scene.tipo, periodo: scene.periodo, classeLuz: scene.classeLuz, sceneId: scene.sceneId, numero: scene.numero,
    setLocacaoDisplay: scene.setLocacaoDisplay, sinopseAD: scene.sinopseAD ?? "", cast: [],
    planos: Array.from({ length: planosPorCena }, (_, j) => ({
      tamanho: "MEDIO", lente: "50mm", movimento: "FIXO", takesPrevistos: 2, tempoTotalMin: 5, status: "PENDENTE" as const, prioridade: "ESSENCIAL" as const, horaInicio: "09:00", id: `plano-${i}-${j}`, numero: String(j + 1), ordem: j,
      descricao: `INI${i}X${j} Movimento de camera atravessa o estudio e acompanha o personagem ate a porta. FIM${i}X${j}`,
      tipoReset: "NENHUM" as const, tempoResetMin: 0,
    })),
  }));
  data.horaAHoraItens = data.horaAHoraPlanos;
  return data;
}

async function main() {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL ?? "").hostname)) {
    throw new Error("Esta verificacao usa somente o banco local.");
  }
  const demo = await prisma.user.findUniqueOrThrow({ where: { email: "demo@proximoplano.local" } });
  const project = await prisma.project.findFirstOrThrow({ where: { ownerId: demo.id, titulo: "Ressaca" } });
  const day = await prisma.shootDay.findFirstOrThrow({ where: { projectId: project.id }, orderBy: { scenes: { _count: "desc" } } });
  const base = await getShootDayReportData(project.id, day.id);
  if (!base?.scenes.length) throw new Error("Demo local sem cenas.");
  const output = process.env.VERIFY_PDF_OUT;
  if (output) mkdirSync(output, { recursive: true });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  for (const [name, count, shots] of [["curta", 1, 2], ["longa", 14, 2], ["muitas-cenas", 40, 2], ["cena-com-muitos-planos", 1, 60], ["limite-7", 7, 2], ["limite-9", 9, 2], ["limite-12", 12, 2], ["limite-16", 16, 2], ["limite-18", 18, 2], ["cauda-curta", 13, 1], ["meteo-extensa", 12, 1]] as const) {
    const data = fixture(base, count, shots);
    if (name === "meteo-extensa") data.shootDay.meteoDescricao = "Alerta de chuva e vento. Conferir equipamentos e transporte. ".repeat(14);
    const buffer = await renderCallSheet(data);
    if (output) writeFileSync(join(output, `${name}.pdf`), buffer);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
    const pages: string[] = [];
    const depths: number[] = [];
    const rowCounts = new Map<string, number>();
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const text = await page.getTextContent();
      const items = text.items.filter((x) => "str" in x && x.str.trim());
      pages.push(items.map((x) => "str" in x ? x.str : "").join(" "));
      const body = items.filter((x) => "str" in x && x.transform[5] > 40);
      depths.push(Math.max(0, ...body.map((x) => "str" in x ? 841.89 - x.transform[5] : 0)) - 32);
      if (process.env.PAGINATION_BASELINE !== "1") for (const scene of data.scenes) {
        for (const row of items) {
          if (!("str" in row) || row.str !== scene.numero) continue;
          rowCounts.set(scene.sceneId, (rowCounts.get(scene.sceneId) ?? 0) + 1);
          if (!scene.schedule) continue;
          for (const time of [scene.schedule.prepStart, scene.schedule.prepEnd, scene.schedule.rodStart, scene.schedule.rodEnd]) {
            const found = items.some((x) => "str" in x && x.str === formatHHh(time) && Math.abs(x.transform[5] - row.transform[5]) < 18);
            if (!found) throw new Error(`${name}: horario separado da cena ${scene.numero} na pagina ${pageNo}`);
          }
        }
      }
      if (process.env.PAGINATION_BASELINE !== "1") for (const item of items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        const footer = y > 15 && y < 35;
        if (!footer && (y < 46 || y > 810)) throw new Error(`${name}: texto fora da area util na pagina ${pageNo}: ${item.str}`);
      }
    }
    const { colisoes } = await encontrarColisoes(buffer);
    console.log(`${name}: ${doc.numPages} paginas, ${colisoes.length} colisoes; ocupacao vertical (pt): ${depths.map(Math.round).join(", ")}`);
    if (process.env.PAGINATION_BASELINE !== "1") {
      for (const scene of data.scenes) if (rowCounts.get(scene.sceneId) !== 2) {
        throw new Error(`${name}: cena ${scene.numero} ausente ou duplicada nas tabelas`);
      }
      for (const heading of ["CENAS DO DIA", "Escaleta do AD"]) {
        const page = pages.findIndex(text => text.includes(heading));
        if (page < 0 || !pages[page].includes(data.scenes[0].numero + " ")) throw new Error(`${name}: título ${heading} separado da primeira cena`);
      }
      const hhPage = pages.findIndex(text => text.includes("Hora a Hora com Planos"));
      if (hhPage < 0 || !pages[hhPage].includes("INI0X0 ")) throw new Error(`${name}: título Hora a Hora separado do primeiro plano`);
      if (doc.numPages > 1 && depths.at(-1)! < 220) throw new Error(`${name}: ultima pagina quase vazia`);
      if (colisoes.length) console.log(colisoes.slice(0, 12));
      if (colisoes.length) throw new Error(`${name}: colisao de texto`);
      for (let i = 0; i < count; i++) for (let j = 0; j < shots; j++) {
        const start = pages.findIndex((p) => p.includes(`INI${i}X${j} `));
        const end = pages.findIndex((p) => p.includes(`FIM${i}X${j} `));
        if (start < 0 || start !== end) throw new Error(`${name}: plano ${i}/${j} cortado ou perdido`);
      }
    }
    await doc.cleanup();
  }
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
