# AGENTS.md — Próximo Plano

Instruções para agentes de código (Codex e afins). Conferido contra o código e o banco em
2026-11-14. Se algo aqui contradisser o código, **o código vence** — avise o dono e corrija este
arquivo no mesmo commit.

---

## 0. Regras de ouro (leia antes de qualquer tarefa)

1. **Nunca toque no banco de produção.** Não rode `prisma migrate deploy`, `db push`, seed nem
   scripts de `scripts/` com uma `DATABASE_URL` de produção (Neon). O deploy aplica as migrations
   sozinho (ver §3). Já houve incidente real por isso.
2. **Não reescreva execução ao replanejar** (§5.1). Nunca `deleteMany` + `createMany` em tabelas
   de agenda.
3. **Não renumere planos** (§5.2).
4. **Migration nova: mostre o SQL ao dono antes** e explique o impacto em dados existentes.
5. **Não faça push sem pedir.** Push na `main` = deploy em produção.
6. **Verifique no caminho de gravação** (§7): abrir a tela não prova que salva.
7. Interface, mensagens, commits e respostas ao dono em **português do Brasil**.

---

## 1. O produto

**Próximo Plano** é um app web de planejamento e produção de filmes independentes brasileiros
(estilo Movie Magic Scheduling + Budgeting), desenhado para o trabalho da **Assistente de Direção
(AD)** e da produção. Vocabulário de set brasileiro: diária, Ordem do Dia (OD), decupagem, plano,
coverage, master, figuração, desprodução, oitavos de página, Rod (tempo de rodagem), prep.

- Nome técnico: `proximoplano`; nome do produto: **Próximo Plano** (distinto de Próxima Cena).
- Repositório GitHub: `turativctr/proximoplano`; remote local e vínculo Git da Vercel atualizados.
- Usuário principal e dono: diretor/AD que testa como caixa-preta e manda relatórios de bug com
  hipótese de causa. **O sintoma é confiável; a causa sugerida nem sempre.** Leia o código e os
  dados antes de corrigir e diga claramente se a hipótese estiver errada.

### Fluxo do usuário
1. `/projects/new` — wizard de 3 passos; importa roteiro **.fdx ou .pdf** (opcional; .wdz foi
   removido da interface) → cenas, personagens, oitavos, metadados da página de rosto.
2. **Cadastro** — Cenas (+ Breakdown por cena + decupagem/planos), Elenco, Figuração, Locações.
3. **Preparação** — Stripboard (cenas → diárias, Boneyard), Calendário, DOOD, Documentos.
4. **Diária** — painel (`/shootdays/[id]`), Ordem do Dia (wizard), Hora a Hora, **Modo Set**
   (tela cheia, alto contraste, para iPad no set), lançamento do realizado.
5. **Orçamento** — Resumo (topsheet), Detalhado, Globais e Encargos, Cenários, Acompanhamento.
6. **Tratamentos** (`/drafts`) — reimportar versão nova do roteiro → diff por cena, cores WGA.
7. **Guia** (`/guia`) — 6 etapas (ROTEIRO, ELENCO, BREAKDOWN, CRONOGRAMA, ORDEM_DO_DIA, ORCAMENTO)
   com status automático + conclusão manual; tour inicial (`User.tourConcluido`).

---

## 2. Stack

- **Next.js 14.2 App Router**, React 18, **TypeScript strict**, alias `@/` → `src/`.
- **PostgreSQL + Prisma 5** (`prisma/schema.prisma`, tabelas com `@@map` em snake_case;
  campos em português, ex.: `projects.titulo`).
- **NextAuth 4** (JWT; credenciais com bcrypt).
- Tailwind 3 + componentes estilo shadcn sobre Radix (`src/components/ui/`), lucide-react, sonner.
- dnd-kit (drag-and-drop), **@react-pdf/renderer 4** (PDFs), ExcelJS (xlsx), fast-xml-parser
  (FDX), **pdfjs-dist no navegador** (import de PDF), `diff`, zod, next-pwa.
