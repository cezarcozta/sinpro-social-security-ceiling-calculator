import { describe, expect, it } from 'vitest';
import { detectarLayout } from './layouts';
import type { Row, TextItem } from './types';

/** Monta uma Row a partir dos rótulos, espaçando-os em x de 100 em 100. */
function cabecalho(...nomes: string[]): Row {
  const items: TextItem[] = nomes.map((str, i) => ({ page: 1, x: 100 + i * 100, y: 500, str }));
  return { page: 1, y: 500, items };
}

const CLT = ['Competência', 'Remuneração', 'Indicadores'];
const PROPRIO = ['Competência', 'Data Pgto.', 'Contribuição', 'Salário Contribuição', 'Indicadores'];
const PRESTADOR = [
  'Competência', 'Contrat.', 'Estabelecimento', 'Tomador', 'Forma Prestação Serviço',
  'Remuneração', 'Indicadores',
];

describe('detectarLayout', () => {
  it('reconhece a tabela CLT em 3 grupos e numera os grupos', () => {
    const detectado = detectarLayout(cabecalho(...CLT, ...CLT, ...CLT));
    expect(detectado?.natureza).toBe('CLT');
    expect(detectado?.colunas).toHaveLength(9);
    expect(detectado?.colunas.map((c) => c.grupo)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
  });

  it('reconhece a tabela de recolhimento próprio em 2 grupos', () => {
    const detectado = detectarLayout(cabecalho(...PROPRIO, ...PROPRIO));
    expect(detectado?.natureza).toBe('CI_PROPRIO');
    expect(detectado?.colunas).toHaveLength(10);
    expect(detectado?.colunas[2].nome).toBe('Contribuição');
    expect(detectado?.colunas[7].grupo).toBe(1);
  });

  it('reconhece a tabela de prestador de serviço em 1 grupo', () => {
    const detectado = detectarLayout(cabecalho(...PRESTADOR));
    expect(detectado?.natureza).toBe('CI_PRESTADOR');
    expect(detectado?.colunas).toHaveLength(7);
    expect(detectado?.colunas.map((c) => c.nome)).toEqual(PRESTADOR);
  });

  it('devolve null para cabeçalho desconhecido', () => {
    expect(detectarLayout(cabecalho('Competência', 'Salário', 'Outra'))).toBeNull();
  });

  it('devolve null para cabeçalho vazio', () => {
    expect(detectarLayout({ page: 1, y: 0, items: [] })).toBeNull();
  });

  it('não confunde layouts: 7 colunas não casam com o layout CLT de 3', () => {
    expect(detectarLayout(cabecalho(...PRESTADOR))?.natureza).not.toBe('CLT');
  });
});
