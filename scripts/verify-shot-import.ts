import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parsePasted, parseTextLines, tableGroup, technicalHints } from '../src/lib/shot-import/parse';
import { readXlsx } from '../src/lib/shot-import/files';
import { shotImportSchema } from '../src/lib/validation/shot-import';

async function main() {
  const doc = parseTextLines([
    { text: 'obs1: cenas da casa em preto e branco', origem: 'p1' },
    { text: '-Cena 3', origem: 'p1' }, { text: '●\u200b Plano 1: plano médio', origem: 'p2' },
    { text: 'personagem abre a porta', origem: 'p2' }, { text: 'Plano 2: close', origem: 'p2' },
    { text: 'ESPAÇO', origem: 'p3' }, { text: 'Cena 4', origem: 'p3' }, { text: 'Plano 1: dolly in frontal', origem: 'p3' },
  ], 'Teste');
  assert.equal(doc.groups.length, 2); assert.equal(doc.groups[0].shots.length, 2);
  assert.equal(doc.groups[0].shots[0].origem, 'p2'); assert.match(doc.groups[0].shots[0].descricao, /abre a porta/);
  assert.equal(doc.groups[1].shots[0].numero, '1'); assert.equal(doc.groups[1].shots[0].movimento, 'dolly in');
  assert.equal(doc.notes.length, 1); assert.ok(!doc.groups[0].shots[1].descricao.includes('ESPAÇO'));
  const table = parsePasted('PLANO\tAÇÃO\tEQUIPAMENTOS\tMOVIMENTO DE CÂMERA\n1\t"Ela entra\ne olha"\tFS5, 50mm f1.8, tripé\tTripé\n2\t\t\t');
  assert.equal(table.groups[0].shots.length, 2); assert.equal(table.groups[0].shots[0].descricao, 'Ela entra\ne olha');
  assert.equal(table.groups[0].shots[0].lente, '50mm'); assert.equal(table.groups[0].shots[0].movimento, '');
  assert.equal(table.groups[0].shots[1].incluir, false); assert.match(table.groups[0].shots[0].notasDirecao, /FS5/);
  assert.equal(technicalHints('Uma pessoa entra').lente, '');
  const remapped = tableGroup('t', 'Tabela', { rows: [[{ text: 'Código' }, { text: 'O que acontece' }], [{ text: '4B' }, { text: 'Abre a porta' }]], rowNumbers: [1, 2], headerIndex: 0 }, { numero: 0, descricao: 1 });
  assert.equal(remapped.shots[0].numero, '4B');
  const noHeader = tableGroup('free', 'Sem cabeçalho', { rows: [[{ text: '91' }, { text: 'Plano geral' }], [{ text: '92' }, { text: 'Close' }]], rowNumbers: [1, 2], headerIndex: -1 }, { numero: 0, descricao: 1 });
  assert.equal(noHeader.shots.length, 2); assert.equal(noHeader.shots[0].numero, '91'); assert.equal(noHeader.notes.length, 0);
  assert.equal(parsePasted('Plano geral\nClose').groups[0].shots.length, 2);
  const valid = { requestId: '00000000-0000-4000-8000-000000000000', source: 'Teste', defaults: { takesPrevistos: 3, duracaoTakeMin: 2, resetEntreTakesMin: 0 }, shots: [{ numero: ' 4b ', descricao: 'Plano' }] };
  assert.equal(shotImportSchema.parse(valid).shots[0].numero, '4B');
  assert.ok(!shotImportSchema.safeParse({ ...valid, shots: [{ numero: '1', descricao: ' ' }] }).success);
  assert.ok(!shotImportSchema.safeParse({ ...valid, shots: Array(201).fill(valid.shots[0]) }).success);
  console.log('Importação: texto, páginas, cenas, tabelas multilinha, campos extras, vazios, associação e limites OK.');
  if (process.env.SHOT_IMPORT_XLSX) {
    const bytes = await fs.readFile(process.env.SHOT_IMPORT_XLSX);
    const ade = await readXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'ADÉ.xlsx');
    const seven = ade.groups.find(g => g.sceneHint === '7')!;
    assert.equal(ade.groups.length, 16); assert.equal(seven.shots.length, 8);
    assert.deepEqual(seven.shots.filter(s => s.numeroAmbiguo).map(s => s.numero), ['1.1', '2.1', '3.1', '4.1']);
    assert.equal(ade.groups.filter(g => g.avisos.some(a => a.includes('cabeçalho indica'))).length, 3);
    assert.equal(ade.groups.find(g => g.sceneHint === '3')!.shots.filter(s => !s.incluir).length, 1);
    assert.ok(ade.groups.find(g => g.sceneHint === '11')!.notes.some(n => n.includes('Esquecer os créditos')));
    console.log('ADÉ:', ade.groups.map(g => `${g.sceneHint}:${g.shots.filter(s => s.incluir).length}`).join(', '));
    console.log('Planos preenchidos:', ade.groups.reduce((n, g) => n + g.shots.filter(s => s.incluir).length, 0));
    if (process.env.SHOT_IMPORT_OUTPUT) await fs.writeFile(process.env.SHOT_IMPORT_OUTPUT, JSON.stringify(ade));
  }
  if (process.env.SHOT_IMPORT_PDF_LINES) {
    const lines = JSON.parse(await fs.readFile(process.env.SHOT_IMPORT_PDF_LINES, 'utf8'));
    const eclipse = parseTextLines(lines, 'Eclipse.pdf');
    assert.equal(eclipse.groups.length, 23);
    assert.equal(eclipse.groups.find(g => g.sceneHint === '5')!.shots.length, 3);
    assert.equal(eclipse.groups.find(g => g.sceneHint === '16')!.shots.length, 1);
    assert.ok(eclipse.groups.every(g => g.shots.every(s => s.descricao)));
    console.log('Eclipse:', eclipse.groups.map(g => `${g.sceneHint}:${g.shots.length}`).join(', '));
    console.log('Total:', eclipse.groups.reduce((n, g) => n + g.shots.length, 0));
    if (process.env.SHOT_IMPORT_OUTPUT) await fs.writeFile(process.env.SHOT_IMPORT_OUTPUT + '.eclipse.json', JSON.stringify(eclipse));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