- Hospedagem: **Vercel** + **Neon** (Postgres sa-east-1, host `-pooler`).
- Repositório `github.com/turativctr/proximoplano`, branch única `main`.

---

## 3. Ambientes e comandos

### Rodar do zero (máquina qualquer)
```bash
npm install                      # postinstall: prisma generate + copia assets do pdfjs p/ public/pdfjs
cp .env.example .env             # DATABASE_URL (Postgres local), NEXTAUTH_SECRET, NEXTAUTH_URL=http://localhost:3000
npx prisma migrate dev           # aplica as migrations no banco LOCAL
npm run db:seed                  # cria demo@proximoplano.local + projetos Ressaca e Viageiro
npm run dev                      # http://localhost:3000
```
- `db:seed` **apaga todos os projetos do usuário demo** antes de recriar. Os projetos reais
  pertencem a outros usuários, mas confirme antes de rodar num banco que não é descartável.

### Mac do dono (sem Homebrew/sudo)
- Node em `~/.local/node/bin`; Postgres.app em `~/Applications/Postgres.app/Contents/Versions/latest/bin`;
  dados em `~/.local/postgres-data`, porta 5432, auth trust, banco `proximoplano`.
- Shells não interativos podem não ter esse PATH:
  `export PATH="$HOME/.local/node/bin:$HOME/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"`
- Postgres não sobe sozinho após reiniciar:
  `pg_ctl -D ~/.local/postgres-data -l ~/.local/postgres-data/logfile -o "-p 5432" start`
- Atalho do dono: `~/Applications/Próximo Plano.app` (liga Postgres + `next dev`; log em
  `~/Library/Logs/proximo-plano.log`). Se o servidor já estiver na porta 3000, use-o.
- Depois de migration que cria/renomeia model, **reinicie o `next dev`** — ele mantém o Prisma
  Client antigo em memória (o model novo vem `undefined` e parece bug de código).

### Vínculos locais com Vercel e Neon (configurados em 14/11/2026)
- Pasta de trabalho atual: `~/Documents/Codex/Projetos/proximo-plano`; a pasta antiga foi preservada.
- `.vercel/project.json`: projeto **proximoplano**, `prj_OAReEYs5U5A6PJVHlAC6zubXZPDM`, equipe `victor-turati`.
- `.neon`: projeto **proximoplano**, `crimson-wildflower-33344350`, região `aws-sa-east-1`, branch **production**.
- Esses arquivos são locais e ignorados no Git. Credenciais permanecem nas sessões globais das CLIs; não copie tokens para documentação.
- `npm run cloud:status` consulta os dois provedores; `vercel:status` e `neon:status` consultam separadamente. São comandos de leitura, sem deploy e sem SQL.
- `Verificar conexões.command` prepara o PATH e executa essas consultas pela pasta nova.
- **O contexto Neon aponta para produção; não é o banco de desenvolvimento.** Não execute `neon env pull`, `vercel env pull` ou comandos SQL/migrations contra esse contexto por iniciativa própria. O localhost deve continuar no Postgres local.
- `npm run local:check` verifica a configuração efetiva do Next, incluindo `.env.local` e sobrescritas. O iniciador recusa URLs de banco remoto.
- Para reconstruir apenas os vínculos: `npx vercel@65.14.0 link --yes --scope victor-turati --project proximoplano` e `npx neon@9.3.2 link --project-id crimson-wildflower-33344350 --org-id org-solitary-meadow-37945301 --branch production --yes --no-env-pull --no-config --no-analytics`.
- Vincular não publica. Continuam valendo as restrições de push/deploy e de produção acima.

### Autenticação
- **Desenvolvimento:** sem login. `src/middleware.ts` manda quem não tem sessão para
  `/api/auth/auto-login`, que emite um JWT para o e-mail fixo `demo@proximoplano.local`
  (`DEMO_EMAIL` em `src/app/api/auth/auto-login/route.ts`). Não troque por `findFirst()` — há
  vários usuários no banco.
