import { describe, expect, it } from 'vitest';
import { rodarCascata } from './cascata';
import type { BasesDaCompetencia, FonteContribuinte, FonteRemunerada } from './competencias';
import { tabelaDe } from './tabelas';

const T2024 = tabelaDe('08/2024')!;

const fonteRem = (baseCentavos: number, seq: number, indicadores: string[] = []): FonteRemunerada => ({
  seq,
  baseCentavos,
  indicadores,
});

const bases = (partes: Partial<BasesDaCompetencia>): BasesDaCompetencia => ({
  competencia: '08/2024',
  decimoTerceiro: false,
  clt: [],
  prestador: [],
  proprio: [],
  ...partes,
});

const basesClt = (...valores: number[]): BasesDaCompetencia =>
  bases({ clt: valores.map((v, i) => fonteRem(v, i + 1)) });

const basesPrestador = (...valores: number[]): BasesDaCompetencia =>
  bases({ prestador: valores.map((v, i) => fonteRem(v, i + 1)) });

const basesMistas = (p: { clt: number[]; prestador: number[] }): BasesDaCompetencia =>
  bases({
    clt: p.clt.map((v, i) => fonteRem(v, i + 1)),
    prestador: p.prestador.map((v, i) => fonteRem(v, i + 10)),
  });

const basesProprio = (p: {
  contribuicao: number;
  salario: number;
  indicadores?: string[];
}): BasesDaCompetencia => {
  const fonte: FonteContribuinte = {
    seq: 1,
    contribuicaoCentavos: p.contribuicao,
    salarioContribuicaoCentavos: p.salario,
    indicadores: p.indicadores ?? [],
  };
  return bases({ proprio: [fonte] });
};

describe('rodarCascata', () => {
  it('reproduz o exemplo da spec: 5.000 + 4.500 CLT em 08/2024', () => {
    const r = rodarCascata(basesClt(500000, 450000), T2024);
    expect(r.retidoCentavos).toBe(96764); // 518,82 + 448,82
    expect(r.devidoCentavos).toBe(90886); // progressivo(teto)
    expect(r.retidoAMaiorCentavos).toBe(5878); // 58,78 — e NÃO os 239,96 da AGENTS.md
  });

  it('vínculo CLT único acima do teto dá zero: o empregador descontou certo', () => {
    expect(rodarCascata(basesClt(900000), T2024).retidoAMaiorCentavos).toBe(0);
  });

  it('vínculo de prestador único acima do teto também dá zero', () => {
    expect(rodarCascata(basesPrestador(900000), T2024).retidoAMaiorCentavos).toBe(0);
  });

  it('soma exatamente igual ao teto dá zero', () => {
    expect(rodarCascata(basesClt(400000, 378602), T2024).retidoAMaiorCentavos).toBe(0);
  });

  it('CLT abaixo do teto mais prestador: o excesso é todo da camada do prestador', () => {
    const r = rodarCascata(basesMistas({ clt: [500000], prestador: [400000] }), T2024);
    const clt = r.camadas.find((c) => c.natureza === 'CLT')!;
    const prestador = r.camadas.find((c) => c.natureza === 'CI_PRESTADOR')!;
    expect(clt.retidoCentavos - clt.devidoCentavos).toBe(0);
    expect(prestador.retidoCentavos).toBe(44000); // 11% de 4.000,00
    expect(prestador.devidoCentavos).toBe(30646); // 11% da margem de 2.786,02
    expect(r.retidoAMaiorCentavos).toBe(13354);
  });

  it('recolhimento próprio é LEITURA, não estimativa', () => {
    const r = rodarCascata(basesProprio({ contribuicao: 5225, salario: 104500 }), T2024);
    const propria = r.camadas.find((c) => c.natureza === 'CI_PROPRIO')!;
    expect(propria.retidoCentavos).toBe(5225); // o valor escrito no extrato
    expect(propria.lido).toBe(true);
  });

  it('CLT e prestador vêm rotulados como estimativa', () => {
    const r = rodarCascata(basesMistas({ clt: [500000], prestador: [400000] }), T2024);
    expect(r.camadas.every((c) => c.lido === false)).toBe(true);
  });

  it('divergência entre a alíquota paga e a que o indicador promete emite aviso, nunca silêncio', () => {
    const r = rodarCascata(
      basesProprio({ contribuicao: 11495, salario: 104500, indicadores: ['IREC-MEI'] }),
      T2024,
    );
    expect(r.avisos).toEqual([expect.objectContaining({ codigo: 'ALIQUOTA_DIVERGENTE' })]);
  });

  it('salário de contribuição zero não vira Infinity nem NaN: aviso e camada em zero', () => {
    const r = rodarCascata(basesProprio({ contribuicao: 5225, salario: 0 }), T2024);
    expect(r.camadas.find((c) => c.natureza === 'CI_PROPRIO')!.devidoCentavos).toBe(0);
    expect(Number.isFinite(r.retidoAMaiorCentavos)).toBe(true);
    expect(r.avisos.map((a) => a.codigo)).toContain('BASE_AUSENTE');
  });

  it('retidoAMaior nunca é negativo', () => {
    expect(rodarCascata(basesClt(100000), T2024).retidoAMaiorCentavos).toBe(0);
  });

  it('camada sem fonte nenhuma não entra em camadas', () => {
    expect(rodarCascata(basesClt(500000), T2024).camadas.map((c) => c.natureza)).toEqual(['CLT']);
    expect(rodarCascata(bases({}), T2024).camadas).toEqual([]);
  });

  it('margemFinalCentavos é o que sobra do teto depois das duas primeiras camadas', () => {
    expect(rodarCascata(bases({}), T2024).margemFinalCentavos).toBe(778602);
    expect(rodarCascata(basesClt(500000), T2024).margemFinalCentavos).toBe(278602);
    expect(rodarCascata(basesMistas({ clt: [500000], prestador: [400000] }), T2024).margemFinalCentavos).toBe(0);
    expect(rodarCascata(basesClt(900000), T2024).margemFinalCentavos).toBe(0);
  });
});
