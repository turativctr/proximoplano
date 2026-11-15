import { prisma } from "@/lib/prisma";
import { DAILY_FIELDS, type DailyValues } from "@/lib/daily-breakdown-shared";

export async function getDailyBreakdown(projectId: string, shootDayId: string) {
  const day = await prisma.shootDay.findFirst({
    where: { id: shootDayId, projectId },
    include: { scenes: { orderBy: [{ bloco: "asc" }, { ordem: "asc" }], include: {
      scenePart: true,
      scene: { include: { breakdownSheet: true, cast: true, extras: true,
        shots: { orderBy: { ordem: "asc" } }, parts: { orderBy: { ordem: "asc" } } } },
    } } },
  });
  if (!day) return null;
  const [cast, extras] = await Promise.all([
    prisma.character.findMany({ where: { projectId }, orderBy: { personagem: "asc" }, select: { id: true, personagem: true } }),
    prisma.extra.findMany({ where: { projectId }, orderBy: { personagem: "asc" }, select: { id: true, personagem: true, quantidade: true } }),
  ]);
  return {
    id: day.id, numeroDia: day.numeroDia, data: day.data.toISOString(),
    cast: cast.map((c) => ({ id: c.id, label: c.personagem })),
    extras: extras.map((e) => ({ id: e.id, label: `${e.personagem} (${e.quantidade})` })),
    scenes: day.scenes.map(({ scene, scenePart }) => {
      const values = Object.fromEntries(DAILY_FIELDS.map((field) => {
        if (field.key === "characterIds") return [field.key, scene.cast.map((c) => c.characterId).sort()];
        if (field.key === "extraIds") return [field.key, scene.extras.map((e) => e.extraId).sort()];
        const value = scene.breakdownSheet?.[field.key];
        return [field.key, Array.isArray(value) ? value : value ? [value] : []];
      })) as DailyValues;
      return {
        id: scene.id, numero: scene.numero, set: scene.set, sinopse: scene.sinopseAD || scene.sinopse,
        omitida: scene.omitida, part: scenePart?.rotulo ?? null,
        values, shots: scene.shots, parts: scene.parts.map((p) => ({ id: p.id, rotulo: p.rotulo, oitavos: p.oitavos })),
        oitavos: Math.round(Number(scene.paginas) * 8),
        duracaoAlvoMin: scene.duracaoAlvoMin, tempoEstimadoMin: scene.tempoEstimadoMin,
      };
    }),
  };
}
