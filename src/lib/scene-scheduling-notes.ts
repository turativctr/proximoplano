import type { Prisma } from "@prisma/client";
import { parsePersonagemPrefixed, type CharacterLike } from "@/lib/ordem-do-dia";
import { prisma } from "@/lib/prisma";

/** Alertas automáticos detectados no breakdown/planos da cena, usados pra pré-preencher
 *  SceneShootDay.observacoes na primeira vez que a cena é agendada num dia. Compartilhado entre
 *  Stripboard e inclusão pela diária: o pré-preenchimento só roda pra pares (sceneId, shootDayId) genuinamente novos, nunca
 *  sobrescrevendo notas que o AD já tenha editado. */
export async function computePrefillObservacoes(sceneId: string, characters: CharacterLike[], db: Prisma.TransactionClient = prisma): Promise<string | null> {
  const [breakdown, shots] = await Promise.all([
    db.breakdownSheet.findUnique({ where: { sceneId } }),
    db.shot.findMany({ where: { sceneId }, orderBy: { ordem: "asc" }, select: { numero: true, tipoReset: true } }),
  ]);

  const lines: string[] = [];

  if (breakdown?.comidaCena.length) {
    lines.push(`Arte: ${breakdown.comidaCena.join(", ")}`);
  }

  const efeitoEspecial = breakdown?.make.filter((m) => m.toLowerCase().includes("efeito")) ?? [];
  if (efeitoEspecial.length) {
    lines.push(`Make: ${efeitoEspecial.join(", ")}`);
  }

  for (const raw of breakdown?.habilidades ?? []) {
    const { character, descricao } = parsePersonagemPrefixed(raw, characters);
    if (character) lines.push(`Elenco: ${character.personagem} — ${descricao}`);
  }

  for (let i = 1; i < shots.length; i++) {
    if (shots[i].tipoReset === "RESET_COMPLETO") {
      lines.push(`Atenção: reset completo entre P${shots[i - 1].numero} e P${shots[i].numero} — verificar continuidade`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

