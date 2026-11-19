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
 * Aviso do motor. Nunca silêncio: linha que não entendemos, dado descartado ou base
 * ausente sai aqui, e a F3 exibe (regra "falhar aberto", §9 da spec).
 */
export type AvisoTeto = { codigo: string; competencia: string; detalhe: string };
