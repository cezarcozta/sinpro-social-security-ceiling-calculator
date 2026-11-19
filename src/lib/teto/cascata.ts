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
  /**
   * A parcela de INSS do DAS do MEI que é integralmente indevida nesta competência (§6.5),
   * já excluída de `retidoAMaiorCentavos`. Zero quando não se aplica.
   */
  meiDasIndevidoCentavos: number;
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
  let meiDasIndevido = 0;

  /** Soma a camada ao total, com `max(0, …)` por camada: uma camada não compensa a outra. */
  const registrar = (camada: Camada): void => {
    camadas.push(camada);
    retidoAMaior += Math.max(0, camada.retidoCentavos - camada.devidoCentavos);
  };

  const ehMei = (fonte: FonteContribuinte): boolean => fonte.indicadores.includes('IREC-MEI');

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
  //
  // Linha a linha, e NÃO na soma das linhas: cada guia tem a sua alíquota e o seu salário
  // de contribuição. Somar as duas cifras antes de dividir produz uma taxa efetiva que
  // ninguém pagou (5% com 11% dá 7,6%), um aviso de divergência falso, e — no caso do MEI —
  // um achado inflado pelo valor das outras linhas. O argumento da §2.3 ("a taxa efetiva
  // sai da própria divisão") só vale por fonte.
  if (bases.proprio.length > 0) {
    // O MEI vai ao fim da fila de propósito: ele quase não move a travessia do teto (§2.4),
    // então é ele quem fica sem margem quando o resto já bateu o teto — que é exatamente a
    // condição do achado da §6.5. Dar a margem ao MEI primeiro tiraria do total geral um
    // recolhimento comum que se pede por outro rito.
    const emOrdem = [...bases.proprio.filter((f) => !ehMei(f)), ...bases.proprio.filter(ehMei)];
    let margem = margemFinal;
    let baseDaCamada = 0;
    let retidoDaCamada = 0;
    let devidoDaCamada = 0;
    let somaNoTotal = 0;

    for (const fonte of emOrdem) {
      baseDaCamada += fonte.salarioContribuicaoCentavos;
      retidoDaCamada += fonte.contribuicaoCentavos;

      if (fonte.salarioContribuicaoCentavos <= 0) {
        // Sem salário de contribuição não há como dizer quanto era devido NESTA linha.
        // Falhar aberto: a linha aparece no retido da camada, o aviso explica, e ela não
        // entra no total — afirmar que os centavos pagos são todos indevidos seria inventar
        // crédito a partir de um dado que falta.
        avisos.push({
          codigo: 'BASE_AUSENTE',
          competencia: bases.competencia,
          detalhe: `vínculo ${fonte.seq}: contribuição de ${fonte.contribuicaoCentavos} centavos com salário de contribuição ausente ou zero; a linha não entra no total`,
        });
        continue;
      }

      const bpsEfetivo = bpsDe(fonte.contribuicaoCentavos, fonte.salarioContribuicaoCentavos);
      const esperado = bpsPrometido(fonte.indicadores);
      if (!confere(fonte.contribuicaoCentavos, fonte.salarioContribuicaoCentavos, esperado)) {
        avisos.push({
          codigo: 'ALIQUOTA_DIVERGENTE',
          competencia: bases.competencia,
          detalhe: `vínculo ${fonte.seq}: o par de cifras dá ${bpsEfetivo} pontos-base, os indicadores [${fonte.indicadores.join(', ') || 'nenhum'}] prometem ${esperado}. A linha pode não ter sido entendida`,
        });
      }

      const cabe = Math.min(fonte.salarioContribuicaoCentavos, margem);
      const devidoDaFonte = aplicar(cabe, bpsEfetivo);
      margem -= cabe;
      devidoDaCamada += devidoDaFonte;

      if (ehMei(fonte) && cabe === 0) {
        // O MEI recolhe 5% do salário mínimo via DAS, e essa contribuição só integra o
        // salário de contribuição se complementada em +15% — ou seja, quase não move a
        // travessia do teto. Mas se o teto já está batido, a parcela de INSS do DAS é
        // integralmente indevida, e o caminho de restituição é OUTRO: Anexo I da IN RFB
        // 2.055/2021, em processo no e-CAC, não PER/DCOMP Web. Por isso sai do total geral
        // e vira achado: somar os dois num número só mandaria o professor pedir pelo rito
        // errado — ou pedir duas vezes.
        meiDasIndevido += fonte.contribuicaoCentavos;
      } else {
        somaNoTotal += Math.max(0, fonte.contribuicaoCentavos - devidoDaFonte);
      }
    }

    camadas.push({
      natureza: 'CI_PROPRIO',
      baseCentavos: baseDaCamada,
      retidoCentavos: retidoDaCamada,
      devidoCentavos: devidoDaCamada,
      lido: true,
    });
    retidoAMaior += somaNoTotal;
  }

  return {
    somaBaseCentavos: camadas.reduce((t, c) => t + c.baseCentavos, 0),
    retidoCentavos: camadas.reduce((t, c) => t + c.retidoCentavos, 0),
    devidoCentavos: camadas.reduce((t, c) => t + c.devidoCentavos, 0),
    retidoAMaiorCentavos: retidoAMaior,
    margemFinalCentavos: margemFinal,
    meiDasIndevidoCentavos: meiDasIndevido,
    camadas,
    avisos,
  };
}