- **Produção:** `/login` e `/register`; a rota de auto-login é desligada quando
  `NODE_ENV=production`. O middleware escolhe o cookie seguro por
  `request.nextUrl.protocol === "https:"` — não mude para depender de `NEXTAUTH_URL`.
- Para chamar rotas com curl localmente:
  ```bash
  curl -s -c /tmp/c.txt "http://localhost:3000/api/auth/auto-login?callbackUrl=/projects" -o /dev/null
  curl -s -b /tmp/c.txt http://localhost:3000/api/projects/<id>/reports/callsheet?... -o out.pdf
  ```

### Checagens (rode antes de entregar)
```bash
npx tsc --noEmit                 # passa limpo hoje
npm run lint                     # passa limpo hoje (next/core-web-vitals)
npm run verify:pdf               # renderiza TODOS os PDFs com dados de pior caso; detecta colisão de texto e glifo quebrado (precisa do Postgres com o seed)
```
Não há framework de testes unitários: os testes são as suítes `npm run verify:*` em `scripts/`
(`tsx`, leem o banco local, a maioria não grava). Rode a da área que você tocou:

| Área | Suíte |
|---|---|
| contagem de oitavos no import | `verify:eighths` (fixtures em `scripts/fixtures/familiar-insonia.{fdx,pdf}`) |
| período/locação no import | `verify:periodo` |
| detecção de elenco no import | `verify:elenco` |
| tempo dos planos | `verify:planos` |
| divisão de cena | `verify:divisao` |
| filtro do Boneyard | `verify:boneyard` |
| linha do tempo da diária | `verify:timeline` |
| execução preservada ao replanejar | `verify:execucao` |
| jornada/modo simplificado | `verify:jornada` |
| lançamento do realizado | `verify:realizado` |
| origem da estimativa | `verify:estimativa` |
| tokens de tema | `verify:themes` |
| qualquer PDF | `verify:pdf` |
| paginação da Ordem do Dia | `verify:od-pagination` (11 cenários locais; linhas/horários juntos, planos completos, margens e última página) |

Para lógica nova com regra de negócio, crie uma suíte `scripts/verify-<area>.ts` nesse mesmo
estilo e registre em `package.json`.

### Produção e deploy
- URL: `https://proximoplano.victorturati.com.br` (Vercel).
- **Deploy = push na `main`.** O `build` é `node scripts/migrate-producao.mjs && next build`.
  O script só roda `prisma migrate deploy` quando `VERCEL_ENV=production` (previews usam a mesma
  `DATABASE_URL`); com host `-pooler` liga `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` (senão P1002);
  prefere `DIRECT_URL` se existir. Build falho não derruba o site.
- Consequência: **toda migration commitada vai para produção no próximo push.** Não commite
  migration experimental. Migrations precisam ser seguras para dados reais (não dropar coluna
  com dado sem backfill/aviso).
- `.env.production` local tem credencial inválida — nunca use; peça ao dono se precisar.
- Projetos de produção real podem ter `Project.protegido = true`; scripts de manutenção em
  `scripts/` exigem `--confirm-protected` para eles. A proteção é **por ID/flag, nunca por título**.

---

## 4. Estrutura do código

```
prisma/schema.prisma, prisma/migrations/, prisma/seed.ts
src/middleware.ts                       proteção de /projects/:path* + auto-login em dev
src/app/(app)/projects/...              telas com sidebar/header
src/app/(set-mode)/projects/[id]/shootdays/[shootDayId]/set   Modo Set (layout próprio, ignora tema de propósito)
src/app/(app)/admin                     lista de usuários (só ADMIN; outros recebem 404)
src/app/api/...                         Route Handlers REST (ver §4.2)
src/lib/                                regra de negócio
src/lib/pdf/                            um documento por arquivo + kit.tsx compartilhado
src/lib/validation/                     schemas zod
src/components/<área>/                  componentes por tela; src/components/ui/ primitivos
scripts/                                verify-*, migrate-producao, recount-*, backfill-*
```

