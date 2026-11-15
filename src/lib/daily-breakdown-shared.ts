/** Campos do breakdown por diária. O conteúdo continua pertencendo à cena, inclusive às partes. */
export const DAILY_FIELDS = [
  { key: "characterIds", label: "Elenco", kind: "cast", department: "Elenco" },
  { key: "extraIds", label: "Figuração", kind: "extras", department: "Elenco" },
  { key: "figurino", label: "Figurino", kind: "list", department: "Figurino e maquiagem" },
  { key: "make", label: "Maquiagem / cabelo / efeitos", kind: "list", department: "Figurino e maquiagem" },
  { key: "objetos", label: "Objetos de cena", kind: "list", department: "Arte" },
  { key: "comidaCena", label: "Comida de cena", kind: "list", department: "Arte" },
  { key: "arteDressing", label: "Ambientação / dressing", kind: "text", department: "Arte" },
  { key: "arteGrafica", label: "Arte gráfica", kind: "list", department: "Arte" },
  { key: "notasArte", label: "Notas de arte", kind: "text", department: "Arte" },
  { key: "notasFoto", label: "Foto / maquinaria / elétrica", kind: "text", department: "Fotografia" },
  { key: "microfones", label: "Microfones", kind: "list", department: "Som" },
  { key: "trilha", label: "Trilha / músicas", kind: "list", department: "Som" },
  { key: "notasSom", label: "Notas de som", kind: "text", department: "Som" },
  { key: "habilidades", label: "Habilidades do elenco", kind: "list", department: "Elenco" },
  { key: "posProducao", label: "Pós-produção", kind: "list", department: "Pós-produção" },
  { key: "notasContinuidade", label: "Notas de continuidade", kind: "text", department: "Continuidade e produção" },
  { key: "notasProducao", label: "Notas de produção", kind: "text", department: "Continuidade e produção" },
] as const;
export type DailyField = typeof DAILY_FIELDS[number]["key"];
export type DailyValues = Record<DailyField, string[]>;
export type DailyChange = { sceneId: string; field: DailyField; before: string[]; after: string[] };
export const dailyField = (key: DailyField) => DAILY_FIELDS.find((f) => f.key === key)!;
export const sameValues = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
export function addDailyValue(current: string[], addition: string, field: DailyField): string[] {
  const value = addition.trim();
  if (!value) return current;
  if (dailyField(field).kind === "text") {
    return [current[0] ? `${current[0]}\n${value}` : value];
  }
  return current.includes(value) ? current : [...current, value];
}
export function groupDailyValues(scenes: { id: string; values: DailyValues }[], field: DailyField) {
  const groups = new Map<string, string[]>();
  for (const scene of scenes) for (const value of new Set(scene.values[field])) {
    if (!value.trim()) continue;
    groups.set(value, [...(groups.get(value) ?? []), scene.id]);
  }
  return [...groups].map(([value, sceneIds]) => ({ value, sceneIds }));
}
