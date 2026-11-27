import { describe, expect, it } from 'vitest';
import fixture from '../cnis/__fixtures__/extrato-exemplo.textlayer.json';
import { montarExtrato } from '../cnis/parse-cnis';
import type { CnisExtrato, Contribuicao, Remuneracao, TextItem, Vinculo } from '../cnis/types';
import { agruparPorCompetencia } from './competencias';

const extratoCom = (...vinculos: Vinculo[]): CnisExtrato => ({ filiado: {}, vinculos, legenda: [] });

const rem = (competencia: string, valorCentavos: number, indicadores: string[] = []): Remuneracao => ({
  competencia,
  valorCentavos,
  indicadores,
});

const contrib = (
  competencia: string,
  contribuicaoCentavos: number,
  salarioContribuicaoCentavos: number,
  indicadores: string[] = [],
): Contribuicao => ({ competencia, contribuicaoCentavos, salarioContribuicaoCentavos, indicadores });

const clt = (seq: number, ...remuneracoes: Remuneracao[]): Vinculo => ({
  seq,
  tipoFiliado: 'Empregado ou Agente Público',
  natureza: 'CLT',
  remuneracoes,
});

const prestador = (seq: number, ...remuneracoes: Remuneracao[]): Vinculo => ({
  seq,
  tipoFiliado: 'Contribuinte Individual',
  natureza: 'CI_PRESTADOR',
  remuneracoes,
});

const proprio = (seq: number, ...contribuicoes: Contribuicao[]): Vinculo => ({
  seq,
  tipoFiliado: 'Contribuinte Individual',
  natureza: 'CI_PROPRIO',
  contribuicoes,
});

describe('agruparPorCompetencia', () => {
  it('soma fontes de vínculos diferentes no mesmo mês, separadas por natureza', () => {
    const { competencias } = agruparPorCompetencia(
      extratoCom(clt(1, rem('08/2024', 500000)), prestador(2, rem('08/2024', 400000))),
    );
    expect(competencias).toHaveLength(1);
    expect(competencias[0].clt.map((f) => f.baseCentavos)).toEqual([500000]);
    expect(competencias[0].prestador.map((f) => f.baseCentavos)).toEqual([400000]);
    expect(competencias[0].proprio).toEqual([]);
  });

  it('competência duplicada DENTRO de um vínculo CLT não dobra a base: fica a primeira e sai aviso', () => {
    const { competencias, avisos } = agruparPorCompetencia(
      extratoCom(clt(1, rem('08/2024', 500000), rem('08/2024', 500000))),
    );
    expect(competencias[0].clt).toHaveLength(1);
    expect(competencias[0].clt[0].baseCentavos).toBe(500000);
    expect(avisos).toEqual([
      expect.objectContaining({ codigo: 'DUPLICADA_DESCARTADA', competencia: '08/2024' }),
    ]);
  });

  it('competência duplicada DENTRO de um vínculo de recolhimento próprio soma: duas guias no mês somam de verdade', () => {
    const { competencias, avisos } = agruparPorCompetencia(
      extratoCom(proprio(1, contrib('08/2024', 5225, 104500), contrib('08/2024', 5225, 104500))),
    );
    expect(competencias[0].proprio).toHaveLength(2);
    expect(avisos).toEqual([]);
  });

  it('duas fontes CLT no mesmo mês em vínculos diferentes são duas fontes, não duplicata', () => {
    const extrato = extratoCom(clt(1, rem('08/2024', 500000)), clt(2, rem('08/2024', 450000)));
    expect(agruparPorCompetencia(extrato).competencias[0].clt).toHaveLength(2);
    expect(agruparPorCompetencia(extrato).avisos).toEqual([]);
  });

  it('13/AAAA é competência própria e não soma com 12/AAAA', () => {
    const { competencias } = agruparPorCompetencia(
      extratoCom(clt(1, rem('12/2024', 500000), rem('13/2024', 500000))),
    );
    expect(competencias.map((c) => c.competencia)).toEqual(['12/2024', '13/2024']);
    expect(competencias.map((c) => c.decimoTerceiro)).toEqual([false, true]);
  });

  it('ordena por competência crescente, com o 13º depois de dezembro', () => {
    const { competencias } = agruparPorCompetencia(
      extratoCom(clt(1, rem('13/2023', 100), rem('02/2024', 100), rem('12/2023', 100), rem('01/2024', 100))),
    );
    expect(competencias.map((c) => c.competencia)).toEqual(['12/2023', '13/2023', '01/2024', '02/2024']);
  });

  it('competência malformada vira aviso e não entra em grupo nenhum', () => {
    const { competencias, avisos } = agruparPorCompetencia(
      extratoCom(clt(1, rem('', 100), rem('00/2024', 100), rem('14/2024', 100), rem('08/2024', 500000))),
    );
    expect(competencias.map((c) => c.competencia)).toEqual(['08/2024']);
    expect(avisos.map((a) => a.codigo)).toEqual([
      'COMPETENCIA_INVALIDA',
      'COMPETENCIA_INVALIDA',
      'COMPETENCIA_INVALIDA',
    ]);
  });

  it('extrato sem vínculo e vínculo sem competências devolvem listas vazias', () => {
    expect(agruparPorCompetencia({ filiado: {}, vinculos: [], legenda: [] }).competencias).toEqual([]);
    expect(agruparPorCompetencia(extratoCom(clt(1), proprio(2))).competencias).toEqual([]);
  });

  it('não lê o extrato real para calcular, mas aguenta sua forma', () => {
    const { extrato } = montarExtrato(fixture as TextItem[]);
    const { competencias } = agruparPorCompetencia(extrato);
    expect(competencias.length).toBeGreaterThan(0);
    for (const c of competencias) {
      expect(c.competencia).toMatch(/^(0[1-9]|1[0-3])\/\d{4}$/);
      expect(c.clt.length + c.prestador.length + c.proprio.length).toBeGreaterThan(0);
    }
  });
});