### 4.1 Telas (sidebar em `src/components/layout/sidebar.tsx`)
Visão Geral `/projects/[id]` · Tratamentos `/drafts` · **Cadastro:** `/scenes`
(`/scenes/[sceneId]/breakdown`), `/cast`, `/extras`, `/locacoes` · **Preparação:** `/stripboard`,
`/calendar`, `/dood`, `/documentos` · **Orçamento:** `/budget/{topsheet,detalhado,globals-fringes,cenarios,acompanhamento}`
(`/budget` só redireciona) · Diária: `/shootdays/[id]`, `/ordem-do-dia`, `/hora-a-hora`, Modo Set ·
Também: `/reports`, `/ad-documents` (+ `cast-accounting`, `crew`), `/guia`, `/projects/new`.

### 4.2 API (`src/app/api/projects/[id]/...`)
- CRUD: `scenes` (+ `breakdown`, `shots`, `shots/reorder`, `parts`, `cobertura`, `duracao-alvo`,
  `sinopse-ad`, `continuity-notes`), `scenes/master`, `characters` (+ `reorder`), `extras`,
  `locacoes` (+ `merge`, `move-scenes`, `pontos-apoio`), `crew-members`, `calendar-events`,
  `tasks`, `drafts`, `logo`, `steps/[etapa]/complete`, `guide-status`.
- Diária: `shoot-days` e `shoot-days/[id]/` → `blocos`, `call-times`, `checklist`
  (+ `regenerate`), `hora-a-hora` (+ `reorder`, `regenerate`), `realizado`, `reset-fator`,
  `shot-schedule` (+ `reorder`), `scenes/[sceneId]/status`, `scenes/[sceneId]/observacoes`,
  `daily-progress-report`.
- Agenda: **`stripboard/reorder`** (Stripboard e salvar a OD passam por aqui).
- Import: `import/fdx` (só parse) → `import/fdx/confirm` (grava); `projects/onboarding/parse`.
- Orçamento: `budget/` → `accounts`, `groups`, `line-items`, `globals`, `fringes`, `scenarios`,
  `actuals`, `sync-scheduling`, exports PDF.
- PDFs/planilhas: `reports/*` (callsheet, hhschedule, breakdown, escaleta, cast-schedule,
  plano-diarias, hora-a-hora, shotlist, continuismo, one-line-schedule), `ad-documents/*`,
  `dood/export`, `drafts/[id]/pdf`.
- Usuário: `api/user/theme`, `api/user/tour`; auth em `api/auth/*`.

**Padrão obrigatório em rota de projeto:** `getServerSession(authOptions)` →
`findOwnedProject(projectId, session.user.id, session.user.role)` (`src/lib/project-access.ts`;
ADMIN vê tudo, USER só os seus) → validar corpo com zod → Prisma. 103 de 105 rotas seguem isso;
as exceções legítimas são `api/projects` (lista/cria) e `api/projects/onboarding/parse`.

