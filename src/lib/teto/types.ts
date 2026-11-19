import type { NaturezaVinculo } from '../cnis/types';

/**
 * Tipos do motor de cálculo de teto (F2).
 *
 * Regra que vale para todo este módulo: dinheiro é **centavos inteiros** e alíquota é
 * **pontos-base inteiros** (750 = 7,5%). Nenhum campo em reais; formatar é da F3.
 */

/** Uma faixa da tabela progressiva: `[topo acumulado em centavos, alíquota em bps]`. */
export type Faixa = readonly [topoCentavos: number, bps: number];

/**
 * Uma vigência da tabela de contribuição. `vigencia` é a competência em que passou a
 * valer, no formato `AAAA-MM`, porque a tabela muda no meio do ano (2023 mudou em maio).
 *
 * Os topos são **acumulados**, como as portarias publicam: a faixa `[266668, 900]` de
 * 2024 significa "de 1.412,01 até 2.666,68, a 9%", não "2.666,68 de largura".
 */
export type TabelaVigencia = {
  readonly vigencia: string;
  readonly tetoCentavos: number;
  readonly faixas: readonly Faixa[];
};

/**
 * Código de aviso que o motor emite. União, e não `string`, para que a F3 possa ter um
 * dicionário exaustivo de frases em português: um código novo aqui deixa de compilar lá
 * até receber texto, em vez de chegar ao professor como sigla.
 */
export type CodigoAvisoTeto =
  /** Competência repetida na mesma tabela CLT ou de prestador: ficou a primeira. */
  | 'DUPLICADA_DESCARTADA'
  /** Competência que não casa com `MM/AAAA`: ficou fora do cálculo. */
  | 'COMPETENCIA_INVALIDA'
  /** A alíquota efetiva do recolhimento próprio não bate com o que os indicadores prometem. */
  | 'ALIQUOTA_DIVERGENTE'
  /** Contribuição sem salário de contribuição: a camada não entra no total. */
  | 'BASE_AUSENTE'
  /** Competência cuja data de prescrição não pôde ser determinada. */
  | 'PRESCRICAO_INDETERMINADA';

/**
 * Aviso do motor. Nunca silêncio: linha que não entendemos, dado descartado ou base
 * ausente sai aqui, e a F3 exibe (regra "falhar aberto", §9 da spec).
 */
export type AvisoTeto = { codigo: CodigoAvisoTeto; competencia: string; detalhe: string };

/**
 * Elegibilidade da competência. `diasRestantes` fica negativo depois de prescrever, e
 * `urgente` (≤ 90 dias) é o que transforma a triagem em ação.
 */
export type Prescricao = {
  prescreveEm: string;
  noPrazo: boolean;
  diasRestantes: number;
  urgente: boolean;
};

/**
 * Uma camada da cascata. `lido` é a assimetria da §2.3 ficando visível: `true` = valor
 * escrito no extrato (recolhimento próprio), `false` = desconto simulado pela tabela
 * progressiva (CLT e prestador, onde o CNIS só informa a remuneração). A F3 usa isso para
 * rotular confiança — nunca um número sozinho.
 */
export type Camada = {
  natureza: NaturezaVinculo;
  baseCentavos: number;
  retidoCentavos: number;
  devidoCentavos: number;
  lido: boolean;
};

/** Achado de caminho próprio: não entra no total geral porque não se pede pelo mesmo rito. */
export type AchadoTeto = {
  tipo: 'MEI_DAS_INDEVIDO';
  competencias: string[];
  valorCentavos: number;
};

export type ResultadoCompetencia = {
  /** `"08/2024"` ou `"13/2024"`. */
  competencia: string;
  decimoTerceiro: boolean;
  tetoCentavos: number;
  somaBaseCentavos: number;
  excedeuTeto: boolean;
  /** Aritmética exata: soma menos teto. Só o dinheiro é estimativa. */
  baseExcedenteCentavos: number;
  retidoCentavos: number;
  devidoCentavos: number;
  /** Estimativa para CLT e prestador; leitura para recolhimento próprio. Ver `camadas[].lido`. */
  retidoAMaiorCentavos: number;
  camadas: Camada[];
  multiplosVinculos: boolean;
  prescricao: Prescricao;
};

export type ResultadoTeto = {
  dataReferencia: string;
  competencias: ResultadoCompetencia[];
  /** Fora do período coberto pelas tabelas. **Não é erro** — mas tem que ficar visível. */
  ignoradasSemTabela: string[];
  achados: AchadoTeto[];
  avisos: AvisoTeto[];
  resumo: {
    mesesComMultiplosVinculos: number;
    mesesAcimaDoTeto: number;
    /** Só competências com `prescricao.noPrazo`. */
    totalAPedirCentavos: number;
    totalPrescritoCentavos: number;
  };
};
