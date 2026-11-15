import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getDailyBreakdown } from "@/lib/daily-breakdown";
import { DAILY_FIELDS, dailyField, sameValues, type DailyField } from "@/lib/daily-breakdown-shared";
import { prisma } from "@/lib/prisma";
import { findOwnedProject } from "@/lib/project-access";

const values = z.array(z.string().max(20000)).max(200);
const schema = z.object({ changes: z.array(z.object({
  sceneId: z.string().min(1),
  field: z.enum(DAILY_FIELDS.map((f) => f.key) as [DailyField, ...DailyField[]]),
  before: values, after: values,
})).min(1).max(500) });
type Context = { params: { id: string; shootDayId: string } };
class Conflict extends Error {}

export async function GET(_request: Request, { params }: Context) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!await findOwnedProject(params.id, session.user.id, session.user.role)) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  const data = await getDailyBreakdown(params.id, params.shootDayId);
  return data ? NextResponse.json(data) : NextResponse.json({ error: "Diária não encontrada." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!await findOwnedProject(params.id, session.user.id, session.user.role)) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise os campos: limite de 200 itens por campo e 500 alterações por vez." }, { status: 400 });
  const { changes } = parsed.data;
  if (new Set(changes.map((c) => `${c.sceneId}:${c.field}`)).size !== changes.length || changes.some((c) => dailyField(c.field).kind === "text" && c.after.length > 1)) {
    return NextResponse.json({ error: "Alterações duplicadas ou formato inválido." }, { status: 400 });
  }
  try {
    await prisma.$transaction(async (tx) => {
      const day = await tx.shootDay.findFirst({ where: { id: params.shootDayId, projectId: params.id },
        include: { scenes: { include: { scene: { include: { breakdownSheet: true, cast: true, extras: true } } } } } });
      if (!day) throw new Conflict("Diária não encontrada neste projeto.");
      const scenes = new Map(day.scenes.map((s) => [s.sceneId, s.scene]));
      // Valida todo o lote antes de gravar; uma edição concorrente nunca vira perda silenciosa.
      for (const change of changes) {
        const scene = scenes.get(change.sceneId);
        if (!scene || scene.projectId !== params.id) throw new Conflict("Uma das cenas não está mais nesta diária. Recarregue a lista.");
        const { field, before, after } = change;
        let current: string[];
        if (field === "characterIds" || field === "extraIds") {
          current = field === "characterIds" ? scene.cast.map((c) => c.characterId).sort() : scene.extras.map((e) => e.extraId).sort();
          const ids = [...new Set(after)];
          const count = field === "characterIds"
            ? await tx.character.count({ where: { id: { in: ids }, projectId: params.id } })
            : await tx.extra.count({ where: { id: { in: ids }, projectId: params.id } });
          if (count !== ids.length) throw new Conflict("Elenco ou figuração não pertence a este projeto.");
        } else {
          const value = scene.breakdownSheet?.[field];
          current = Array.isArray(value) ? value : value ? [value] : [];
        }
        if (!sameValues(current, before)) throw new Conflict(`A cena ${scene.numero} foi alterada em outra tela. Suas edições foram mantidas aqui; recarregue os dados antes de tentar novamente.`);
      }
      for (const { sceneId, field, before, after } of changes) {
        if (field === "characterIds") {
          await tx.sceneCast.deleteMany({ where: { sceneId, characterId: { in: before.filter((id) => !after.includes(id)) } } });
          await tx.sceneCast.createMany({ data: [...new Set(after)].filter((id) => !before.includes(id)).map((characterId) => ({ sceneId, characterId })), skipDuplicates: true });
        } else if (field === "extraIds") {
          await tx.extraScene.deleteMany({ where: { sceneId, extraId: { in: before.filter((id) => !after.includes(id)) } } });
          await tx.extraScene.createMany({ data: [...new Set(after)].filter((id) => !before.includes(id)).map((extraId) => ({ sceneId, extraId })), skipDuplicates: true });
        } else {
          const data = { [field]: dailyField(field).kind === "text" ? after[0] || null : after };
          await tx.breakdownSheet.upsert({ where: { sceneId }, create: { sceneId, ...data }, update: data });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    revalidatePath(`/projects/${params.id}`, "layout");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Conflict || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
      return NextResponse.json({ error: error instanceof Conflict ? error.message : "Houve uma edição simultânea. Recarregue os dados e tente novamente." }, { status: 409 });
    }
    console.error("Falha ao salvar breakdown da diária", error);
    return NextResponse.json({ error: "Não foi possível salvar. Suas edições continuam na tela." }, { status: 500 });
  }
}
