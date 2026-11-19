import { describe, expect, it } from 'vitest';
import { agruparPorAno } from './anos';
import { RESULTADO_GATILHOS, RESULTADO_VAZIO } from './__fixtures__/gatilhos';

describe('agruparPorAno', () => {
  it('ordena ano mais recente primeiro', () => {
    expect(agruparPorAno(RESULTADO_GATILHOS).map((g) => g.ano)).toEqual([2026, 2025, 2024, 2021]);
  });

  it('dentro do ano, ordena por mês e deixa o 13º por último', () => {
    const g2024 = agruparPorAno(RESULTADO_GATILHOS).find((g) => g.ano === 2024)!;
    expect(g2024.meses.map((m) => m.competencia)).toEqual(['08/2024', '12/2024', '13/2024']);
  });

  it('o 13º não soma com dezembro: duas linhas no mesmo cartão', () => {
    const g2024 = agruparPorAno(RESULTADO_GATILHOS).find((g) => g.ano === 2024)!;
    const dezembro = g2024.meses.find((m) => m.competencia === '12/2024')!;
    const decimo = g2024.meses.find((m) => m.competencia === '13/2024')!;
    expect(dezembro.somaBaseCentavos).toBe(700000);
    expect(decimo.somaBaseCentavos).toBe(800000);
    expect(decimo.decimoTerceiro).toBe(true);
  });

  it('conta meses acima do teto por competência distinta', () => {
    const porAno = agruparPorAno(RESULTADO_GATILHOS);
    expect(porAno.find((g) => g.ano === 2024)!.mesesAcimaDoTeto).toBe(2);
    expect(porAno.find((g) => g.ano === 2021)!.mesesAcimaDoTeto).toBe(2);
  });

  it('ano sem nenhum mês acima do teto aparece, com zero', () => {
    const g2025 = agruparPorAno(RESULTADO_GATILHOS).find((g) => g.ano === 2025)!;
    expect(g2025.mesesAcimaDoTeto).toBe(0);
    expect(g2025.totalAPedirCentavos).toBe(0);
  });

  it('separa total a pedir de total prescrito, dentro do ano', () => {
    const g2021 = agruparPorAno(RESULTADO_GATILHOS).find((g) => g.ano === 2021)!;
    expect(g2021.totalAPedirCentavos).toBe(3100);
    expect(g2021.totalPrescritoCentavos).toBe(2000);
  });

  it('marca o ano que tem mês urgente', () => {
    const porAno = agruparPorAno(RESULTADO_GATILHOS);
    expect(porAno.find((g) => g.ano === 2021)!.temUrgente).toBe(true);
    expect(porAno.find((g) => g.ano === 2024)!.temUrgente).toBe(false);
  });

  it('não depende da ordem de entrada', () => {
    const invertido = {
      ...RESULTADO_GATILHOS,
      competencias: [...RESULTADO_GATILHOS.competencias].reverse(),
    };
    expect(agruparPorAno(invertido)).toEqual(agruparPorAno(RESULTADO_GATILHOS));
  });

  it('resultado sem competência devolve lista vazia', () => {
    expect(agruparPorAno(RESULTADO_VAZIO)).toEqual([]);
  });
});