### 4.3 Bibliotecas-chave (`src/lib/`)
| Arquivo | Papel |
|---|---|
| `fdx-parser.ts`, `pdf-script-parser.ts`, `pdf-script-extract-browser.ts`, `pdf-line-grouping.ts` | import de roteiro; FDX "plano" ou com `<Scene>`, rótulo "CENA N:" seguido do cabeçalho real, inserts absorvidos, períodos PT/EN, `avisos` |
| `character-import.ts`, `character-id.ts` | criação de personagem no import; exibição por `idCurto` ou `numeroElenco` (`Project.sistemaIdElenco`) via `getCharacterId()` |
| `paginas.ts` | oitavos ("1 2/8"), `Decimal(6,3)` no banco |
| `natural-sort.ts` | ordem de número de cena (5, 8, 8PL, 9, 14A) — nunca ordene lexicograficamente |
| `shots-shared.ts` (puro, usável no cliente) / `shots.ts` (servidor) | tempo do plano = takes × duração + reset entre takes + setup; tipos de reset; master/coverage |
| `schedule.ts`, `day-timeline.ts`, `shootday-blocks.ts`, `jornada-diaria.ts`, `time.ts`, `hora-min.ts` | horários da diária (prep, Rod, almoço, blocos), h:mm |
| `estimativa.ts` / `estimativa-server.ts`, `tempo-alvo.ts` | origem do tempo estimado (§5.3) |
| `scene-parts-shared.ts` (puro) / `scene-parts.ts` | divisão de cena (§5.6) |
| `ordem-do-dia.ts`, `hora-a-hora.ts`, `report-data.ts`, `ad-documents-data.ts` | agregação para OD, Hora a Hora e PDFs |
| `realizado.ts`, `scene-progress.ts` | lançamento do realizado e progresso |
| `script-diff.ts`, `revision-colors.ts`, `scheduling-impact.ts`, `draft-report-data.ts` | tratamentos |
| `budget-calc.ts`, `budget-data.ts`, `budget-server.ts`, `budget-templates.ts` | orçamento; cenários calculados em memória |
| `project-access.ts` | controle de acesso |
| `theme.ts`, `use-theme.ts`, `module-theme.ts` | 10 temas por pessoa (`User.tema` + cookie) |

Convenção: arquivos `*-shared.ts` não importam Prisma/Node e podem ir para o cliente; os
equivalentes de servidor reexportam deles. Não importe `@prisma/client` em componente cliente.

### 4.4 Modelos principais
`User` (role USER/ADMIN, tema) · `Project` · `Scene` (`origem`: ROTEIRO | MASTER_MULTICENA;
`omitida`) · `ScenePart` · `SceneCobertura` · `Locacao` + `PontoApoio` · `Shot` + `ShotSchedule` ·
`Character` + `SceneCast` + `CharacterCallTime` · `Extra` + `ExtraScene` · `BreakdownSheet` ·
`ShootDay` + `ShootDayBlock` + `SceneShootDay` + `ShootDayChecklist` + `HoraAHoraEvent` ·
`CalendarEvent` · `ScriptDraft` + `SceneDiff` · `ContinuityNote` · `CrewMember` ·
`DailyProgressReport` · `Task` · `ProjectStepOverride` · Orçamento: `Budget`, `AccountGroup`,
`BudgetAccount`, `LineItem`, `Global`, `Fringe`, `FringeLineItem`, `BudgetScenario`,
`ScenarioGlobalOverride`, `Actual`. Leia o `schema.prisma` — os comentários nele explicam decisões.

---

## 5. Regras de negócio invioláveis

Decididas com o dono, quase todas depois de bugs reais. Não "simplifique" nem pergunte de novo.

1. **Execução ≠ planejamento.** Em `SceneShootDay`, `status`, `horaInicioReal`, `horaFimReal`,
   `observacoes`/`observacoesAutoGeradas` são registro do que aconteceu: nenhuma rota de
   planejamento pode reescrevê-los. Planejamento (`ordem`, `bloco`, `prepMin`, `rodMin`) pode ser
   reescrito. `stripboard/reorder` atualiza **linha a linha** (ordem em duas fases por causa do
   unique `(shootDayId, ordem)`) — nunca apagar e recriar. Só mover a cena para outra diária zera a
   execução, com confirmação na tela. Idem: editar evento do Hora a Hora marca
   `geradoAutomaticamente=false`; "Regenerar" só substitui os automáticos; checklist regenerado só
   acrescenta e preserva `confirmado`. Coberto por `verify:execucao`.
2. **Número do plano é identidade.** `Shot.numero` vai na claquete; `Shot.ordem` é só a ordem de
   filmagem. Não derive número da posição. Plano novo = próximo número livre da cena; virar
   coverage = número do pai + letra (6A, 6B); desvincular = próximo número livre; o número pode
   ser editado à mão e os coverages acompanham o pai. Nada que já existe muda de número sozinho.
   Takes/duração/setup são NOT NULL com default (3 × 2 min + 0) — não existe "plano vazio".
