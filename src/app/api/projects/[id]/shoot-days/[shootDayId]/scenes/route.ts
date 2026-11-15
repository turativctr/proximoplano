import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { sceneOptionKey, type DailySceneOption } from "@/lib/daily-scene-picker";
import { naturalCompare } from "@/lib/natural-sort";
import { prisma } from "@/lib/prisma";
import { findOwnedProject } from "@/lib/project-access";
import { computePrefillObservacoes } from "@/lib/scene-scheduling-notes";
import { recalculateDayBlocks } from "@/lib/shootday-blocks";

type Context = { params: { id: string; shootDayId: string } };
const schema = z.object({ items: z.array(z.object({ sceneId: z.string().min(1), scenePartId: z.string().min(1).nullable() })).min(1).max(100) });
class ScheduleConflict extends Error {}

async function access(params: Context["params"]) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!await findOwnedProject(params.id, session.user.id, session.user.role)) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  if (!await prisma.shootDay.findFirst({ where: { id: params.shootDayId, projectId: params.id }, select: { id: true } })) return NextResponse.json({ error: "Diária não encontrada." }, { status: 404 });
  return null;
}

export async function GET(_request: Request, { params }: Context) {
  const error = await access(params);
  if (error) return error;
  const scenes = await prisma.scene.findMany({ where: { projectId: params.id, omitida: false }, include: {
    parts: { orderBy: { ordem: "asc" } }, locacao: { select: { nome: true } },
    shootDays: { include: { shootDay: { select: { numeroDia: true } } } },
  } });
  const options: DailySceneOption[] = scenes.sort((a, b) => naturalCompare(a.numero, b.numero)).flatMap((scene) => {
    const inDay = scene.shootDays.find((row) => row.shootDayId === params.shootDayId);
    return (scene.parts.length ? scene.parts : [null]).map((part) => {
      const assigned = scene.shootDays.find((row) => !part || row.scenePartId === part.id || row.scenePartId === null);
      const blocked = inDay
        ? inDay.scenePartId === (part?.id ?? null) ? "Já nesta diária" : "Outra parte desta cena já está nesta diária"
        : assigned ? `Agendada na diária ${assigned.shootDay.numeroDia}` : null;
      return {
        key: sceneOptionKey(scene.id, part?.id ?? null), sceneId: scene.id, scenePartId: part?.id ?? null,
        numero: scene.numero, part: part?.rotulo ?? null, set: scene.set, locacao: scene.locacao?.nome ?? null,
        sinopse: scene.sinopseAD || scene.sinopse, paginas: part ? part.oitavos / 8 : Number(scene.paginas), blocked,
      };
    });
  });
  return NextResponse.json({ options });
}

export async function POST(request: Request, { params }: Context) {
  const error = await access(params);
  if (error) return error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Selecione entre 1 e 100 cenas ou partes." }, { status: 400 });
  const { items } = parsed.data;
  if (new Set(items.map((item) => item.sceneId)).size !== items.length) return NextResponse.json({ error: "Escolha apenas uma parte de cada cena nesta diária." }, { status: 400 });
  try {
    const added = await prisma.$transaction(async (tx) => {
      const day = await tx.shootDay.findFirst({ where: { id: params.shootDayId, projectId: params.id }, include: { scenes: true, blocos: true } });
      if (!day) throw new ScheduleConflict("A diária não está mais disponível.");
      const scenes = await tx.scene.findMany({ where: { id: { in: items.map((i) => i.sceneId) }, projectId: params.id }, include: { parts: true, shootDays: true } });
      const byId = new Map(scenes.map((scene) => [scene.id, scene]));
      const pending = [];
      for (const item of items) {
        const scene = byId.get(item.sceneId);
        if (!scene || scene.omitida) throw new ScheduleConflict("Uma das cenas foi omitida ou não pertence a este projeto. Atualize a lista.");
        if (scene.parts.length ? !scene.parts.some((p) => p.id === item.scenePartId) : item.scenePartId !== null) throw new ScheduleConflict(`Confira a divisão da cena ${scene.numero}. Selecione uma parte válida.`);
        const inDay = scene.shootDays.find((row) => row.shootDayId === day.id);
        if (inDay) {
          if (inDay.scenePartId === item.scenePartId) continue; // Repetir uma requisição não duplica nem reinicia execução.
          throw new ScheduleConflict(`Outra parte da cena ${scene.numero} já está nesta diária.`);
        }
        if (scene.shootDays.some((row) => item.scenePartId === null || row.scenePartId === item.scenePartId || row.scenePartId === null)) throw new ScheduleConflict(`A cena ${scene.numero}${item.scenePartId ? " (parte selecionada)" : ""} já foi agendada em outra diária. Nada foi movido; atualize a lista.`);
        pending.push(item);
      }
      // Apêndice: não reordena, recria nem modifica nenhuma linha existente, incluindo blocos livres.
      let order = Math.max(0, ...day.scenes.map((s) => s.ordem), ...day.blocos.map((b) => b.ordem));
      const bloco = [...day.scenes, ...day.blocos].some((row) => row.bloco === "TARDE") ? "TARDE" : "MANHA";
      const characters = pending.length ? await tx.character.findMany({ where: { projectId: params.id }, select: { id: true, idCurto: true, numeroElenco: true, personagem: true } }) : [];
      for (const item of pending) {
        const notes = await computePrefillObservacoes(item.sceneId, characters, tx);
        await tx.sceneShootDay.create({ data: {
          sceneId: item.sceneId, scenePartId: item.scenePartId, shootDayId: day.id, ordem: ++order, bloco,
          observacoes: notes, observacoesAutoGeradas: notes !== null,
        } });
      }
      return pending.length;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    let warning: string | null = null;
    try { await recalculateDayBlocks(params.shootDayId); }
    catch (e) {
      console.error("Cenas adicionadas; falha ao recalcular horários", e);
      warning = "As cenas foram adicionadas, mas não foi possível atualizar os horários. Confira Planos e horários antes de gerar a OD.";
    }
    revalidatePath(`/projects/${params.id}`, "layout");
    return NextResponse.json({ added, alreadyPresent: items.length - added, warning });
  } catch (e) {
    if (e instanceof ScheduleConflict || (e instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(e.code))) {
      return NextResponse.json({ error: e instanceof ScheduleConflict ? e.message : "O cronograma mudou durante a inclusão. Atualize a lista e tente novamente." }, { status: 409 });
    }
    console.error("Falha ao adicionar cenas na diária", e);
    return NextResponse.json({ error: "Não foi possível adicionar as cenas. Tente novamente." }, { status: 500 });
  }
}
