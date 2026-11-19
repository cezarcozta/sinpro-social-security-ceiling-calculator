import type { CnisExtrato } from '../cnis/types';
import { rodarCascata } from './cascata';
import { agruparPorCompetencia } from './competencias';
import { prescricaoDe } from './prescricao';
import { tabelaDe } from './tabelas';
import type { AvisoTeto, ResultadoCompetencia, ResultadoTeto } from './types';

/**
 * Triagem completa: diz ao professor **se** contribuiu acima do teto em cada mês e
 * **quanto** — em base excedente (exata) e em dinheiro retido a maior (estimado).
 *
 * `dataReferencia` (`AAAA-MM-DD`) é **injetada**, nunca `new Date()`: a elegibilidade de
 * cada mês depende dela e o teste tem que ser determinístico.
 *
 * O recorte não é "últimos 5 anos civis": a prescrição corre por pagamento, então o motor
 * calcula toda competência que tenha tabela e marca cada uma com `noPrazo` (§2.2).
 * Agrupar por ano é apresentação — a F3 deriva, o motor não emite `porAno`.
 */
export function calcularTeto(extrato: CnisExtrato, dataReferencia: string): ResultadoTeto {
  const { competencias: grupos, avisos: avisosDoAgrupamento } = agruparPorCompetencia(extrato);

  const competencias: ResultadoCompetencia[] = [];
  const ignoradasSemTabela: string[] = [];
  const avisos: AvisoTeto[] = [...avisosDoAgrupamento];
  const competenciasDoMei: string[] = [];
  let meiDasIndevidoCentavos = 0;

  for (const bases of grupos) {
    const tabela = tabelaDe(bases.competencia);
    if (!tabela) {
      // Fora do período coberto. Não é erro: a F3 lista, não silencia.
      ignoradasSemTabela.push(bases.competencia);
      continue;
    }

    const cascata = rodarCascata(bases, tabela);
    avisos.push(...cascata.avisos);

    if (cascata.meiDasIndevidoCentavos > 0) {
      competenciasDoMei.push(bases.competencia);
      meiDasIndevidoCentavos += cascata.meiDasIndevidoCentavos;
    }

    const prescricao = prescricaoDe(bases.competencia, dataReferencia);
    if (!prescricao) {
      // `tabelaDe` já aceitou a competência, então isto é inalcançável pelos dois usarem o
      // mesmo formato. Falhar aberto em vez de confiar na coincidência.
      avisos.push({
        codigo: 'PRESCRICAO_INDETERMINADA',
        competencia: bases.competencia,
        detalhe: 'não foi possível calcular o prazo desta competência; ela não entra em nenhum total',
      });
      continue;
    }

    const fontes = bases.clt.length + bases.prestador.length + bases.proprio.length;

    competencias.push({
      competencia: bases.competencia,
      decimoTerceiro: bases.decimoTerceiro,
      tetoCentavos: tabela.tetoCentavos,
      somaBaseCentavos: cascata.somaBaseCentavos,
      excedeuTeto: cascata.somaBaseCentavos > tabela.tetoCentavos,
      baseExcedenteCentavos: Math.max(0, cascata.somaBaseCentavos - tabela.tetoCentavos),
      retidoCentavos: cascata.retidoCentavos,
      devidoCentavos: cascata.devidoCentavos,
      retidoAMaiorCentavos: cascata.retidoAMaiorCentavos,
      camadas: cascata.camadas,
      multiplosVinculos: fontes > 1,
      prescricao,
    });
  }

  // Os dois contadores contam COMPETÊNCIAS DISTINTAS, não registros: com dois vínculos no
  // mesmo mês, somar registros daria um número maior que a quantidade de meses.
  const resumo = {
    mesesComMultiplosVinculos: competencias.filter((c) => c.multiplosVinculos).length,
    mesesAcimaDoTeto: competencias.filter((c) => c.excedeuTeto).length,
    totalAPedirCentavos: competencias
      .filter((c) => c.prescricao.noPrazo)
      .reduce((t, c) => t + c.retidoAMaiorCentavos, 0),
    totalPrescritoCentavos: competencias
      .filter((c) => !c.prescricao.noPrazo)
      .reduce((t, c) => t + c.retidoAMaiorCentavos, 0),
  };

  const achados: ResultadoTeto['achados'] =
    competenciasDoMei.length > 0
      ? [{ tipo: 'MEI_DAS_INDEVIDO', competencias: competenciasDoMei, valorCentavos: meiDasIndevidoCentavos }]
      : [];

  return { dataReferencia, competencias, ignoradasSemTabela, achados, avisos, resumo };
}
