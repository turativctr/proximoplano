import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { deriveClasseLuz } from "@/lib/fdx-parser";
import { parsePaginas } from "@/lib/paginas";
import { prisma } from "@/lib/prisma";
import { findOwnedProject } from "@/lib/project-access";
import { recalculateDayBlocks } from "@/lib/shootday-blocks";
import { newDailySceneSchema } from "@/lib/validation/daily-scene";

class CreationConflict extends Error {}

export async function POST(request: Request, { params }: { params: { id: string; shootDayId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!await findOwnedProject(params.id, session.user.id, session.user.role)) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  if (!await prisma.shootDay.findFirst({ where: { id: params.shootDayId, projectId: params.id }, select: { id: true } })) return NextResponse.json({ error: "Diária não encontrada." }, { status: 404 });
  const parsed = newDailySceneSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Confira os dados da cena." }, { status: 400 });
  const { requestId, paginas, ...data } = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      // O UUID é a identidade desta criação. Repetir após perder a resposta não cria outra cena.
      const existing = await tx.scene.findUnique({ where: { id: requestId }, include: { shootDays: true } });
      if (existing) {
        if (existing.projectId !== params.id || !existing.shootDays.some((row) => row.shootDayId === params.shootDayId)) throw new CreationConflict("Esta solicitação já foi usada. Reabra o formulário e confira a diária.");
        return { sceneId: existing.id, numero: existing.numero, alreadyCreated: true };
      }
      const day = await tx.shootDay.findFirst({ where: { id: params.shootDayId, projectId: params.id }, include: { scenes: true, blocos: true } });
      if (!day) throw new CreationConflict("A diária não está mais disponível.");
      if (await tx.scene.findUnique({ where: { projectId_numero: { projectId: params.id, numero: data.numero } } })) throw new CreationConflict("Já existe uma cena com esse número. Use Adicionar cenas para escolher uma existente ou informe outro número.");
      const { classeLuz, periodoFim } = deriveClasseLuz(data.periodo || null);
      const scene = await tx.scene.create({ data: {
        ...data, id: requestId, projectId: params.id, classeLuz, periodoFim,
        paginas: parsePaginas(paginas)!.toString(), paginasEditadoManualmente: paginas.trim() !== "",
      } });
      // Só acrescenta ao final; preserva execução, notas e tempos manuais das demais cenas.
      const ordem = Math.max(0, ...day.scenes.map((row) => row.ordem), ...day.blocos.map((row) => row.ordem)) + 1;
      const bloco = [...day.scenes, ...day.blocos].some((row) => row.bloco === "TARDE") ? "TARDE" : "MANHA";
      await tx.sceneShootDay.create({ data: { sceneId: scene.id, shootDayId: day.id, ordem, bloco } });
      return { sceneId: scene.id, numero: scene.numero, alreadyCreated: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    let warning: string | null = null;
    try { await recalculateDayBlocks(params.shootDayId); }
    catch (error) {
      console.error("Cena criada na diária; falha ao recalcular horários", error);
      warning = "A cena foi criada e adicionada. Confira Planos e horários: não foi possível recalcular os horários agora.";
    }
    revalidatePath(`/projects/${params.id}`, "layout");
    return NextResponse.json({ ...result, warning }, { status: result.alreadyCreated ? 200 : 201 });
  } catch (error) {
    if (error instanceof CreationConflict || (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code))) return NextResponse.json({ error: error instanceof CreationConflict ? error.message : "Outra alteração ocorreu ao mesmo tempo. Tente novamente; a solicitação não duplica a cena." }, { status: 409 });
    console.error("Falha ao criar cena na diária", error);
    return NextResponse.json({ error: "Não foi possível criar a cena. Tente novamente." }, { status: 500 });
  }
}