3. **Estimativa com origem visível** (`src/lib/estimativa.ts`, tipo `OrigemTempo`). Todo tempo
   exibido diz de onde veio, nesta precedência: `DIGITADO` > `DURACAO_ALVO` > `PLANOS` > `LEGADO`
   (gravado sem origem) > `MEDIA_PROJETO` (realizado deste projeto, ≥ 2 diárias lançadas) >
   `PARTIDA` (ponto de partida do projeto: `Project.minPorOitavoPartida`, padrão 5 min por oitavo,
   + `acrescimoExteriorPercent` só em cena EXT) > `SEM_BASE` ("sem base pra estimar" é resultado
   legítimo). O rótulo diz "ponto de partida do projeto", não "convenção" — é escolha da produção.
   A partida é calculada na leitura (`tempoDeReferenciaMin`), nunca gravada. O import **não grava
   tempo**; arrastar cena para diária não grava Rod. `SceneShootDay.rodDigitado` protege o Rod
   digitado do recálculo pelos planos (`syncSceneRodMin` pula essas linhas). A antiga classificação
   de cena em 4 tipos foi aposentada — não reintroduza (o tipo que muda tempo é de plano).
4. **Reserva de tempo** (`ShootDay.reservaMin`) só aparece no aviso do modo simplificado e
   **nunca sai em PDF/documento** — `verify:pdf` falha se sair, e há trava estática contra
   `reservaMin` em arquivo de PDF.
5. **Modo simplificado da diária** (`ShootDay.modoPlanejamento`, no banco, por diária — a AD abre
   no iPad): mesmos dados de prep/Rod do detalhado, editados pela mesma rota do Stripboard. Teto =
   `jornadaMin` **ou** `horaFimAlvo` (o PATCH limpa o outro). O teto só **avisa**; nunca
   redistribui nem bloqueia. Rod < 5 min é recusado na tela. OD e PDFs são idênticos nos dois modos.
6. **Divisão de cena** (`ScenePart`): soma dos oitavos das partes = oitavos da cena (a API barra);
   uma parte por diária; tira do Stripboard identificada por `itemId` (parte ?? cena) e reorder
   por tira, nunca por `sceneId`; plano sem parte aparece em todas as partes mas não entra no Rod
   de nenhuma; Rod de parte sem planos é estimado por oitavos e abaixo de 5 min vira "mínimo" com
   rótulo de chute; cena só fica concluída quando todas as partes estão. Coberto por `verify:divisao`.
7. **Master de várias cenas**: cena de produção com `origem = MASTER_MULTICENA`, numerada M1, M2…,
   0 páginas, com um plano master; vínculos informativos em `scene_coberturas` (não alteram as
   cenas cobertas). Fica fora do diff de tratamentos e do import de FDX (senão viraria OMITIDA).
   Uma cena pode ter vários masters. "Plano solto" = plano que não é coverage.
8. **Tratamentos**: cena que some do roteiro novo **não é apagada** — `Scene.omitida = true`
   (OMITTED, padrão WGA). Cenas casam por `numero`. O onboarding cria o Draft 1 (Branco) para a
   primeira reimportação virar Draft 2 (Azul). Cena omitida já agendada continua na diária com
   aviso; o agendamento não muda sozinho.
9. **Boneyard** não é tabela nem status: é toda cena sem `SceneShootDay`.
10. **Valores estimados parecem estimados** (rótulo, asterisco, cinza, "A DEFINIR"). Nunca
    fabrique dado com cara de autoritativo.
