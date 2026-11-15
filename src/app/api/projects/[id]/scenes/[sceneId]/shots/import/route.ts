import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { Prisma, type Shot } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { findOwnedProject } from '@/lib/project-access';
import { syncSceneRodMin } from '@/lib/shots';
import { buildResetMinutesConfig, computeTempoTotal, recomputeResetsForOrderedShots } from '@/lib/shots-shared';
import { shotImportSchema } from '@/lib/validation/shot-import';

type Params = { params: { id: string; sceneId: string } };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fingerprint = ({ updatedAt: _updated, ...shot }: Shot) => hash(shot);
function sign(data: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Segredo de autenticação indisponível.');
  return createHmac('sha256', secret).update(data).digest('base64url');
}
function receipt(sceneId: string, shots: Shot[]) {
  const data = Buffer.from(JSON.stringify({ sceneId, expires: Date.now() + 7 * 86400000, shots: shots.map(s => ({ id: s.id, hash: fingerprint(s) })) })).toString('base64url');
  return `${data}.${sign(data)}`;
}
async function access(params: Params['params']) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (!await findOwnedProject(params.id, session.user.id, session.user.role)) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
  if (!await prisma.scene.findFirst({ where: { id: params.sceneId, projectId: params.id } })) return NextResponse.json({ error: 'Cena não encontrada.' }, { status: 404 });
  return null;
}
class Conflict extends Error {}
async function resetScene(tx: Prisma.TransactionClient, sceneId: string, projectId: string) {
  const shots = await tx.shot.findMany({ where: { sceneId }, orderBy: { ordem: 'asc' } });
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
  const config = buildResetMinutesConfig(project), resets = recomputeResetsForOrderedShots(shots);
  for (const shot of shots) {
    const r = resets.get(shot.id)!;
    if (shot.tipoReset !== r.tipoReset || shot.tempoResetMin !== config[r.tipoReset]) {
      await tx.shot.update({ where: { id: shot.id }, data: { tipoReset: r.tipoReset, tempoResetMin: config[r.tipoReset] } });
    }
  }
  return tx.shot.findMany({ where: { sceneId }, orderBy: { ordem: 'asc' } });
}
async function synchronize(sceneId: string, shots: Shot[]) {
  try { await syncSceneRodMin(sceneId, shots, { semNadaVolta: true }); return undefined; }
  catch (error) { console.error('Lote salvo; falha ao sincronizar estimativas:', error); return 'Planos salvos, mas a estimativa da diária não foi atualizada. Reabra a cena e confira o cronograma.'; }
}
export async function POST(request: Request, { params }: Params) {
  const denied = await access(params); if (denied) return denied;
  const parsed = shotImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confira os números, descrições e tempos do lote (máximo de 200 planos).' }, { status: 400 });
  const data = parsed.data;
  // IDs determinísticos tornam uma repetição da MESMA requisição segura após perda de conexão.
  const prefix = hash([params.sceneId, data.requestId, data]).slice(0, 24);
  const ids = data.shots.map((_, i) => `imp_${prefix}_${i}`);
  try {
    // Verifica configuração antes de qualquer gravação.
    sign('check');
    const result = await prisma.$transaction(async tx => {
      const existing = await tx.shot.findMany({ where: { sceneId: params.sceneId }, orderBy: { ordem: 'asc' } });
      const repeated = existing.filter(s => ids.includes(s.id));
      if (repeated.length === ids.length) {
        for (let i = 0; i < ids.length; i++) {
          const shot = repeated.find(s => s.id === ids[i])!;
          const expected = { ...data.shots[i], ...data.defaults };
          if (Object.entries(expected).some(([key, value]) => shot[key as keyof Shot] !== value) || shot.status !== 'PENDENTE' || shot.planoPaiId || shot.scenePartId || shot.ehMaster) {
            throw new Conflict('Este lote já foi salvo e depois alterado. Reabra a cena para conferir os planos.');
          }
        }
        return { shots: existing, created: repeated, repeated: true };
      }
      if (repeated.length) throw new Conflict('Parte deste lote já existe. Reabra a cena antes de tentar novamente.');
      const used = new Set(existing.map(s => s.numero.toUpperCase()));
      for (const shot of data.shots) {
        if (used.has(shot.numero)) throw new Conflict(`O número ${shot.numero} está repetido ou já existe nesta cena. Nenhum plano foi adicionado.`);
        used.add(shot.numero);
      }
      const last = existing.reduce((n, s) => Math.max(n, s.ordem), 0);
      await tx.shot.createMany({ data: data.shots.map((s, i) => ({ ...s, ...data.defaults, id: ids[i], projectId: params.id, sceneId: params.sceneId, ordem: last + i + 1, tempoTotalMin: computeTempoTotal(data.defaults.takesPrevistos, data.defaults.duracaoTakeMin, data.defaults.resetEntreTakesMin) })) });
      const shots = await resetScene(tx, params.sceneId, params.id);
      return { shots, created: shots.filter(s => ids.includes(s.id)), repeated: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    const warning = await synchronize(params.sceneId, result.shots);
    return NextResponse.json({ shots: result.shots, count: result.created.length, undoToken: receipt(params.sceneId, result.created), warning }, { status: result.repeated ? 200 : 201 });
  } catch (error) {
    if (error instanceof Conflict || error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) return NextResponse.json({ error: error instanceof Conflict ? error.message : 'A cena mudou durante a importação. Confira os números e tente novamente.' }, { status: 409 });
    console.error('Erro na importação de planos:', error);
    return NextResponse.json({ error: 'Não foi possível adicionar o lote. A revisão foi preservada; tente novamente.' }, { status: 500 });
  }
}
export async function DELETE(request: Request, { params }: Params) {
  const denied = await access(params); if (denied) return denied;
  const body = await request.json().catch(() => null);
  let payload: { sceneId: string; expires: number; shots: { id: string; hash: string }[] };
  try {
    if (typeof body?.undoToken !== 'string' || body.undoToken.length > 60000) throw new Error();
    const [data, signature, extra] = body.undoToken.split('.');
    const expected = sign(data);
    if (extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error();
    payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.sceneId !== params.sceneId || payload.expires < Date.now() || !payload.shots.length) throw new Error();
  } catch { return NextResponse.json({ error: 'Este comprovante de importação é inválido ou expirou.' }, { status: 400 }); }
  try {
    const shots = await prisma.$transaction(async tx => {
      const imported = await tx.shot.findMany({ where: { id: { in: payload.shots.map(s => s.id) }, sceneId: params.sceneId }, include: { schedule: true, coverages: true } });
      if (imported.length !== payload.shots.length) throw new Conflict('O lote já foi desfeito ou sofreu alterações. Confira a cena.');
      for (const { schedule, coverages, ...shot } of imported) {
        if (schedule || coverages.length || fingerprint(shot) !== payload.shots.find(s => s.id === shot.id)?.hash) throw new Conflict('Um plano do lote foi editado ou agendado. O desfazer automático foi bloqueado para preservar o trabalho.');
      }
      await tx.shot.deleteMany({ where: { sceneId: params.sceneId, id: { in: payload.shots.map(s => s.id) } } });
      return resetScene(tx, params.sceneId, params.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return NextResponse.json({ shots, warning: await synchronize(params.sceneId, shots) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Conflict ? error.message : 'A cena mudou. Reabra a cena para conferir o lote antes de desfazer.' }, { status: 409 });
  }
}
