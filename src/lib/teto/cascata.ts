import { aplicar, bpsDe, confere, contribuicao } from './aliquotas';
import type { BasesDaCompetencia, FonteContribuinte, FonteRemunerada } from './competencias';
import type { AvisoTeto, Camada, TabelaVigencia } from './types';

export type ResultadoCascata = {
  somaBaseCentavos: number;
  retidoCentavos: number;
  devidoCentavos: number;
  retidoAMaiorCentavos: number;
  /** A `margem2` da §6.1: o que sobrou do teto depois do CLT e do prestador. */
  margemFinalCentavos: number;
  camadas: Camada[];
  avisos: AvisoTeto[];
};

/** 11% retidos na fonte pelo tomador do serviço. */
const BPS_PRESTADOR = 1100;

const somaDe = (fontes: FonteRemunerada[]): number => fontes.reduce((t, f) => t + f.baseCentavos, 0);

/**
 * A alíquota que os indicadores do CNIS prometem para o recolhimento próprio.
 *
 * Serve de **conferência**, não de fonte da verdade: a taxa efetiva sai da divisão das duas
 * cifras do extrato. Era o problema de inferir alíquota por indicador, e a §2.3 o dissolve.
 */
function bpsPrometido(indicadores: string[]): number {
  if (indicadores.includes('IREC-MEI')) return 500;
  if (indicadores.includes('IREC-LC123')) return 1100;
  return 2000;
}

/**
 * A cascata de uma competência, com a tabela da vigência.
 *
 * A ordem é **legal**, não arbitrária: o empregado contribui primeiro, o contribuinte
 * individual declara sobre o que sobrar até o teto (§6.1). Quando o CLT sozinho está abaixo
 * do teto e o CI empurra para cima, o excesso é todo da camada do CI.
 *
 * O `min(base_i, teto)` **por fonte** é obrigatório nas três camadas: sem ele, um professor
 * com um só vínculo acima do teto apareceria com retenção a maior, quando a fonte descontou
 * corretamente. (A §6.1 da spec omite o `min` na camada do prestador; é omissão, e corrigida
 * aqui — ver o teste "vínculo de prestador único acima do teto também dá zero".)
 */
export function rodarCascata(bases: BasesDaCompetencia, tabela: TabelaVigencia): ResultadoCascata {
  const teto = tabela.tetoCentavos;
  const avisos: AvisoTeto[] = [];
  const camadas: Camada[] = [];
  let retidoAMaior = 0;

  /** Soma a camada ao total, com `max(0, …)` por camada: uma camada não compensa a outra. */
  const registrar = (camada: Camada, contaNoTotal = true): void => {
    camadas.push(camada);
    if (contaNoTotal) retidoAMaior += Math.max(0, camada.retidoCentavos - camada.devidoCentavos);
  };

  // 1. CLT — a tabela progressiva inteira, por fonte, porque cada empregador aplica a sua.
  const somaClt = somaDe(bases.clt);
  if (bases.clt.length > 0) {
    registrar({
      natureza: 'CLT',
      baseCentavos: somaClt,
      retidoCentavos: bases.clt.reduce((t, f) => t + contribuicao(Math.min(f.baseCentavos, teto), tabela), 0),
      devidoCentavos: contribuicao(Math.min(somaClt, teto), tabela),
      lido: false,
    });
  }
  const margem1 = Math.max(0, teto - Math.min(somaClt, teto));

  // 2. CI prestador de serviço — o tomador retém 11% sobre a sua própria remuneração.
  const somaPrestador = somaDe(bases.prestador);
  if (bases.prestador.length > 0) {
    registrar({
      natureza: 'CI_PRESTADOR',
      baseCentavos: somaPrestador,
      retidoCentavos: bases.prestador.reduce((t, f) => t + aplicar(Math.min(f.baseCentavos, teto), BPS_PRESTADOR), 0),
      devidoCentavos: aplicar(Math.min(somaPrestador, margem1), BPS_PRESTADOR),
      lido: false,
    });
  }
  const margemFinal = Math.max(0, margem1 - Math.min(somaPrestador, margem1));

  // 3. CI recolhimento próprio — o valor pago está escrito no extrato. Leitura, não estimativa.
  if (bases.proprio.length > 0) {
    const somaProprio = bases.proprio.reduce((t: number, f: FonteContribuinte) => t + f.salarioContribuicaoCentavos, 0);
    const pago = bases.proprio.reduce((t: number, f: FonteContribuinte) => t + f.contribuicaoCentavos, 0);
    const indicadores = bases.proprio.flatMap((f) => f.indicadores);

    if (somaProprio <= 0) {
      // Sem salário de contribuição não há como dizer quanto era devido. Falhar aberto: a
      // camada aparece, o aviso explica, e ela NÃO entra no total — afirmar que os centavos
      // pagos são todos indevidos seria inventar crédito a partir de um dado que falta.
      avisos.push({
        codigo: 'BASE_AUSENTE',
        competencia: bases.competencia,
        detalhe: `recolhimento próprio com contribuição de ${pago} centavos e salário de contribuição ausente ou zero: a camada não entra no total`,
      });
      registrar(
        { natureza: 'CI_PROPRIO', baseCentavos: somaProprio, retidoCentavos: pago, devidoCentavos: 0, lido: true },
        false,
      );
    } else {
      const bpsEfetivo = bpsDe(pago, somaProprio);
      const esperado = bpsPrometido(indicadores);
      if (!confere(pago, somaProprio, esperado)) {
        avisos.push({
          codigo: 'ALIQUOTA_DIVERGENTE',
          competencia: bases.competencia,
          detalhe: `recolhimento próprio: o par de cifras dá ${bpsEfetivo} pontos-base, os indicadores [${indicadores.join(', ') || 'nenhum'}] prometem ${esperado}. A linha pode não ter sido entendida`,
        });
      }
      registrar({
        natureza: 'CI_PROPRIO',
        baseCentavos: somaProprio,
        retidoCentavos: pago,
        devidoCentavos: aplicar(Math.min(somaProprio, margemFinal), bpsEfetivo),
        lido: true,
      });
    }
  }

  return {
    somaBaseCentavos: camadas.reduce((t, c) => t + c.baseCentavos, 0),
    retidoCentavos: camadas.reduce((t, c) => t + c.retidoCentavos, 0),
    devidoCentavos: camadas.reduce((t, c) => t + c.devidoCentavos, 0),
    retidoAMaiorCentavos: retidoAMaior,
    margemFinalCentavos: margemFinal,
    camadas,
    avisos,
  };
}
