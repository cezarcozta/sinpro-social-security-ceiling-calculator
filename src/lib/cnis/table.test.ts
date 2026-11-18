import { describe, expect, it } from 'vitest';
import { agruparEmLinhas } from './rows';
import { celulasPorGrupo, colunasDoCabecalho, mapearColunas, parseValorCentavos } from './table';
import type { TextItem } from './types';

const linhaDe = (pares: Array<[number, string]>, y = 100, page = 1): ReturnType<typeof agruparEmLinhas>[number] => {
  const items: TextItem[] = pares.map(([x, str]) => ({ page, x, y, str }));
  return agruparEmLinhas(items)[0];
};

const CABECALHO_CLT = linhaDe([
  [43, 'Competência'], [131, 'Remuneração'], [221, 'Indicadores'],
  [306, 'Competência'], [394, 'Remuneração'], [484, 'Indicadores'],
  [567, 'Competência'], [655, 'Remuneração'], [747, 'Indicadores'],
]);

describe('mapearColunas', () => {
  it('reconhece os três grupos da tabela de remunerações CLT', () => {
    const colunas = mapearColunas(CABECALHO_CLT, ['Competência', 'Remuneração', 'Indicadores']);
    expect(colunas).not.toBeNull();
    expect(colunas).toHaveLength(9);
    expect(colunas!.map((c) => c.grupo)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(colunas![4]).toEqual({ nome: 'Remuneração', x: 394, grupo: 1 });
  });

  it('reconhece um cabeçalho de grupo único', () => {
    const colunas = mapearColunas(linhaDe([[43, 'Competência'], [131, 'Remuneração'], [221, 'Indicadores']]), [
      'Competência', 'Remuneração', 'Indicadores',
    ]);
    expect(colunas!.map((c) => c.grupo)).toEqual([0, 0, 0]);
  });

  it('devolve null quando o cabeçalho não bate com o esperado', () => {
    const outro = linhaDe([
      [47, 'Competência'], [157, 'Contrat.'], [248, 'Estabelecimento'],
      [383, 'Tomador'], [482, 'Forma Prestação Serviço'], [619, 'Remuneração'], [733, 'Indicadores'],
    ]);
    expect(mapearColunas(outro, ['Competência', 'Remuneração', 'Indicadores'])).toBeNull();
  });

  it('devolve null quando a contagem não é múltiplo do grupo', () => {
    expect(mapearColunas(linhaDe([[43, 'Competência'], [131, 'Remuneração']]), ['Competência', 'Remuneração', 'Indicadores'])).toBeNull();
  });

  it('devolve null quando a contagem é múltiplo do grupo mas um rótulo está trocado', () => {
    const trocado = linhaDe([
      [43, 'Competência'], [131, 'Remuneração'], [221, 'Foo'],
      [306, 'Competência'], [394, 'Remuneração'], [484, 'Indicadores'],
      [567, 'Competência'], [655, 'Remuneração'], [747, 'Indicadores'],
    ]);
    expect(mapearColunas(trocado, ['Competência', 'Remuneração', 'Indicadores'])).toBeNull();
  });

  it('devolve null quando os rótulos corretos estão em ordem diferente', () => {
    const foraDeOrdem = linhaDe([
      [43, 'Competência'], [131, 'Indicadores'], [221, 'Remuneração'],
      [306, 'Competência'], [394, 'Indicadores'], [484, 'Remuneração'],
      [567, 'Competência'], [655, 'Indicadores'], [747, 'Remuneração'],
    ]);
    expect(mapearColunas(foraDeOrdem, ['Competência', 'Remuneração', 'Indicadores'])).toBeNull();
  });
});

describe('colunasDoCabecalho', () => {
  it('usa cada rótulo como uma coluna do grupo 0', () => {
    const colunas = colunasDoCabecalho(linhaDe([[35, 'Seq.'], [87, 'NIT'], [152, 'Código Emp.']]));
    expect(colunas).toEqual([
      { nome: 'Seq.', x: 35, grupo: 0 },
      { nome: 'NIT', x: 87, grupo: 0 },
      { nome: 'Código Emp.', x: 152, grupo: 0 },
    ]);
  });
});

describe('celulasPorGrupo', () => {
  const colunas = mapearColunas(CABECALHO_CLT, ['Competência', 'Remuneração', 'Indicadores'])!;

  it('separa as três competências de uma linha da tabela CLT', () => {
    const grupos = celulasPorGrupo(
      linhaDe([[55, '03/2017'], [148, '366,67'], [318, '04/2017'], [407, '1.025,18'], [579, '05/2017'], [668, '1.300,00']]),
      colunas,
    );
    expect(grupos).toEqual([
      { 'Competência': '03/2017', 'Remuneração': '366,67' },
      { 'Competência': '04/2017', 'Remuneração': '1.025,18' },
      { 'Competência': '05/2017', 'Remuneração': '1.300,00' },
    ]);
  });

  it('devolve apenas os grupos preenchidos quando a linha é parcial', () => {
    const grupos = celulasPorGrupo(linhaDe([[55, '12/2017'], [144, '1.478,15']]), colunas);
    expect(grupos).toEqual([{ 'Competência': '12/2017', 'Remuneração': '1.478,15' }]);
  });

  it('inclui indicadores quando presentes', () => {
    const grupos = celulasPorGrupo(linhaDe([[55, '06/2018'], [144, '658,58'], [228, 'IREM-INDPEND']]), colunas);
    expect(grupos).toEqual([{ 'Competência': '06/2018', 'Remuneração': '658,58', 'Indicadores': 'IREM-INDPEND' }]);
  });

  it('concatena com espaço dois itens que caem na mesma coluna', () => {
    const colunasVinculo = colunasDoCabecalho(linhaDe([[35, 'Seq.'], [582, 'Vínculo']]));
    const grupos = celulasPorGrupo(linhaDe([[554, 'Empregado ou Agente'], [585, 'Público']]), colunasVinculo);
    expect(grupos).toEqual([{ 'Vínculo': 'Empregado ou Agente Público' }]);
  });
});

describe('celulasPorGrupo com colunas fora de ordem', () => {
  it('ordena as colunas por x antes de calcular as fronteiras', () => {
    const colunas = mapearColunas(linhaDe([[43, 'Competência'], [131, 'Remuneração'], [221, 'Indicadores']]), [
      'Competência', 'Remuneração', 'Indicadores',
    ])!;
    const embaralhadas = [colunas[2], colunas[0], colunas[1]];
    const grupos = celulasPorGrupo(linhaDe([[55, '06/2018'], [144, '658,58']]), embaralhadas);
    expect(grupos).toEqual([{ 'Competência': '06/2018', 'Remuneração': '658,58' }]);
  });
});

describe('parseValorCentavos', () => {
  it.each([
    ['366,67', 36667],
    ['1.300,00', 130000],
    ['10.428,53', 1042853],
    ['0,00', 0],
  ])('converte %s em %i centavos', (texto, esperado) => {
    expect(parseValorCentavos(texto)).toBe(esperado);
  });

  it.each(['', 'abc', '1.300', '1300,0', '7.507,49 *'])('rejeita %s', (texto) => {
    expect(parseValorCentavos(texto)).toBeNull();
  });
});
