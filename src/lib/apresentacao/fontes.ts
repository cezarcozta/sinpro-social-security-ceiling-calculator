import type { CnisExtrato, NaturezaVinculo } from '@/lib/cnis';

/**
 * Quem pagou o quê, mês a mês — o dado que a conferência precisa e que a saída do motor
 * **não** tem.
 *
 * `ResultadoCompetencia.camadas` agrupa por natureza (todo o CLT somado, todo o prestador
 * somado), porque é assim que a cascata do teto funciona. Para conferir contra o PDF, o
 * professor precisa de outra coisa: uma linha por empregador, com o valor daquele
 * empregador. Isso só existe no `CnisExtrato`, então a tela deriva aqui.
 *
 * As duas regras de duplicata são **as mesmas do motor** (`teto/competencias.ts`), de
 * propósito: se a tela somasse o que o motor descartou, a soma das linhas não fecharia com
 * a base do mês e o professor veria dois números diferentes para a mesma coisa. Um teste
 * fixa essa igualdade em toda competência da fixture.
 */

export type FontePagadora = {
  /** Código do empregador como o CNIS escreve (CNPJ, CEI ou CNO), ou `vínculo N`. */
  rotulo: string;
  natureza: NaturezaVinculo;
  valorCentavos: number;
  /** `true` = valor escrito no extrato; `false` = remuneração, com desconto estimado. */
  lido: boolean;
};

export function fontesPorCompetencia(extrato: CnisExtrato): Map<string, FontePagadora[]> {
  const porCompetencia = new Map<string, FontePagadora[]>();

  const acrescentar = (competencia: string, fonte: FontePagadora) => {
    const lista = porCompetencia.get(competencia);
    if (lista) lista.push(fonte);
    else porCompetencia.set(competencia, [fonte]);
  };

  for (const vinculo of extrato.vinculos) {
    const rotulo = vinculo.codigoEmp ?? `vínculo ${vinculo.seq}`;

    if (vinculo.natureza === 'CI_PROPRIO') {
      // Recolhimento próprio: duas guias no mesmo mês somam de verdade.
      const soma = new Map<string, number>();
      for (const c of vinculo.contribuicoes) {
        soma.set(c.competencia, (soma.get(c.competencia) ?? 0) + c.salarioContribuicaoCentavos);
      }
      for (const [competencia, valorCentavos] of soma) {
        acrescentar(competencia, { rotulo, natureza: 'CI_PROPRIO', valorCentavos, lido: true });
      }
      continue;
    }

    // Salário: competência repetida na mesma tabela é artefato de leitura — fica a primeira.
    const vistas = new Set<string>();
    for (const r of vinculo.remuneracoes) {
      if (vistas.has(r.competencia)) continue;
      vistas.add(r.competencia);
      acrescentar(r.competencia, {
        rotulo,
        natureza: vinculo.natureza,
        valorCentavos: r.valorCentavos,
        lido: false,
      });
    }
  }

  return porCompetencia;
}
