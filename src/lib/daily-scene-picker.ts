/** Uma opção representa uma cena inteira OU uma parte. Nunca agendar a cena inteira se há partes. */
export type DailySceneOption = {
  key: string;
  sceneId: string;
  scenePartId: string | null;
  numero: string;
  part: string | null;
  set: string | null;
  locacao: string | null;
  sinopse: string | null;
  paginas: number;
  blocked: string | null;
};
export const sceneOptionKey = (sceneId: string, scenePartId: string | null) => `${sceneId}:${scenePartId ?? ""}`;

export function toggleDailySceneSelection(selected: DailySceneOption[], option: DailySceneOption) {
  if (option.blocked) return selected;
  if (selected.some((item) => item.key === option.key)) return selected.filter((item) => item.key !== option.key);
  // Uma parte por cena na diária. A UI desabilita as irmãs; a regra também vale fora dela.
  if (selected.some((item) => item.sceneId === option.sceneId) || selected.length >= 100) return selected;
  return [...selected, option];
}