11. **Schema rígido**: o dono prefere NOT NULL com default a campos opcionais que geram NaN em soma.
12. Convenções de texto do Breakdown (não são campos): prefixo `"Personagem_descrição"` atribui
    figurino/make/habilidade/etc. a um personagem (casa com `Character.personagem`, não `idCurto`);
    `"[CRÍTICO] "` marca objeto crítico; `/efeito/i` marca make de efeito especial
    (`parsePersonagemPrefixed` em `ordem-do-dia.ts`).
13. `/admin` responde 404 (não 403) a quem não é ADMIN; promover admin é só por SQL manual.

---

## 6. Armadilhas técnicas

- **PDF / Helvetica (react-pdf):** quebram em silêncio `→ ⚠ Δ ≥ ≤ ✓ − (U+2212) ≈`. Seguros:
  `× ± — – … • “ ” ‘ ’ € ° º ª « » ·`. Use `->` e `[!]`. `verify:pdf` testa todo caractere
  não-ASCII do grafo de imports dos PDFs.
- react-pdf: espaço final entre `<Text>` irmãos numa linha flex some → use `marginRight`;
  `alignItems:"center"` no pai zera a largura de `View` divisor sem conteúdo → `width:"100%"`;
  container `wrap={false}` maior que uma página desenha por cima de tudo; `minPresenceAhead` é
  ignorado em nó `fixed`.
- `src/lib/pdf/kit.tsx` é compartilhado por todos os PDFs: mudanças **aditivas** (props opt-in);
  não renomeie nem remova estilos/componentes existentes.
- Para renderizar PDF fora do Next: `tsx --tsconfig scripts/tsconfig.pdf.json` (jsx react-jsx),
  senão "React is not defined".
- Import de PDF de roteiro roda **no navegador** (pdfjs) — no servidor da Vercel quebrava.
  `public/pdfjs/` é gerado no `postinstall` (gitignored).
- Transações Prisma grandes (import, stripboard) já estouraram o timeout padrão: use `timeout`
  maior ou divida; evite N queries sequenciais dentro de `$transaction` interativa.
- Pastas com `_` no App Router não viram rota. Rota apagada deixa referência velha em
  `.next/types` → `rm -rf .next`.
- `public/sw.js` e `workbox-*` são gerados pelo build (gitignored) — não edite.

---

## 7. Como verificar uma mudança

- **Lógica pura:** suíte `verify:*` correspondente + `npx tsc --noEmit` + `npm run lint`.
- **Fluxo que grava (o que a AD usa):** exercite o caminho de gravação — dispare a ação real
  (clique/requisição), confira método e status da request **e o efeito no banco** (`psql`).
  Uma tela que renderiza não prova que salva (já foi para produção quebrado assim).
- **Automação de navegador:** clique sintético às vezes não faz nada (use `element.click()`);
  drag do dnd-kit não funciona por automação (teste chamando a mesma rota com `fetch`); campos que
  salvam no `onBlur` precisam de foco/digitação/Tab reais.
- **PDF/XLSX:** baixe por curl (com cookie do auto-login), olhe a imagem renderizada da página
  (não só o texto) e rode `verify:pdf`.
- Ao estender dados de demo, prefira ampliar o seed (Ressaca/Viageiro) a criar projetos novos.

---

## 8. Convenções de trabalho

- Commits em português: `feat: …`, `fix: …`, `chore: …`, descrevendo o efeito para o usuário
  (ex.: `fix: stripboard deixa soltar cena no fim da diária e salva sem estourar a transação`).
- Comentários no código em português, explicando o **porquê** das decisões (o código existente faz
  isso extensivamente — mantenha o padrão e não apague comentários de decisão).
- Rodadas pequenas e verificadas; uma migration por rodada, com nome descritivo
  (`AAAAMMDDHHMMSS_descricao`).
- Quando a especificação supõe algo sobre os dados ("número = posição", "plano vazio"), confira no
  banco antes de implementar e aponte a divergência.

---

## 9. Estado atual (nov/2026)

- Recentes: número do plano editável à mão; posição de câmera inserida à mão entre planos; tira do
  Stripboard mostra início/fim do Rod; passo "Elenco e equipe" na OD; master de várias cenas;
  plano como Takes × Duração × Reset; tempos em h:mm.
