import type { Tema } from "@prisma/client";

/** Nome do cookie que guarda o tema — além do banco (User.tema), pra o servidor saber o tema já
 *  na primeira renderização (sem cookie, a tela piscaria no tema errado até corrigir). Ver
 *  resolução de tema em src/app/layout.tsx. */
export const THEME_COOKIE_NAME = "theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

// Onda 3 — PARTE 3: CLARO virou DOCUMENTARIO (nome de gênero, como todo o resto — "claro" era o
// único sem nome de gênero; ver enum Tema no schema.prisma e a migration RENAME VALUE).
// Onda 4: EXPERIMENTAL virou FUTURISTA (o conceito visual virou neon noir — "experimental" não
// descrevia mais nada, mesmo mecanismo de rename).
export const TEMA_VALUES = [
  "DOCUMENTARIO",
  "NOIR",
  "COMEDIA",
  "HISTORICO",
  "HORROR",
  "DRAMA",
  "TELENOVELA",
  "FUTURISTA",
  "FANTASIA",
  "THRILLER",
] as const;

export const TEMA_LABEL: Record<Tema, string> = {
  DOCUMENTARIO: "Documentário",
  NOIR: "Noir",
  COMEDIA: "Comédia",
  HISTORICO: "Histórico",
  HORROR: "Horror",
  DRAMA: "Drama",
  TELENOVELA: "Telenovela",
  FUTURISTA: "Futurista",
  FANTASIA: "Fantasia",
  THRILLER: "Thriller",
};

/** O preview usa os próprios tokens CSS do tema, sem uma segunda paleta que possa divergir. */
export const TEMA_DESCRIPTION: Record<Tema, string> = {
  DOCUMENTARIO: "Branco e linhas de ficha.",
  NOIR: "Persianas, carvão e prata.",
  COMEDIA: "Luz solar e cantos suaves.",
  HISTORICO: "Grão terroso e filetes de bronze.",
  HORROR: "Vinheta, riscos e vermelho-sangue.",
  DRAMA: "Luz lateral e sombras difusas.",
  TELENOVELA: "Cetim, ouro e reflexos quentes.",
  FUTURISTA: "Grade fina e filetes neon.",
  FANTASIA: "Lavanda suave e luz de vitral.",
  THRILLER: "Faixas de isolamento e recortes retos.",
};

export function isValidTema(value: string): value is Tema {
  return (TEMA_VALUES as readonly string[]).includes(value);
}

/** Evento disparado sempre que o tema muda no cliente (ver applyTheme em use-theme.ts) — permite
 *  que componentes como PageBackground reajam na hora, sem precisar de um Context Provider global
 *  só pra isso. */
export const THEME_CHANGE_EVENT = "proximoplano:theme-change";
