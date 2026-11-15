import { z } from 'zod';
import { normalizarTamanho } from '@/lib/shots-shared';
const field = z.string().trim().max(1000).default('');
export const shotImportSchema = z.object({
  requestId: z.string().uuid(),
  source: z.string().trim().min(1).max(250),
  shots: z.array(z.object({
    numero: z.string().trim().min(1).max(10).transform(v => v.toUpperCase()),
    descricao: z.string().trim().min(1).max(20000),
    tamanho: field.transform(normalizarTamanho), angulo: field, movimento: field, lente: field,
    notasDirecao: z.string().max(40000).default(''),
  })).min(1).max(200),
  defaults: z.object({
    takesPrevistos: z.number().int().min(1).max(100),
    duracaoTakeMin: z.number().min(0).max(600),
    resetEntreTakesMin: z.number().int().min(0).max(600),
  }),
});