- **Pendente conhecido:** avisar quando o Rod digitado for reescrito pela decupagem ("Rod
  recalculado pelos planos (era 40min)"). Exige campo novo em `SceneShootDay` (hoje só há `rodMin`
  + `rodDigitado`, sem histórico) — propor o schema ao dono antes.
- Banco local tem projetos de teste descartáveis ("Teste…", "Debug…", "Familiar Insônia…") e o
  projeto real *ANTES DO MEU NOME NOS CRÉDITOS*. Projetos como *ECLIPSE* existem só em produção.

### Padronização do nome (14/11/2026)
- Banco local renomeado para `proximoplano`; usuário demo atualizado sem mudar seu ID ou projetos.
- Prefixos antigos de localStorage são lidos somente para preservar preferências existentes.
- Aliases antigos da Vercel foram preservados para não quebrar links; não houve publicação.

### Limpeza de código (14/11/2026)
- TypeScript verifica `noUnusedLocals` e `noUnusedParameters`; parâmetros exigidos pela assinatura mas não lidos usam prefixo `_`.
- Removidos tipo órfão `src/components/reports/types.ts`, imports não utilizados e dependência direta `date-fns`.
- Scripts de manutenção/verificação, fixtures, migrations, assets PWA/PDF e configurações dos provedores continuam necessários. Não confundir ausência de import com arquivo descartável.
- Backup do iniciador anterior arquivado fora do repositório, na pasta `work/arquivo-limpeza` desta avaliação.

### Paginação da Ordem do Dia (14/11/2026)
- As três seções da OD usam fluxo contínuo; não correspondem mais a folhas fixas.
- `CallSheetRow` protege linhas da OD sem modificar o kit compartilhado: o motor do react-pdf
  trata a presença de `fixed` (mesmo indefinido) como exceção à quebra antes de uma linha.
- Hora a Hora quebra entre planos, mantém cabeçalho com o primeiro plano e identifica a cena
  nas continuações. `renderCallSheet` mede o layout e equilibra as duas últimas folhas quando
  a última ocupa menos de 30%, sem reduzir fonte, acrescentar páginas ou dividir linhas.
- Títulos de tabela ficam no mesmo bloco que cabeçalho e primeira linha (`CallSheetSection`).
- `verify:od-pagination` gera dados fictícios em memória a partir do demo local, sem gravar.
- `verify-callsheet-fixtures.tsx entrada.json saida.pdf [original.pdf]` valida reproduções locais:
  compara conteúdo, títulos, colisões e última folha. Não commitar dados reais dessas fixtures.
- O adaptador de medição usa o layout do react-pdf 4; rodar as suítes de PDF ao atualizar a dependência.

### Identidade visual dos temas (14/11/2026)
- Paletas reforçam o gênero na página, superfície e moldura opaca (`theme-chrome`).
- Miniaturas do seletor usam `data-theme` e os próprios tokens; não duplicar paletas em TS.
- Famílias funcionais preservadas, inclusive no Histórico (azul-ardósia para planejamento).
- `verify:themes` verifica 70 tokens por tema, 740 pares de contraste (inclui composição do
  vidro), famílias funcionais e accents distintos. Não certifica a acessibilidade do app inteiro.
- Modo Set continua fixado em Documentário, PDFs e cores de revisão/identidade de cena ficam fora.

### Acabamentos dos gêneros (local, 14/11/2026)
- Texturas estáticas em `theme-chrome`; sombras e raios em `theme-panel` (Card e containers glass).
- Não aplicar estes acabamentos às tiras, células ou linhas de trabalho. Não há novos filtros,
  timers ou animações contínuas. `theme-choice` respeita prefers-reduced-motion.
- `--chrome-light-max` é um limite conservador de luz para verificar o texto sobre a decoração;
  a faixa do Thriller fica nos 4px superiores, fora do texto.
