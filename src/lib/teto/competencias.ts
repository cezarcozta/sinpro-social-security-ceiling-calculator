import type { CnisExtrato } from '../cnis/types';
import type { AvisoTeto } from './types';

/** Uma fonte pagadora que informa só a remuneração: o desconto tem que ser estimado. */
export type FonteRemunerada = {
  seq: number;
  codigoEmp?: string;
  baseCentavos: number;
  indicadores: string[];
};

/**
 * Uma fonte de recolhimento próprio: informa o salário de contribuição **e** o valor
 * efetivamente pago. O pago é leitura, não estimativa — é a assimetria central do desenho
 * (§2.3 da spec).
 */
export type FonteContribuinte = {
  seq: number;
  codigoEmp?: string;
  salarioContribuicaoCentavos: number;
  contribuicaoCentavos: number;
  indicadores: string[];
};

export type BasesDaCompetencia = {
  competencia: string;
  decimoTerceiro: boolean;
  clt: FonteRemunerada[];
  prestador: FonteRemunerada[];
  proprio: FonteContribuinte[];
};

const COMPETENCIA = /^(0[1-9]|1[0-3])\/(\d{4})$/;

/** `"13/2023"` → `"2023-13"`: ordena crescente e põe o 13º logo depois de dezembro. */
const chaveDeOrdem = (mm: string, ano: string): string => `${ano}-${mm}`;

/**
 * Agrupa as remunerações e contribuições do extrato por competência, mantendo as três
 * naturezas separadas — a cascata do §6.1 precisa delas em camadas, não somadas.
 *
 * **Competência duplicada** é decidida por natureza, resolvendo a pendência que a F1.5
 * deixou para a F2. O parser entrega os dois registros de propósito (ver `cnis/types.ts`),
 * porque descartar perderia dinheiro quando a repetição é legítima:
 *
 * - `CLT` e `CI_PRESTADOR`, no mesmo vínculo: artefato de leitura do PDF. Fica a primeira
 *   e sai `DUPLICADA_DESCARTADA`. Somar dobraria a base do mês e **inventaria crédito** —
 *   o erro mais caro que este produto pode cometer.
 * - `CI_PROPRIO`: somam. Duas guias no mesmo mês somam de verdade.
 *
 * Competência igual em vínculos **diferentes** é sempre fonte distinta: é o caso central
 * do produto, não duplicata.
 */
export function agruparPorCompetencia(extrato: CnisExtrato): {
  competencias: BasesDaCompetencia[];
  avisos: AvisoTeto[];
} {
  const avisos: AvisoTeto[] = [];
  const porChave = new Map<string, { ordem: string; bases: BasesDaCompetencia }>();

  const grupoDe = (competencia: string, mm: string, ano: string): BasesDaCompetencia => {
    const existente = porChave.get(competencia);
    if (existente) return existente.bases;
    const bases: BasesDaCompetencia = {
      competencia,
      decimoTerceiro: mm === '13',
      clt: [],
      prestador: [],
      proprio: [],
    };
    porChave.set(competencia, { ordem: chaveDeOrdem(mm, ano), bases });
    return bases;
  };

  for (const vinculo of extrato.vinculos) {
    // Dentro de um vínculo remunerado, a mesma competência não pode entrar duas vezes.
    const jaVistas = new Map<string, number>();

    switch (vinculo.natureza) {
      case 'CLT':
      case 'CI_PRESTADOR': {
        for (const r of vinculo.remuneracoes) {
          const casou = COMPETENCIA.exec(r.competencia);
          if (!casou) {
            avisos.push({
              codigo: 'COMPETENCIA_INVALIDA',
              competencia: r.competencia,
              detalhe: `vínculo ${vinculo.seq}: competência não reconhecida, remuneração de ${r.valorCentavos} centavos não entrou no cálculo`,
            });
            continue;
          }
          const anterior = jaVistas.get(r.competencia);
          if (anterior !== undefined) {
            avisos.push({
              codigo: 'DUPLICADA_DESCARTADA',
              competencia: r.competencia,
              detalhe: `vínculo ${vinculo.seq}: a competência aparece mais de uma vez na mesma tabela (${anterior} e ${r.valorCentavos} centavos). Ficou a primeira; somar as duas dobraria a base do mês`,
            });
            continue;
          }
          jaVistas.set(r.competencia, r.valorCentavos);
          const bases = grupoDe(r.competencia, casou[1], casou[2]);
          const fonte: FonteRemunerada = {
            seq: vinculo.seq,
            codigoEmp: vinculo.codigoEmp,
            baseCentavos: r.valorCentavos,
            indicadores: r.indicadores,
          };
          if (vinculo.natureza === 'CLT') bases.clt.push(fonte);
          else bases.prestador.push(fonte);
        }
        break;
      }
      case 'CI_PROPRIO': {
        for (const c of vinculo.contribuicoes) {
          const casou = COMPETENCIA.exec(c.competencia);
          if (!casou) {
            avisos.push({
              codigo: 'COMPETENCIA_INVALIDA',
              competencia: c.competencia,
              detalhe: `vínculo ${vinculo.seq}: competência não reconhecida, contribuição de ${c.contribuicaoCentavos} centavos não entrou no cálculo`,
            });
            continue;
          }
          grupoDe(c.competencia, casou[1], casou[2]).proprio.push({
            seq: vinculo.seq,
            codigoEmp: vinculo.codigoEmp,
            salarioContribuicaoCentavos: c.salarioContribuicaoCentavos,
            contribuicaoCentavos: c.contribuicaoCentavos,
            indicadores: c.indicadores,
          });
        }
        break;
      }
    }
  }

  const competencias = [...porChave.values()]
    .sort((a, b) => (a.ordem < b.ordem ? -1 : a.ordem > b.ordem ? 1 : 0))
    .map(({ bases }) => bases);

  return { competencias, avisos };
}
