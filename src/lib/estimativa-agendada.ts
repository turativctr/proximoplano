/** Leitura única do tempo de uma cena/parte: não grava sugestões no banco. */
import { resolverOrigemDoTempo, type MediaDoProjeto, type PartidaDoProjeto } from "./estimativa";
import { paginasParaOitavos, tempoEstimadoDaEntrada } from "./scene-parts-shared";
import { computeSceneShotTotals, resolveEffectiveResetMin } from "./shots-shared";

type Plano = Parameters<typeof computeSceneShotTotals>[0][number] & { scenePartId?: string | null };
type Cena = {
  paginas: Parameters<typeof paginasParaOitavos>[0]; tipo: "INT" | "EXT" | null; tempoEstimadoMin: number | null;
  duracaoAlvoMin: number | null; shots: Plano[];
};
export function estimativaAgendada(
  cena: Cena,
  parte: { id?: string; oitavos: number } | null | undefined,
  linha: { rodMin: number | null; rodDigitado: boolean },
  contexto: { partida: PartidaDoProjeto; media: MediaDoProjeto | null; fatorResetPercent?: number; permitirPartida: boolean }
) {
  const planos = parte ? cena.shots.filter((p) => p.scenePartId === parte.id) : cena.shots;
  const total = computeSceneShotTotals(planos);
  const fator = contexto.fatorResetPercent ?? 100;
  const resetsMin = planos.filter((p) => p.status !== "DESCARTADO").reduce((sum, p) => sum + resolveEffectiveResetMin(p.tempoResetMin ?? 0, p.tempoResetMinManual, fator), 0);
  const oitavosCena = paginasParaOitavos(cena.paginas);
  return resolverOrigemDoTempo({
    digitadoMin: linha.rodDigitado ? linha.rodMin : null,
    gravadoMin: linha.rodDigitado ? null : linha.rodMin ?? tempoEstimadoDaEntrada(cena.tempoEstimadoMin, oitavosCena, parte),
    duracaoAlvoMin: parte ? null : cena.duracaoAlvoMin,
    planosMin: total.count ? total.planosMin + resetsMin : null,
    planos: total.count,
    resetsMin, fatorResetPercent: fator,
    oitavos: parte?.oitavos ?? oitavosCena,
    ambiente: cena.tipo, partida: contexto.partida, media: contexto.media,
    permitirPartida: contexto.permitirPartida,
  });
}
