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
