import { z } from "zod";
import { parsePaginas } from "@/lib/paginas";
import { sceneSchema } from "@/lib/validation/scene";

// Cadastro rápido: sem vínculos externos. Locação, elenco e planos podem ser preparados depois.
export const newDailySceneSchema = sceneSchema.pick({ tipo: true, periodo: true, set: true, sinopse: true, paginas: true }).extend({
  requestId: z.string().uuid(),
  numero: z.string().trim().min(1, "Informe o número da cena.").max(100),
  set: z.string().trim().max(500).transform((value) => value.toUpperCase()),
  sinopse: z.string().trim().max(10000),
  periodo: z.string().trim().max(100).transform((value) => value.toUpperCase()),
  paginas: z.string().refine((value) => {
    const pages = parsePaginas(value);
    return pages !== null && pages < 1000;
  }, "Use páginas em oitavos, como 1 2/8, e um total menor que 1000."),
}).strict();
