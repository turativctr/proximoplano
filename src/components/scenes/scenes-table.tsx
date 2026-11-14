"use client";

import { ClipboardList, Layers, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { MasterMulticenaDialog, type CenaCobrivel } from "@/components/scenes/master-multicena-dialog";
import { SceneFormDialog } from "@/components/scenes/scene-form-dialog";
import type { PartidaDoProjeto } from "@/lib/estimativa";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { TermTooltip } from "@/components/shared/term-tooltip";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatHoraMin } from "@/lib/hora-min";
import { formatPaginas } from "@/lib/paginas";
import { cn } from "@/lib/utils";

type CharacterOption = {
  id: string;
  idCurto: string;
  numeroElenco: number | null;
  personagem: string;
};

type SceneRow = {
  id: string;
  numero: string;
  tipo: "INT" | "EXT" | null;
  // Texto livre, exibido tal qual — já é português legível (ver comentário em
  // FdxScene.periodo, src/lib/fdx-parser.ts), diferente do antigo enum que precisava de tradução.
  periodo: string | null;
  set: string | null;
  locacao: { id: string; nome: string } | null;
  sinopse: string | null;
  paginas: unknown;
  diaNarrativo: number | null;
  duracaoAlvoMin: number | null;
  /** Soma dos planos (com resets), pra coluna de gravação quando a AD não definiu tempo. */
  somaPlanosMin: number | null;
  notasAD: string | null;
  omitida: boolean;
  origem: "ROTEIRO" | "MASTER_MULTICENA";
  /** Master de várias cenas: as cenas do roteiro que ele cobre, em ordem. */
  cobre: { id: string; numero: string }[];
  cast: { characterId: string }[];
};

export function ScenesTable({
  projectId,
  scenes,
  characters,
  sistemaIdElenco,
  locacoes,
  partida,
  cenasCobriveis,
}: {
  projectId: string;
  scenes: SceneRow[];
  characters: CharacterOption[];
  sistemaIdElenco: "ID_CURTO" | "NUMERACAO";
  locacoes: { id: string; nome: string }[];
  /** Ponto de partida da produção, repassado ao formulário de edição da cena. */
  partida: PartidaDoProjeto;
  /** Cenas ativas do roteiro, pro diálogo de cenas cobertas de um master. */
  cenasCobriveis: CenaCobrivel[];
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
  const visiveis = scenes.filter((scene) => {
    const texto = normalizar([scene.numero, scene.tipo, scene.periodo, scene.set, scene.locacao?.nome, scene.sinopse,
      ...characters.filter((c) => scene.cast.some((v) => v.characterId === c.id)).map((c) => c.personagem)].join(" "));
    return termos.every((termo) => texto.includes(termo));
  });

  async function handleDelete(sceneId: string) {
    await fetch(`/api/projects/${projectId}/scenes/${sceneId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="buscar-cenas">Buscar cenas</Label>
          <Input id="buscar-cenas" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número, set, locação, sinopse ou personagem" />
        </div>
        {busca && <Button variant="outline" onClick={() => setBusca("")}>Limpar busca</Button>}
        <p role="status" className="py-2 text-sm text-muted-foreground">{visiveis.length} de {scenes.length} cenas</p>
      </div>
    <Table containerClassName="max-h-[65dvh] rounded-md border">

      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow>
          <TableHead>Cena</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Período</TableHead>
          <TableHead>Set</TableHead>
          <TableHead>Locação</TableHead>
          <TableHead>Sinopse</TableHead>
          <TableHead>
            <span className="inline-flex items-center gap-1">
              Páginas
              <TermTooltip content="1 página = 8 oitavas. Usado para estimar o tempo de filmagem de cada cena." />
            </span>
          </TableHead>
          <TableHead>Dia narr.</TableHead>
          <TableHead>
            Gravação{" "}
            <TermTooltip content="Tempo estimado para gravação: o que você definiu, ou a soma dos planos da cena. Edite no card Planos do breakdown ou no formulário da cena." />
          </TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visiveis.map((scene) => (
          <TableRow key={scene.id} className={cn(scene.omitida && "text-muted-foreground")}>
            <TableCell className="font-medium">
              <span className={cn(scene.omitida && "line-through")}>{scene.numero}</span>
              {scene.omitida && (
                <span className="ml-1.5 rounded border border-destructive/40 bg-destructive/10 px-1 py-0.5 text-[10px] font-semibold text-destructive">
                  OMITIDA
                </span>
              )}
              {scene.origem === "MASTER_MULTICENA" && (
                <>
                  <span className="ml-1.5 rounded border border-scheduling-fg/40 bg-scheduling-bg px-1 py-0.5 text-[10px] font-semibold text-scheduling-fg">
                    MASTER
                  </span>
                  <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                    cobre {scene.cobre.length > 0 ? scene.cobre.map((c) => c.numero).join(", ") : "nenhuma cena"}
                  </p>
                </>
              )}
            </TableCell>
            <TableCell>{scene.tipo ?? "—"}</TableCell>
            <TableCell>{scene.periodo ?? "—"}</TableCell>
            <TableCell>{scene.set ?? "—"}</TableCell>
            <TableCell>{scene.locacao?.nome ?? "—"}</TableCell>
            <TableCell className="max-w-[220px] truncate" title={scene.sinopse ?? undefined}>
              {scene.sinopse ?? "—"}
            </TableCell>
            <TableCell>{formatPaginas(scene.paginas)}</TableCell>
            <TableCell>{scene.diaNarrativo ?? "—"}</TableCell>
            <TableCell>
              {scene.duracaoAlvoMin != null ? (
                `${formatHoraMin(scene.duracaoAlvoMin)} (você definiu)`
              ) : scene.somaPlanosMin ? (
                `${formatHoraMin(scene.somaPlanosMin)} (soma dos planos)`
              ) : (
                <span className="text-muted-foreground">sem base pra estimar</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" asChild title="Breakdown da cena" aria-label={`Abrir breakdown da cena ${scene.numero}`}>
                  <Link href={`/projects/${projectId}/scenes/${scene.id}/breakdown`}>
                    <ClipboardList className="h-4 w-4" />
                  </Link>
                </Button>
                {scene.origem === "MASTER_MULTICENA" && (
                  <MasterMulticenaDialog
                    projectId={projectId}
                    cenas={cenasCobriveis}
                    master={{ id: scene.id, numero: scene.numero, cobreIds: scene.cobre.map((c) => c.id) }}
                    trigger={
                      <Button variant="ghost" size="icon" title="Cenas cobertas" aria-label={`Editar cenas cobertas por ${scene.numero}`}>
                        <Layers className="h-4 w-4" />
                      </Button>
                    }
                  />
                )}
                <SceneFormDialog
                  projectId={projectId}
                  characters={characters}
                  sistemaIdElenco={sistemaIdElenco}
                  locacoes={locacoes}
                  partida={partida}
                  scene={scene}
                  trigger={
                    <Button variant="ghost" size="icon" title="Editar cena" aria-label={`Editar cena ${scene.numero}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  }
                />
                <ConfirmDeleteDialog
                  title={`Excluir cena ${scene.numero}?`}
                  description="Essa ação remove a cena e todos os dados de breakdown associados. Não pode ser desfeita."
                  onConfirm={() => handleDelete(scene.id)}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      {visiveis.length === 0 && <TableRow><TableCell colSpan={10} className="py-8 text-center">Nenhuma cena encontrada. Tente outro termo ou limpe a busca.</TableCell></TableRow>}
      </TableBody>
    </Table>
    </div>
  );
}
