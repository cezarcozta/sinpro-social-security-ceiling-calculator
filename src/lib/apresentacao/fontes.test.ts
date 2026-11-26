import { describe, expect, it } from 'vitest';
import { fontesPorCompetencia } from './fontes';
import { PARSE_GATILHOS, RESULTADO_GATILHOS } from './__fixtures__/gatilhos';
import type { CnisExtrato } from '@/lib/cnis';

describe('fontesPorCompetencia', () => {
  const fontes = fontesPorCompetencia(PARSE_GATILHOS.extrato);

  it('separa as fontes pagadoras do mês, com o rótulo do empregador', () => {
    expect(fontes.get('08/2024')).toEqual([
      { rotulo: '11.111.111/0001-11', natureza: 'CLT', valorCentavos: 500000, lido: false },
      { rotulo: '22.222.222/0001-22', natureza: 'CLT', valorCentavos: 450000, lido: false },
    ]);
  });

  it('distingue camada lida de camada estimada', () => {
    const setembro = fontes.get('09/2026')!;
    expect(setembro.find((f) => f.natureza === 'CLT')!.lido).toBe(false);
    expect(setembro.find((f) => f.natureza === 'CI_PROPRIO')).toEqual({
      rotulo: '98.765.432',
      natureza: 'CI_PROPRIO',
      valorCentavos: 300000,
      lido: true,
    });
  });

  it('competência repetida na mesma tabela de salário não dobra a base', () => {
    const doVinculo2 = fontes.get('08/2024')!.filter((f) => f.rotulo === '22.222.222/0001-22');
    expect(doVinculo2).toHaveLength(1);
    expect(doVinculo2[0].valorCentavos).toBe(450000);
  });

  it('duas guias de recolhimento próprio no mesmo mês somam', () => {
    const extrato: CnisExtrato = {
      filiado: {},
      legenda: [],
      vinculos: [
        {
          seq: 1,
          codigoEmp: '98.765.432',
          tipoFiliado: 'Contribuinte Individual',
          natureza: 'CI_PROPRIO',
          contribuicoes: [
            {
              competencia: '03/2025',
              contribuicaoCentavos: 5000,
              salarioContribuicaoCentavos: 100000,
              indicadores: [],
            },
            {
              competencia: '03/2025',
              contribuicaoCentavos: 5000,
              salarioContribuicaoCentavos: 150000,
              indicadores: [],
            },
          ],
        },
      ],
    };
    expect(fontesPorCompetencia(extrato).get('03/2025')![0].valorCentavos).toBe(250000);
  });

  it('vínculo sem código de empregador recebe rótulo pelo número do vínculo', () => {
    const extrato: CnisExtrato = {
      filiado: {},
      legenda: [],
      vinculos: [
        {
          seq: 7,
          tipoFiliado: 'Empregado',
          natureza: 'CLT',
          remuneracoes: [{ competencia: '01/2026', valorCentavos: 100, indicadores: [] }],
        },
      ],
    };
    expect(fontesPorCompetencia(extrato).get('01/2026')![0].rotulo).toBe('vínculo 7');
  });

  it('a soma das fontes bate com a base que o motor calculou, em toda competência', () => {
    for (const competencia of RESULTADO_GATILHOS.competencias) {
      const soma = (fontes.get(competencia.competencia) ?? []).reduce(
        (total, f) => total + f.valorCentavos,
        0,
      );
      expect(soma, competencia.competencia).toBe(competencia.somaBaseCentavos);
    }
  });

  it('extrato sem vínculo devolve mapa vazio', () => {
    expect(fontesPorCompetencia({ filiado: {}, vinculos: [], legenda: [] }).size).toBe(0);
  });
});
