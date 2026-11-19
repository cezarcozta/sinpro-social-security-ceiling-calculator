import { describe, expect, it } from 'vitest';
import { tabelaDe, VIGENCIAS } from './tabelas';

describe('tabelaDe', () => {
  it('resolve pela competência, não pelo ano: 04/2023 e 05/2023 têm vigências diferentes', () => {
    expect(tabelaDe('04/2023')?.vigencia).toBe('2023-01');
    expect(tabelaDe('05/2023')?.vigencia).toBe('2023-05');
    expect(tabelaDe('04/2023')?.faixas[0][0]).toBe(130200);
    expect(tabelaDe('05/2023')?.faixas[0][0]).toBe(132000);
    expect(tabelaDe('05/2023')?.tetoCentavos).toBe(tabelaDe('04/2023')?.tetoCentavos);
  });

  it('o 13º usa a tabela de dezembro do mesmo ano', () => {
    expect(tabelaDe('13/2024')?.vigencia).toBe(tabelaDe('12/2024')?.vigencia);
  });

  it('devolve null fora do período coberto', () => {
    expect(tabelaDe('12/2020')).toBeNull();
    expect(tabelaDe('01/2027')).toBeNull();
  });

  it('devolve null para competência malformada', () => {
    for (const lixo of ['', '2024', '00/2024', '14/2024', 'ab/2024', '01/20x4']) {
      expect(tabelaDe(lixo)).toBeNull();
    }
  });

  it('cada tabela tem a última faixa terminando no teto e alíquotas crescentes', () => {
    for (const t of VIGENCIAS) {
      expect(t.faixas.at(-1)![0]).toBe(t.tetoCentavos);
      const topos = t.faixas.map(([topo]) => topo);
      const bps = t.faixas.map(([, b]) => b);
      expect(topos).toEqual([...topos].sort((a, b) => a - b));
      expect(bps).toEqual([...bps].sort((a, b) => a - b));
      expect(topos.every(Number.isInteger) && bps.every(Number.isInteger)).toBe(true);
    }
  });
});

/**
 * Teste de fixação, não de desenvolvimento: os valores abaixo foram conferidos em fonte
 * primária em 19/11/2026 (texto das portarias e páginas oficiais do INSS), e este teste
 * existe para que uma edição futura não os troque em silêncio. Ele passou na primeira
 * execução, por construção — o que ele prova não é que o código funciona, é que estes são
 * exatamente os números publicados.
 */
describe('as sete vigências, valor por valor, como publicadas', () => {
  const PUBLICADAS: Array<[string, number, number[]]> = [
    // vigência,  teto,   limites das quatro faixas (7,5% / 9% / 12% / 14%)
    ['2021-01', 643357, [110000, 220348, 330522, 643357]], // SEPRT/ME 477, de 12/01/2021
    ['2022-01', 708722, [121200, 242735, 364103, 708722]], // MTP/ME 12, de 17/01/2022
    ['2023-01', 750749, [130200, 257129, 385694, 750749]], // MPS/MF 26, de 10/01/2023, Anexo II
    ['2023-05', 750749, [132000, 257129, 385694, 750749]], // MPS/MF 27, de 04/05/2023, Anexo II-A
    ['2024-01', 778602, [141200, 266668, 400003, 778602]], // MPS/MF 2, de 11/01/2024
    ['2025-01', 815741, [151800, 279388, 419083, 815741]], // MPS/MF 6, de 10/01/2025
    ['2026-01', 847555, [162100, 290284, 435427, 847555]], // MPS/MF 13, de 09/01/2026
  ];

  it('tem exatamente as sete vigências conferidas, na ordem', () => {
    expect(VIGENCIAS.map((v) => v.vigencia)).toEqual(PUBLICADAS.map(([vig]) => vig));
  });

  it.each(PUBLICADAS)('%s: teto e faixas batem com a portaria', (vigencia, teto, limites) => {
    const tabela = VIGENCIAS.find((v) => v.vigencia === vigencia)!;
    expect(tabela.tetoCentavos).toBe(teto);
    expect(tabela.faixas.map(([topo]) => topo)).toEqual(limites);
    expect(tabela.faixas.map(([, bps]) => bps)).toEqual([750, 900, 1200, 1400]);
  });
});
