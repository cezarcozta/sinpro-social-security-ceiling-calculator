import { mapearColunas, type Coluna } from './table';
import type { NaturezaVinculo, Row } from './types';

export type LayoutDetectado = { natureza: NaturezaVinculo; colunas: Coluna[] };

/** Rótulos exatos de cada layout, na ordem em que o CNIS os publica. */
export const NOMES_LAYOUT: Record<NaturezaVinculo, string[]> = {
  CLT: ['Competência', 'Remuneração', 'Indicadores'],
  CI_PROPRIO: ['Competência', 'Data Pgto.', 'Contribuição', 'Salário Contribuição', 'Indicadores'],
  CI_PRESTADOR: [
    'Competência',
    'Contrat.',
    'Estabelecimento',
    'Tomador',
    'Forma Prestação Serviço',
    'Remuneração',
    'Indicadores',
  ],
};

/**
 * Ordem de tentativa do mais específico para o menos: um cabeçalho de 7 colunas não casa
 * com o layout de 3 (7 % 3 !== 0), então não há ambiguidade, mas manter a ordem explícita
 * documenta a intenção caso um layout novo apareça.
 */
const ORDEM: NaturezaVinculo[] = ['CI_PRESTADOR', 'CI_PROPRIO', 'CLT'];

export function detectarLayout(cabecalho: Row): LayoutDetectado | null {
  for (const natureza of ORDEM) {
    const colunas = mapearColunas(cabecalho, NOMES_LAYOUT[natureza]);
    if (colunas) return { natureza, colunas };
  }
  return null;
}
